import type {
  IndexedAsset,
  IndexedPortfolio,
  IndexedPortfolioResourceAsset,
  IndexWarning,
  ParsedExerciseIdentity,
  ParsedSolutionFile,
  SolutionVariantKind,
} from "@/lib/domain";
import {
  comparePortfolioIds,
  findExerciseNumberCandidates,
  normalizePortfolioCode,
  parseExerciseDirectoryIdentity,
  parsePortfolioDirectory,
  parseSectionDirectory,
} from "@/lib/parser";
import {
  BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
  firstExerciseResourceBySemanticRole,
  firstSourceFileGlobalResourceBySemanticRole,
  sortExerciseResources,
  sortGlobalResources,
  exerciseResourceFileExtensions,
  type ExerciseResourceConfig,
  type ExerciseResourceFileExtension,
  type ExerciseResourceFileNameMatchOperator,
  type ExerciseScannerConfig,
  type GlobalResourceFileMatchOperator,
  type SourceFileGlobalResource,
  type SourceProfileConfig,
} from "@/lib/source-profile-config";
import type { StorageEntry, StorageProvider } from "@/lib/storage/provider";

function canonicalName(value: string): string {
  return value.toLocaleLowerCase("nl");
}

export async function indexSource(
  provider: StorageProvider,
  sourceProfileConfig: SourceProfileConfig = BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
): Promise<IndexedPortfolio[]> {
  const rootEntries = await provider.list();
  const portfolios: IndexedPortfolio[] = [];
  const globalResources = sortGlobalResources(sourceProfileConfig.globalResources)
    .filter((resource): resource is SourceFileGlobalResource => resource.kind === "source_file");
  const exerciseResources = sortExerciseResources(sourceProfileConfig.exerciseResources);
  const legacyExerciseVariants = legacyExerciseResourceVariants(exerciseResources);

  for (const entry of [...rootEntries].sort(compareEntries)) {
    if (entry.kind !== "directory") continue;
    const parsedPortfolio = parsePortfolioDirectory(entry.name);
    if (!parsedPortfolio) continue;
    portfolios.push(await indexPortfolio(
      provider,
      entry,
      parsedPortfolio.code,
      parsedPortfolio.title,
      globalResources,
      exerciseResources,
      legacyExerciseVariants,
      sourceProfileConfig.scanner.exercise,
    ));
  }

  return portfolios.sort((a, b) => comparePortfolioIds(a.code, b.code));
}

async function indexPortfolio(
  provider: StorageProvider,
  directory: StorageEntry,
  code: string,
  title: string,
  globalResources: readonly SourceFileGlobalResource[],
  exerciseResources: readonly ExerciseResourceConfig[],
  legacyExerciseVariants: ReadonlyMap<string, SolutionVariantKind>,
  scanner: ExerciseScannerConfig,
): Promise<IndexedPortfolio> {
  const warnings: IndexWarning[] = [];
  const entries = [...await provider.list(directory.relativePath)].sort(compareEntries);
  const matchedGlobalResources = resolveGlobalResources(entries, globalResources, directory.relativePath, warnings);
  const assignmentResource = firstSourceFileGlobalResourceBySemanticRole(globalResources, "assignment");
  const hintsResource = firstSourceFileGlobalResourceBySemanticRole(globalResources, "hint");
  const finalAnswerResource = firstSourceFileGlobalResourceBySemanticRole(globalResources, "final_answer");
  const assignmentDocument = assignmentResource ? matchedGlobalResources.get(assignmentResource.id) : undefined;
  const hintsDocument = hintsResource ? matchedGlobalResources.get(hintsResource.id) : undefined;
  const finalSolutionsDocument = finalAnswerResource ? matchedGlobalResources.get(finalAnswerResource.id) : undefined;

  const contexts = await discoverExerciseContexts(provider, directory, entries);
  const sections = await Promise.all(contexts.map((context) => indexExerciseContext(
    provider,
    context,
    code,
    warnings,
    exerciseResources,
    legacyExerciseVariants,
    scanner,
  )));

  return {
    code,
    title,
    relativePath: directory.relativePath,
    assignmentPdfPath: assignmentDocument?.relativePath ?? null,
    assignmentPdfSourceId: assignmentDocument?.sourceId ?? null,
    hintsDocumentPath: hintsDocument?.relativePath ?? null,
    hintsDocumentSourceId: hintsDocument?.sourceId ?? null,
    finalSolutionsPdfPath: finalSolutionsDocument?.relativePath ?? null,
    finalSolutionsPdfSourceId: finalSolutionsDocument?.sourceId ?? null,
    resourceAssets: globalResources.flatMap((resource) => {
      const entry = matchedGlobalResources.get(resource.id);
      if (!entry) return [];
      const descriptor = fileNameParts(entry.name);
      if (!descriptor) return [];
      return [{
        resourceId: resource.id,
        semanticRole: resource.semanticRole,
        relativePath: entry.relativePath,
        sourceId: entry.sourceId ?? entry.relativePath,
        fileName: entry.name,
        extension: descriptor.extension,
        lastModifiedAt: entry.lastModifiedAt ?? null,
        sourceVersion: entry.sourceVersion ?? null,
      } satisfies IndexedPortfolioResourceAsset];
    }),
    sections: sections.sort((left, right) => left.order - right.order),
    warnings,
  };
}

interface ExerciseContext {
  order: number;
  title: string;
  relativePath: string;
  implicit: boolean;
}

async function discoverExerciseContexts(
  provider: StorageProvider,
  portfolioDirectory: StorageEntry,
  rootEntries: readonly StorageEntry[],
): Promise<ExerciseContext[]> {
  const directSections = sectionContexts(rootEntries);
  if (directSections.length > 0) return directSections;

  const legacyContainer = rootEntries.find((entry) => entry.kind === "directory" && canonicalName(entry.name) === "uitwerkingen");
  if (legacyContainer) {
    const legacyEntries = [...await provider.list(legacyContainer.relativePath)].sort(compareEntries);
    const legacySections = sectionContexts(legacyEntries);
    if (legacySections.length > 0) return legacySections;
    return [{ order: 0, title: "Oefeningen", relativePath: legacyContainer.relativePath, implicit: true }];
  }

  return [{ order: 0, title: "Oefeningen", relativePath: portfolioDirectory.relativePath, implicit: true }];
}

function sectionContexts(entries: readonly StorageEntry[]): ExerciseContext[] {
  return entries.flatMap((entry) => {
    if (entry.kind !== "directory") return [];
    const section = parseSectionDirectory(entry.name);
    if (!section) return [];
    return [{ order: section.order, title: section.title, relativePath: entry.relativePath, implicit: false }];
  }).sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, "nl"));
}

interface LocatedExerciseFile {
  file: StorageEntry;
  location: "alongside" | "subdirectory";
  subdirectory: string | null;
  directoryIdentity: ParsedExerciseIdentity | null;
}

interface MatchedExerciseFile {
  file: StorageEntry;
  resource: ExerciseResourceConfig;
  identity: ParsedExerciseIdentity;
}

async function indexExerciseContext(
  provider: StorageProvider,
  context: ExerciseContext,
  portfolioCode: string,
  warnings: IndexWarning[],
  exerciseResources: readonly ExerciseResourceConfig[],
  legacyExerciseVariants: ReadonlyMap<string, SolutionVariantKind>,
  scanner: ExerciseScannerConfig,
): Promise<IndexedPortfolio["sections"][number]> {
  const files = await collectExerciseFiles(provider, context.relativePath, exerciseResources, scanner);
  const grouped = new Map<string, { resource: ExerciseResourceConfig; identity: ParsedExerciseIdentity; files: StorageEntry[] }>();

  for (const candidate of files) {
    const match = matchExerciseFile(candidate, exerciseResources, scanner, warnings);
    if (!match) continue;
    const key = `${match.identity.exerciseCode}\u0000${match.resource.id}`;
    const group = grouped.get(key) ?? { resource: match.resource, identity: match.identity, files: [] };
    if (!group.files.some((file) => file.relativePath === match.file.relativePath)) group.files.push(match.file);
    grouped.set(key, group);
  }

  const exercises = new Map<string, IndexedPortfolio["sections"][number]["exercises"][number]>();
  const resourceOrder = new Map(exerciseResources.map((resource) => [resource.id, resource.order]));

  for (const group of [...grouped.values()].sort((left, right) => compareExerciseIdentities(left.identity, right.identity)
    || left.resource.order - right.resource.order
    || left.resource.id.localeCompare(right.resource.id))) {
    const sortedFiles = group.files.sort(compareEntries);
    if (!group.resource.allowMultiple && sortedFiles.length > 1) {
      warnings.push({
        severity: "warning",
        path: context.relativePath,
        message: `Meerdere bestanden herkend voor ${group.resource.label} bij oefening ${group.identity.exerciseCode}: ${sortedFiles.map((file) => file.name).join(", ")}. Dit onderdeel laat maar één bestand toe; er is niets gekozen.`,
      });
      continue;
    }

    const exercise = exercises.get(group.identity.exerciseCode) ?? {
      code: group.identity.exerciseCode,
      number: group.identity.exerciseNumber,
      suffix: group.identity.exerciseSuffix,
      assets: [],
    };
    sortedFiles.forEach((file, index) => {
      exercise.assets.push(toIndexedExerciseAsset(file, portfolioCode, group.identity, group.resource, index + 1, legacyExerciseVariants));
    });
    exercises.set(group.identity.exerciseCode, exercise);
  }

  for (const exercise of exercises.values()) {
    exercise.assets.sort((left, right) => (resourceOrder.get(left.resourceId) ?? 999) - (resourceOrder.get(right.resourceId) ?? 999)
      || left.fileName.localeCompare(right.fileName, "nl")
      || left.relativePath.localeCompare(right.relativePath, "nl"));
  }

  return {
    order: context.order,
    title: context.title,
    relativePath: context.relativePath,
    exercises: [...exercises.values()].sort((left, right) => left.number - right.number || left.suffix.localeCompare(right.suffix, "nl")),
  };
}

async function collectExerciseFiles(
  provider: StorageProvider,
  contextPath: string,
  resources: readonly ExerciseResourceConfig[],
  scanner: ExerciseScannerConfig,
): Promise<LocatedExerciseFile[]> {
  const entries = [...await provider.list(contextPath)].sort(compareEntries);
  const configuredSubdirectories = [...new Set(resources.flatMap((resource) => resource.location.scope === "alongside_exercise" ? [] : [canonicalName(resource.location.subdirectory)]))];
  const files: LocatedExerciseFile[] = [];
  const seen = new Set<string>();

  const add = (file: StorageEntry, location: LocatedExerciseFile["location"], subdirectory: string | null, directoryIdentity: ParsedExerciseIdentity | null) => {
    if (file.kind !== "file") return;
    const key = `${file.relativePath}\u0000${directoryIdentity?.exerciseCode ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push({ file, location, subdirectory, directoryIdentity });
  };

  for (const entry of entries) if (entry.kind === "file") add(entry, "alongside", null, null);
  await collectConfiguredSubdirectoryFiles(provider, entries, configuredSubdirectories, null, add);

  for (const entry of entries) {
    if (entry.kind !== "directory") continue;
    const identity = parseExerciseDirectoryIdentity(entry.name, scanner);
    if (!identity) continue;
    const exerciseEntries = [...await provider.list(entry.relativePath)].sort(compareEntries);
    for (const child of exerciseEntries) if (child.kind === "file") add(child, "alongside", null, identity);
    await collectConfiguredSubdirectoryFiles(provider, exerciseEntries, configuredSubdirectories, identity, add);
  }

  return files.sort((left, right) => compareEntries(left.file, right.file));
}

async function collectConfiguredSubdirectoryFiles(
  provider: StorageProvider,
  entries: readonly StorageEntry[],
  subdirectories: readonly string[],
  directoryIdentity: ParsedExerciseIdentity | null,
  add: (file: StorageEntry, location: LocatedExerciseFile["location"], subdirectory: string | null, directoryIdentity: ParsedExerciseIdentity | null) => void,
): Promise<void> {
  for (const subdirectory of subdirectories) {
    const directory = entries.find((entry) => entry.kind === "directory" && canonicalName(entry.name) === subdirectory);
    if (!directory) continue;
    const children = [...await provider.list(directory.relativePath)].sort(compareEntries);
    for (const child of children) if (child.kind === "file") add(child, "subdirectory", subdirectory, directoryIdentity);
  }
}

function matchExerciseFile(
  candidate: LocatedExerciseFile,
  resources: readonly ExerciseResourceConfig[],
  scanner: ExerciseScannerConfig,
  warnings: IndexWarning[],
): MatchedExerciseFile | null {
  const descriptor = fileNameParts(candidate.file.name);
  if (!descriptor) return null;
  const extension = descriptor.extension;
  if (!isExerciseResourceFileExtension(extension)) return null;
  const filenameCandidates = candidate.directoryIdentity ? [] : findExerciseNumberCandidates(descriptor.stem, scanner);
  const directoryIdentity = candidate.directoryIdentity;
  const matches: Array<{ resource: ExerciseResourceConfig; identity: ParsedExerciseIdentity; priority: number; consumedLength: number; remainder: string; hasBoundaryAfterNumber: boolean }> = [];

  for (const resource of resources) {
    if (!resource.recognition.fileExtensions.includes(extension)) continue;
    if (!matchesResourceLocation(resource, candidate)) continue;

    if (directoryIdentity) {
      if (resource.recognition.target === "fallback") {
        matches.push({ resource, identity: directoryIdentity, priority: 1, consumedLength: directoryIdentity.exerciseCode.length, remainder: "", hasBoundaryAfterNumber: true });
      } else if (resource.recognition.target === "file_name" && matchesText(descriptor.stem, resource.recognition)) {
        matches.push({ resource, identity: directoryIdentity, priority: 2, consumedLength: directoryIdentity.exerciseCode.length, remainder: "", hasBoundaryAfterNumber: true });
      } else if (resource.recognition.target === "after_exercise_number") {
        for (const parsed of findExerciseNumberCandidates(descriptor.stem, scanner).filter((item) => item.exerciseCode === directoryIdentity.exerciseCode)) {
          if (matchesText(parsed.remainder, resource.recognition)) {
            matches.push({ resource, identity: directoryIdentity, priority: 2, consumedLength: parsed.consumedLength, remainder: parsed.remainder, hasBoundaryAfterNumber: parsed.hasBoundaryAfterNumber });
          }
        }
      }
      continue;
    }

    for (const parsed of filenameCandidates) {
      if (resource.recognition.target === "fallback") {
        matches.push({ resource, identity: parsed, priority: 1, consumedLength: parsed.consumedLength, remainder: parsed.remainder, hasBoundaryAfterNumber: parsed.hasBoundaryAfterNumber });
      } else if (resource.recognition.target === "after_exercise_number" && matchesText(parsed.remainder, resource.recognition)) {
        matches.push({ resource, identity: parsed, priority: 2, consumedLength: parsed.consumedLength, remainder: parsed.remainder, hasBoundaryAfterNumber: parsed.hasBoundaryAfterNumber });
      } else if (resource.recognition.target === "file_name" && matchesText(descriptor.stem, resource.recognition)) {
        matches.push({ resource, identity: parsed, priority: 2, consumedLength: parsed.consumedLength, remainder: parsed.remainder, hasBoundaryAfterNumber: parsed.hasBoundaryAfterNumber });
      }
    }
  }

  if (matches.length === 0) {
    if (directoryIdentity || filenameCandidates.length > 0) {
      const supportedExtension = resources.some((resource) => resource.recognition.fileExtensions.includes(extension) && matchesResourceLocation(resource, candidate));
      if (supportedExtension) warnings.push({ severity: "warning", path: candidate.file.relativePath, message: "Oefeningsbestand herkend, maar het past bij geen onderdeelregel van het bronprofiel." });
    }
    return null;
  }

  const highestPriority = Math.max(...matches.map((match) => match.priority));
  const preferred = dedupeMatches(matches.filter((match) => match.priority === highestPriority));
  const resourceIds = new Set(preferred.map((match) => match.resource.id));
  if (resourceIds.size > 1) {
    warnings.push(exerciseResourceConflictWarning(candidate.file, preferred.map((match) => match.resource)));
    return null;
  }

  const resource = preferred[0].resource;
  const identities = dedupeIdentities(preferred);
  if (identities.length === 1) return { file: candidate.file, resource, identity: identities[0].identity };

  const boundaryCandidates = identities.filter((item) => item.hasBoundaryAfterNumber);
  const pool = boundaryCandidates.length > 0 ? boundaryCandidates : identities;
  const longest = Math.max(...pool.map((item) => item.consumedLength));
  const longestCandidates = pool.filter((item) => item.consumedLength === longest);
  // A visible separator/end-of-name can safely disambiguate the longest exercise code.
  // Without such a boundary, only a rule that already reduced the candidate set to one
  // (handled above) is allowed to decide. Filename rules themselves must never turn
  // `Oef3uitwerking` into exercise `3u` merely because `3u` is the longest candidate.
  if (longestCandidates.length === 1 && boundaryCandidates.length > 0) {
    return { file: candidate.file, resource, identity: longestCandidates[0].identity };
  }

  warnings.push({
    severity: "warning",
    path: candidate.file.relativePath,
    message: `Oefeningnummer kon niet eenduidig worden bepaald (${identities.map((item) => item.identity.exerciseCode).join(", ")}). Pas de onderdeelregel of bestandsnaam aan.`,
  });
  return null;
}

function matchesResourceLocation(resource: ExerciseResourceConfig, candidate: LocatedExerciseFile): boolean {
  if (resource.location.scope === "alongside_exercise") return candidate.location === "alongside";
  const sameSubdirectory = candidate.location === "subdirectory" && canonicalName(candidate.subdirectory ?? "") === canonicalName(resource.location.subdirectory);
  return resource.location.scope === "subdirectory" ? sameSubdirectory : candidate.location === "alongside" || sameSubdirectory;
}

function matchesText(
  candidate: string,
  recognition: { operator: ExerciseResourceFileNameMatchOperator; value: string; caseSensitive: boolean },
): boolean {
  const source = recognition.caseSensitive ? candidate : canonicalName(candidate);
  const expected = recognition.caseSensitive ? recognition.value : canonicalName(recognition.value);
  switch (recognition.operator) {
    case "starts_with": return source.startsWith(expected);
    case "contains": return source.includes(expected);
    case "exact": return source === expected;
    case "ends_with": return source.endsWith(expected);
  }
}

function dedupeMatches<T extends { resource: ExerciseResourceConfig; identity: ParsedExerciseIdentity; consumedLength: number; remainder: string; hasBoundaryAfterNumber: boolean }>(matches: readonly T[]): T[] {
  const result: T[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const key = `${match.resource.id}\u0000${match.identity.exerciseCode}\u0000${match.consumedLength}\u0000${match.remainder}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
  }
  return result;
}

function dedupeIdentities(matches: readonly { identity: ParsedExerciseIdentity; consumedLength: number; remainder: string; hasBoundaryAfterNumber: boolean }[]) {
  const result: Array<{ identity: ParsedExerciseIdentity; consumedLength: number; remainder: string; hasBoundaryAfterNumber: boolean }> = [];
  const seen = new Set<string>();
  for (const match of matches) {
    if (seen.has(match.identity.exerciseCode)) continue;
    seen.add(match.identity.exerciseCode);
    result.push({ identity: match.identity, consumedLength: match.consumedLength, remainder: match.remainder, hasBoundaryAfterNumber: match.hasBoundaryAfterNumber });
  }
  return result;
}

function compareExerciseIdentities(left: ParsedExerciseIdentity, right: ParsedExerciseIdentity): number {
  return left.exerciseNumber - right.exerciseNumber || left.exerciseSuffix.localeCompare(right.exerciseSuffix, "nl");
}

function toIndexedExerciseAsset(
  file: StorageEntry,
  portfolioCode: string,
  identity: ParsedExerciseIdentity,
  resource: ExerciseResourceConfig,
  step: number,
  legacyExerciseVariants: ReadonlyMap<string, SolutionVariantKind>,
): IndexedAsset {
  const descriptor = fileNameParts(file.name);
  if (!descriptor) throw new Error(`Bestand zonder extensie kon niet worden geïndexeerd: ${file.relativePath}`);
  const parsed: ParsedSolutionFile = {
    portfolioCode: normalizePortfolioCode(portfolioCode),
    exerciseNumber: identity.exerciseNumber,
    exerciseSuffix: identity.exerciseSuffix,
    exerciseCode: identity.exerciseCode,
    variant: resource.semanticRole === "alternative_solution" ? "alternative" : "standard",
    step,
    extension: descriptor.extension as ParsedSolutionFile["extension"],
  };
  return {
    resourceId: resource.id,
    semanticRole: resource.semanticRole,
    legacyVariant: legacyExerciseVariants.get(resource.id) ?? null,
    relativePath: file.relativePath,
    sourceId: file.sourceId ?? file.relativePath,
    fileName: file.name,
    lastModifiedAt: file.lastModifiedAt ?? null,
    sourceVersion: file.sourceVersion ?? null,
    parsed,
  };
}

function legacyExerciseResourceVariants(resources: readonly ExerciseResourceConfig[]): Map<string, SolutionVariantKind> {
  const variants = new Map<string, SolutionVariantKind>();
  const standard = firstExerciseResourceBySemanticRole(resources, "worked_solution");
  const alternative = firstExerciseResourceBySemanticRole(resources, "alternative_solution");
  if (standard) variants.set(standard.id, "standard");
  if (alternative) variants.set(alternative.id, "alternative");
  return variants;
}

function exerciseResourceConflictWarning(file: StorageEntry, resources: readonly ExerciseResourceConfig[]): IndexWarning {
  const labels = [...new Set(resources.map((resource) => resource.label))];
  return {
    severity: "warning",
    path: file.relativePath,
    message: `Bestand voldoet aan meerdere onderdeelregels: ${labels.join(", ")}. Geen onderdeel gekozen.`,
  };
}

function resolveGlobalResources(
  entries: readonly StorageEntry[],
  resources: readonly SourceFileGlobalResource[],
  portfolioPath: string,
  warnings: IndexWarning[],
): Map<string, StorageEntry> {
  const candidates = new Map(resources.map((resource) => [resource.id, [] as StorageEntry[]]));

  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    const matches = resources.filter((resource) =>
      matchesSourceFileRecognition(entry, resource.recognition));
    if (matches.length > 1) {
      warnings.push({
        severity: "warning",
        path: entry.relativePath,
        message: `Bestand voldoet aan meerdere globale bronprofielregels: ${matches.map((resource) => resource.label).join(", ")}. Geen resource gekozen.`,
      });
      continue;
    }
    const resource = matches[0];
    if (resource) candidates.get(resource.id)?.push(entry);
  }

  const selected = new Map<string, StorageEntry>();
  for (const resource of resources) {
    const matches = (candidates.get(resource.id) ?? []).sort(compareEntries);
    if (matches.length === 1) {
      selected.set(resource.id, matches[0]);
      continue;
    }
    if (matches.length > 1) warnings.push(duplicateGlobalResourceWarning(resource, matches, portfolioPath));
    else {
      const missing = missingGlobalResourceWarning(resource, portfolioPath);
      if (missing) warnings.push(missing);
    }
  }
  return selected;
}

function duplicateGlobalResourceWarning(
  resource: SourceFileGlobalResource,
  matches: readonly StorageEntry[],
  portfolioPath: string,
): IndexWarning {
  const names = matches.map((entry) => entry.name).join(", ");
  if (resource.semanticRole === "assignment") return { severity: "warning", path: portfolioPath, message: `Meerdere mogelijke opgaven-PDF's herkend: ${names}. Geen bestand gekozen.` };
  if (resource.semanticRole === "hint") return { severity: "warning", path: portfolioPath, message: `Meerdere mogelijke Hints-PDF's herkend: ${names}. Geen bestand gekozen.` };
  if (resource.semanticRole === "final_answer") return { severity: "warning", path: portfolioPath, message: `Meerdere mogelijke eindoplossingen-PDF's herkend: ${names}. Geen bestand gekozen.` };
  return { severity: "warning", path: portfolioPath, message: `Meerdere bestanden herkend voor ${resource.label}: ${names}. Geen bestand gekozen.` };
}

function missingGlobalResourceWarning(resource: SourceFileGlobalResource, portfolioPath: string): IndexWarning | null {
  if (resource.semanticRole === "assignment") return { severity: "warning", path: portfolioPath, message: "Geen opgaven-PDF herkend." };
  if (resource.semanticRole === "final_answer") return { severity: "info", path: portfolioPath, message: "Geen eindoplossingen-PDF herkend." };
  return null;
}

function matchesSourceFileRecognition(
  entry: StorageEntry,
  recognition: {
    operator: GlobalResourceFileMatchOperator;
    value: string;
    caseSensitive: boolean;
    fileExtensions: readonly string[];
  },
): boolean {
  if (entry.kind !== "file") return false;
  const file = fileNameParts(entry.name);
  if (!file || !recognition.fileExtensions.includes(file.extension)) return false;

  const candidate = recognition.caseSensitive ? file.stem : canonicalName(file.stem);
  const expected = recognition.caseSensitive ? recognition.value : canonicalName(recognition.value);
  switch (recognition.operator) {
    case "starts_with": return candidate.startsWith(expected);
    case "contains": return candidate.includes(expected);
    case "ends_with": return candidate.endsWith(expected);
  }
}

function isExerciseResourceFileExtension(value: string): value is ExerciseResourceFileExtension {
  return (exerciseResourceFileExtensions as readonly string[]).includes(value);
}

function fileNameParts(name: string): { stem: string; extension: string } | null {
  const match = name.match(/^(.*)\.([^.]+)$/);
  if (!match) return null;
  return { stem: match[1], extension: canonicalName(match[2]) };
}

function compareEntries(left: StorageEntry, right: StorageEntry): number {
  return left.name.localeCompare(right.name, "nl") || left.relativePath.localeCompare(right.relativePath, "nl");
}
