import { parsePortfolioDirectory, parseSectionDirectory, findExerciseNumberCandidates, parseExerciseDirectoryIdentity } from "./parser";
import { detectExerciseLevelFromSource } from "./exercise-level-detection";
import { EXERCISE_LEVEL_LABELS } from "./exercise-level-presentation";
import { formatTerminologyLabel } from "./collection-terminology";
import { sourceProfileLabels } from "./source-profile-presentation";
import type { LearningSpaceTerminologyInput } from "./collection-terminology";
import type {
  ExerciseLevelRecognitionConfig,
  ExerciseMode,
  GlobalResourceConfig,
  ExerciseResourceConfig,
  ExerciseResourceDirectoryContextRecognition,
  ExerciseResourceFileContextRecognition,
  ExerciseScannerConfig,
  PortfolioScannerConfig,
} from "@/lib/source-profile-config";
import { DEFAULT_PORTFOLIO_SCANNER_CONFIG } from "@/lib/source-profile-config";
import type { IndexedSourceTheme } from "@/lib/domain";

export type SourceStructurePreviewNode = {
  kind: "folder" | "file";
  name: string;
  children?: SourceStructurePreviewNode[];
  annotation?: string;
  interpretation?: string[];
  generatedSection?: true;
  // Generated example context, not a result of scanning a real source.
  example?: { context: "file" | "directory"; exerciseName: string };
};

export type SourceStructurePreview = {
  modeLabel: string;
  explanation: string;
  root: SourceStructurePreviewNode;
  notes: string[];
};

export function buildSourceStructurePreview(
  scanner: ExerciseScannerConfig,
  resources: readonly ExerciseResourceConfig[],
  levelRecognition: ExerciseLevelRecognitionConfig = { method: "none" },
  portfolioScanner: Pick<PortfolioScannerConfig, "marker"> & Partial<Pick<PortfolioScannerConfig, "themeMode">> = DEFAULT_PORTFOLIO_SCANNER_CONFIG,
  terminology: LearningSpaceTerminologyInput = {},
  globalResources: readonly GlobalResourceConfig[] = [],
): SourceStructurePreview {
  const labels = sourceProfileLabels(terminology);
  const portfolioMarker = safeStem(portfolioScanner.marker, "Portfolio");
  const compactMarker = portfolioMarker.length === 1;
  const root: SourceStructurePreviewNode = {
    kind: "folder",
    name: `${portfolioMarker}${compactMarker ? "1.1_" : "1.1 - "}Stelsels oplossen`,
    children: [],
  };
  const sectionOne = ensureFolder(root, "1.1 Inleiding");
  const sectionTwo = ensureFolder(root, "1.2 - Methode van Gauss-Jordan");
  ensureFolder(root, "1.10_Verdieping");
  ensureFolder(root, "2 Toepassingen");
  for (const section of root.children!) section.generatedSection = true;
  const notes = new Set<string>();
  const exerciseOne = scanner.exerciseMode === "files_and_directories" ? exerciseToken(scanner, 1) : exampleExerciseName(scanner, 1, "basis", levelRecognition);
  const exerciseTwo = exampleExerciseName(scanner, 2, "uitdaging", levelRecognition);
  const exerciseOneRoot = exampleExerciseRoot(sectionOne, "basis", levelRecognition);
  const exerciseTwoRoot = exampleExerciseRoot(sectionTwo, "uitdaging", levelRecognition);

  if (scanner.exerciseMode === "files") {
    addFileExercise(exerciseOneRoot, exerciseOne, resources, notes, levelRecognition, "basis", labels.exercise);
  } else if (scanner.exerciseMode === "directories") {
    addDirectoryExercise(exerciseOneRoot, exerciseOne, resources, notes, levelRecognition, "basis");
  } else {
    addFileExercise(exerciseOneRoot, exerciseOne, resources, notes, levelRecognition, "basis", labels.exercise);
    addDirectoryExercise(exerciseTwoRoot, exerciseTwo, resources, notes, levelRecognition, "uitdaging");
    notes.add(`In deze stand mogen beide vormen door elkaar voorkomen. Je hoeft dus niet elke ${labels.exercise} zowel als bestand als map te maken.`);
  }

  // Direct exercises have no fabricated section; the same collection also shows sections.
  const directName = scanner.exerciseMode === "directories" ? exampleExerciseName(scanner, 3, "basis", levelRecognition) : exerciseToken(scanner, 3);
  const directRoot = exampleExerciseRoot(root, "basis", levelRecognition);
  if (scanner.exerciseMode === "directories") {
    addDirectoryExercise(directRoot, directName, resources, notes, levelRecognition, "basis");
  } else {
    addFileExercise(directRoot, directName, resources, notes, levelRecognition, "basis", labels.exercise);
  }
  for (const resource of globalResources) {
    if (resource.kind !== "source_file" || !resource.recognition.fileExtensions.length) continue;
    const name = `${representativeMatch(resource.recognition.operator, resource.recognition.value, "file_name")}.${resource.recognition.fileExtensions[0]}`;
    addPath(root, [{ kind: "file", name }]);
  }
  addPath(root, [{ kind: "file", name: "header.png" }]);
  // Like the existing global-document rules, only a unique file and unique rule get a label.
  const files = root.children!.filter((node) => node.kind === "file");
  const documentMatches = (node: SourceStructurePreviewNode) => globalResources.filter((resource) => resource.kind === "source_file"
    && resource.recognition.fileExtensions.includes(node.name.slice(node.name.lastIndexOf(".") + 1) as typeof resource.recognition.fileExtensions[number])
    && matchesPreviewText(node.name.slice(0, node.name.lastIndexOf(".")), resource.recognition));
  for (const file of files) {
    const matches = documentMatches(file);
    if (matches.length === 1 && files.filter((candidate) => documentMatches(candidate).some((match) => match.id === matches[0].id)).length === 1) {
      file.interpretation = [`Document: ${matches[0].label}`];
    }
  }
  notes.add(`Geldige codes voor ${labels.collections} zijn bijvoorbeeld 1, A, 1A, A1, 1.1 en A.1. Mapnamen zoals “${portfolioMarker} 1.1 Stelsels”, “${portfolioMarker} 1.1 - Stelsels” en “${portfolioMarker}1.1-Stelsels” zijn geldig.`);
  notes.add(`Codes voor ${labels.sections} bestaan uit cijfers en numerieke segmenten, zoals 1, 1.1, 1.2 en 1.10. ${labels.terms.section.plural} staan rechtstreeks onder de ${labels.collection}; een structurele map ‘Uitwerkingen’ is niet nodig. Letter-startende codes worden niet herkend.`);

  addLevelRecognitionNote(notes, levelRecognition, resources, labels.exercise);

  if (resources.some((resource) => resource.location.scope === "alongside_and_subdirectory")) {
    notes.add("Bij ‘direct … of in een submap’ toont dit voorbeeld één geldige plaats. De andere ingestelde plaats is ook toegestaan.");
  }

  let previewRoot = root;
  if (portfolioScanner.themeMode === "folder") {
    const analysis: IndexedSourceTheme = { name: "Analyse", relativePath: "Analyse", sourceId: "example-analysis" };
    const algebra: IndexedSourceTheme = { name: "Algebra", relativePath: "Algebra", sourceId: "example-algebra" };
    const portfolioName = (code: string, title: string) => `${portfolioMarker}${compactMarker ? "" : " "}${code} - ${title}`;
    const directCollection: SourceStructurePreviewNode = { kind: "folder", name: portfolioName("2", "Limieten"), children: [] };
    const directCollectionRoot = exampleExerciseRoot(directCollection, "basis", levelRecognition);
    if (scanner.exerciseMode === "directories") addDirectoryExercise(directCollectionRoot, directName, resources, notes, levelRecognition, "basis");
    else addFileExercise(directCollectionRoot, directName, resources, notes, levelRecognition, "basis", labels.exercise);
    previewRoot = groupSourceStructurePreview([
      { sourceTheme: analysis, node: root },
      { sourceTheme: analysis, node: directCollection },
      { sourceTheme: algebra, node: { kind: "folder", name: portfolioName("3", "Matrices"), children: [] } },
      { node: { kind: "folder", name: portfolioName("4", "Herhaling"), children: [] } },
    ], labels.terms.theme.singular);
    notes.add(`Eén mapniveau onder de bronmap wordt als ${labels.theme} gebruikt. ${labels.terms.collection.plural} rechtstreeks in de bronmap hebben geen ${labels.theme}; diepere niveaus worden niet herkend.`);
  }

  decorateExample(previewRoot, scanner, resources, levelRecognition, portfolioScanner, labels);
  return {
    modeLabel: modeLabel(scanner.exerciseMode).replace("Oefeningen", labels.terms.exercise.plural),
    explanation: modeExplanation(scanner.exerciseMode, labels.exercise),
    root: previewRoot,
    notes: [...notes],
  };
}

// Membership comes from scanner/manifest metadata, never from interpreting folder paths.
export function groupSourceStructurePreview(
  portfolios: readonly { node: SourceStructurePreviewNode; sourceTheme?: IndexedSourceTheme }[],
  themeLabel = "Thema",
): SourceStructurePreviewNode {
  const root: SourceStructurePreviewNode = { kind: "folder", name: "Bronmap", children: [] };
  const themes = new Map<string, SourceStructurePreviewNode>();
  for (const { node, sourceTheme } of portfolios) {
    if (!sourceTheme) {
      root.children!.push(node);
      continue;
    }
    let theme = themes.get(sourceTheme.sourceId);
    if (!theme) {
      theme = { kind: "folder", name: sourceTheme.name, annotation: `${themeLabel} uit bronmap`, interpretation: [`${formatTerminologyLabel(themeLabel, "standalone")}: ${sourceTheme.name}`], children: [] };
      themes.set(sourceTheme.sourceId, theme);
      root.children!.push(theme);
    }
    theme.children!.push(node);
  }
  return root;
}

function addFileExercise(
  root: SourceStructurePreviewNode,
  exerciseName: string,
  resources: readonly ExerciseResourceConfig[],
  notes: Set<string>,
  levelRecognition: ExerciseLevelRecognitionConfig,
  level: "basis" | "uitdaging",
  exerciseLabel: string,
) {
  addPath(root, [{ kind: "file", name: `${exerciseName}.png`, example: { context: "file", exerciseName } }]);

  for (const resource of resources) {
    const recognition = resource.recognition.file;
    if (!recognition) continue;
    const extension = preferredExtension(resource);
    const fileName = withResourceLevelMarker(
      fileContextName(exerciseName, resource, recognition, extension),
      resource.id,
      level,
      levelRecognition,
    );
    if (!fileName) continue;

    if (resource.location.scope !== "alongside_exercise") {
      addPath(root, [
        { kind: "folder", name: resource.location.subdirectory },
        { kind: "file", name: fileName, example: { context: "file", exerciseName } },
      ]);
    } else {
      addPath(root, [{ kind: "file", name: fileName, example: { context: "file", exerciseName } }]);
    }
  }

  if (resources.some((resource) => resource.recognition.file?.target === "fallback" && resource.location.scope === "alongside_exercise")) {
    notes.add(`Bij een standaardregel naast bestanden van ${exerciseLabel} moet de bestandsnaam nog steeds het ${exerciseLabel}nummer bevatten, zodat de app weet bij welke ${exerciseLabel} het bestand hoort.`);
  }
}

function addDirectoryExercise(
  root: SourceStructurePreviewNode,
  exerciseName: string,
  resources: readonly ExerciseResourceConfig[],
  notes: Set<string>,
  levelRecognition: ExerciseLevelRecognitionConfig,
  level: "basis" | "uitdaging",
) {
  const exerciseFolder = ensureFolder(root, exerciseName);
  exerciseFolder.example = { context: "directory", exerciseName };

  for (const resource of resources) {
    const recognition = resource.recognition.directory;
    if (!recognition) continue;
    const extension = preferredExtension(resource);
    const fileName = withResourceLevelMarker(
      directoryContextName(exerciseName, resource, recognition, extension),
      resource.id,
      level,
      levelRecognition,
    );
    if (!fileName) continue;

    if (resource.location.scope !== "alongside_exercise") {
      addPath(exerciseFolder, [
        { kind: "folder", name: resource.location.subdirectory },
        { kind: "file", name: fileName },
      ]);
    } else {
      addPath(exerciseFolder, [{ kind: "file", name: fileName }]);
    }
  }

  if (resources.length === 0) {
    notes.add("Er zijn nog geen materialen ingesteld. Daarom is de map in het voorbeeld nog leeg.");
  }
}

function fileContextName(
  exerciseName: string,
  resource: ExerciseResourceConfig,
  recognition: ExerciseResourceFileContextRecognition,
  extension: string,
): string | null {
  if (recognition.target === "fallback") {
    if (resource.location.scope === "subdirectory") return `${exerciseName}.${extension}`;
    return `${exerciseName}-${safeStem(resource.label, "bestand")}.${extension}`;
  }
  return `${exerciseName}${representativeMatch(recognition.operator, recognition.value, "after_number")}.${extension}`;
}

function directoryContextName(
  exerciseName: string,
  resource: ExerciseResourceConfig,
  recognition: ExerciseResourceDirectoryContextRecognition,
  extension: string,
): string | null {
  if (recognition.target === "fallback") return `${safeStem(resource.label, "bestand")}.${extension}`;
  if (recognition.target === "after_exercise_number") {
    return `${exerciseName}${representativeMatch(recognition.operator, recognition.value, "after_number")}.${extension}`;
  }
  return `${representativeMatch(recognition.operator, recognition.value, "file_name")}.${extension}`;
}

function representativeMatch(
  operator: "starts_with" | "contains" | "exact" | "ends_with",
  value: string,
  context: "after_number" | "file_name",
): string {
  const clean = safeStem(value, context === "after_number" ? "-onderdeel" : "onderdeel");
  if (operator === "exact" || operator === "starts_with") return clean;
  if (operator === "contains") return context === "after_number" ? `-bestand-${clean}` : `bestand-${clean}`;
  return context === "after_number" ? `-bestand-${clean}` : `bestand-${clean}`;
}

function preferredExtension(resource: ExerciseResourceConfig): string {
  const extensions = resource.recognition.fileExtensions;
  if (extensions.includes("png")) return "png";
  if (extensions.includes("jpg")) return "jpg";
  if (extensions.includes("jpeg")) return "jpeg";
  return extensions[0] ?? "pdf";
}

function exerciseToken(scanner: ExerciseScannerConfig, number: number): string {
  if (scanner.numberLocation === "start") return String(number);
  return `${scanner.marker || "Oef"}${number}`;
}

function exampleExerciseRoot(
  root: SourceStructurePreviewNode,
  level: "basis" | "uitdaging",
  recognition: ExerciseLevelRecognitionConfig,
): SourceStructurePreviewNode {
  if (recognition.method !== "subdirectory") return root;
  const folderName = safeStem(recognition.mapping[level], "");
  return folderName ? ensureFolder(root, folderName) : root;
}

function exampleExerciseName(
  scanner: ExerciseScannerConfig,
  number: number,
  level: "basis" | "uitdaging",
  recognition: ExerciseLevelRecognitionConfig,
): string {
  const name = exerciseToken(scanner, number);
  if (scanner.exerciseMode === "files" || recognition.method !== "marker" || recognition.source.type !== "exercise_directory") return name;
  const marker = levelMarker(recognition, level);
  return marker ? `${name}-${marker}` : name;
}

function withResourceLevelMarker(
  fileName: string | null,
  resourceId: string,
  level: "basis" | "uitdaging",
  recognition: ExerciseLevelRecognitionConfig,
): string | null {
  if (!fileName || recognition.method !== "marker" || recognition.source.type !== "exercise_resource" || recognition.source.resourceId !== resourceId) {
    return fileName;
  }
  const marker = levelMarker(recognition, level);
  if (!marker) return fileName;
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex < 1) return `${fileName}-${marker}`;
  return `${fileName.slice(0, extensionIndex)}-${marker}${fileName.slice(extensionIndex)}`;
}

function levelMarker(
  recognition: Extract<ExerciseLevelRecognitionConfig, { method: "marker" }>,
  level: keyof typeof EXERCISE_LEVEL_LABELS,
): string {
  const code = safeStem(recognition.mapping[level], "");
  if (!code) return "";
  return recognition.convention === "prefixed_code" ? `${safeStem(recognition.prefix, "")}${code}` : code;
}

function addLevelRecognitionNote(
  notes: Set<string>,
  recognition: ExerciseLevelRecognitionConfig,
  resources: readonly ExerciseResourceConfig[],
  exerciseLabel: string,
) {
  if (recognition.method === "none") return;
  if (recognition.method === "subdirectory") {
    notes.add(`De ingestelde submapnaam bepaalt in dit voorbeeld automatisch het niveau van de ${exerciseLabel}.`);
    return;
  }
  if (recognition.source.type === "exercise_directory") {
    notes.add(`De ingestelde code in de naam van de map van de ${exerciseLabel} bepaalt automatisch het niveau.`);
    return;
  }
  const sourceResourceId = recognition.source.resourceId;
  const label = resources.find((resource) => resource.id === sourceResourceId)?.label ?? "het gekozen materiaal";
  notes.add(`De ingestelde code in de bestandsnaam van “${label}” bepaalt automatisch het niveau van de ${exerciseLabel}.`);
}

function modeLabel(mode: ExerciseMode): string {
  if (mode === "files") return "Oefeningen als bestanden";
  if (mode === "directories") return "Oefeningen als mappen";
  return "Oefeningen als bestanden en mappen";
}

function modeExplanation(mode: ExerciseMode, exerciseLabel = "oefening"): string {
  if (mode === "files") {
    return `Elke ${exerciseLabel} is een bestand. Extra bestanden moeten zelf het ${exerciseLabel}nummer bevatten, zodat de app weet bij welke ${exerciseLabel} ze horen.`;
  }
  if (mode === "directories") {
    return `Elke ${exerciseLabel} is een map. Bestanden binnen die map horen automatisch bij die ${exerciseLabel}; de herkenningsregel bepaalt welk soort materiaal het is.`;
  }
  return `Beide vormen zijn toegestaan. In dit voorbeeld staat ${exerciseLabel} 1 als bestand en ${exerciseLabel} 2 als map, zodat je beide structuren ziet.`;
}

function safeStem(value: string, fallback: string): string {
  const trimmed = value.trim().replace(/\.[a-z0-9]{1,5}$/i, "");
  const safe = trimmed.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  return safe || fallback;
}

function addPath(root: SourceStructurePreviewNode, path: SourceStructurePreviewNode[]) {
  let parent = root;
  for (const segment of path) {
    if (segment.kind === "file") {
      if (!parent.children?.some((child) => child.kind === "file" && child.name === segment.name)) {
        (parent.children ??= []).push({ ...segment });
      }
      continue;
    }
    parent = ensureFolder(parent, segment.name);
  }
}

function ensureFolder(parent: SourceStructurePreviewNode, name: string): SourceStructurePreviewNode {
  parent.children ??= [];
  const existing = parent.children.find((child) => child.kind === "folder" && child.name === name);
  if (existing) return existing;
  const folder: SourceStructurePreviewNode = { kind: "folder", name, children: [] };
  parent.children.push(folder);
  return folder;
}

// Only interpret the generated contexts. This is deliberately not a live source validator.
function decorateExample(
  root: SourceStructurePreviewNode,
  scanner: ExerciseScannerConfig,
  resources: readonly ExerciseResourceConfig[],
  recognition: ExerciseLevelRecognitionConfig,
  portfolio: Pick<PortfolioScannerConfig, "marker">,
  labels: ReturnType<typeof sourceProfileLabels>,
) {
  const visit = (node: SourceStructurePreviewNode, path: string[] = [], directory?: { name: string; code: string }) => {
    const collection = node.kind === "folder" ? parsePortfolioDirectory(node.name, portfolio) : null;
    const section = node.generatedSection ? parseSectionDirectory(node.name) : null;
    if (collection) node.interpretation = [`${formatTerminologyLabel(labels.terms.collection.singular, "standalone")} ${collection.code} · ${collection.title}`];
    else if (section) node.interpretation = [`${formatTerminologyLabel(labels.terms.section.singular, "standalone")} ${section.code} · ${section.title}`];
    if (collection || section) path = [];
    let context = directory;
    if (node.example?.context === "directory") {
      let identity = parseExerciseDirectoryIdentity(node.name, scanner);
      if (!identity && recognition.method === "marker" && recognition.source.type === "exercise_directory") {
        const level = detectExerciseLevelFromSource([{ name: node.name, directorySegments: [] }], recognition).level;
        const token = level ? levelMarker(recognition, level) : "";
        if (token && node.name.endsWith(`-${token}`)) identity = parseExerciseDirectoryIdentity(node.name.slice(0, -token.length - 1), scanner);
      }
      if (identity) {
        node.interpretation = [`${formatTerminologyLabel(labels.terms.exercise.singular, "standalone")} ${identity.exerciseCode}`];
        context = { name: node.name, code: identity.exerciseCode };
      }
    }
    const example = node.example;
    if (node.kind === "file" && (example || context) && !node.interpretation?.some((label) => label.startsWith("Document:"))) {
      const stem = node.name.replace(/\.[^.]+$/, "");
      const extension = node.name.slice(node.name.lastIndexOf(".") + 1).toLowerCase();
      const candidates = findExerciseNumberCandidates(stem, scanner);
      const identity = example ? parseExerciseDirectoryIdentity(example.exerciseName, scanner) : null;
      const code = context?.code ?? identity?.exerciseCode;
      const reliableNumber = !!context || candidates.some((candidate) => candidate.exerciseCode === code && (candidate.hasBoundaryAfterNumber || candidates.length === 1));
      const matches = resources.flatMap((resource) => {
        const rule = context ? resource.recognition.directory : resource.recognition.file;
        if (!reliableNumber || !rule || !resource.recognition.fileExtensions.includes(extension as typeof resource.recognition.fileExtensions[number])) return [];
        const relative = path.filter((segment) => segment !== context?.name);
        // Generated level folders belong to the exercise context, not its resource location.
        const location = recognition.method === "subdirectory" ? relative.filter((segment) => !Object.values(recognition.mapping).includes(segment)) : relative;
        const alongside = location.length === 0;
        const inSubdirectory = resource.location.scope !== "alongside_exercise" && location.length === 1
          && location[0].trim().toLocaleLowerCase("nl") === resource.location.subdirectory.trim().toLocaleLowerCase("nl");
        const locationMatches = resource.location.scope === "alongside_exercise" ? alongside
          : resource.location.scope === "subdirectory" ? inSubdirectory : alongside || inSubdirectory;
        if (!locationMatches) return [];
        if (rule.target === "fallback") return code ? [{ resource, priority: 1 }] : [];
        const matched = rule.target === "file_name" ? matchesPreviewText(stem, rule) : candidates.some((candidate) => candidate.exerciseCode === code && matchesPreviewText(candidate.remainder, rule));
        return matched ? [{ resource, priority: 2 }] : [];
      });
      const best = matches.filter((match) => match.priority === Math.max(...matches.map((entry) => entry.priority)));
      if (code && !context && best.length === 1) node.interpretation = [`${formatTerminologyLabel(labels.terms.exercise.singular, "standalone")} ${code}`];
      if (best.length === 1) {
        (node.interpretation ??= []).push(`Materiaal: ${best[0].resource.label}`);
        if (recognition.method !== "none" && recognition.source.type === "exercise_resource" && recognition.source.resourceId === best[0].resource.id) appendLevel(node, path, recognition);
      }
    }
    if (recognition.method === "subdirectory" && node.kind === "folder" && !collection && !section) appendLevel(node, [node.name], recognition);
    if (recognition.method === "marker" && recognition.source.type === "exercise_directory" && context && node.example?.context === "directory") appendLevel(node, [], recognition);
    for (const child of node.children ?? []) visit(child, collection || section ? [] : [...path, node.name], context);
  };
  visit(root);
}

function appendLevel(node: SourceStructurePreviewNode, directorySegments: string[], recognition: ExerciseLevelRecognitionConfig) {
  const result = detectExerciseLevelFromSource([{ name: node.name, directorySegments }], recognition);
  if (result.level && !result.conflict) (node.interpretation ??= []).push(`Niveau: ${EXERCISE_LEVEL_LABELS[result.level]}`);
}

function matchesPreviewText(value: string, rule: { operator: "starts_with" | "contains" | "ends_with" | "exact"; value: string; caseSensitive: boolean }) {
  const actual = rule.caseSensitive ? value : value.trim().toLocaleLowerCase("nl");
  const expected = rule.caseSensitive ? rule.value : rule.value.trim().toLocaleLowerCase("nl");
  if (!expected) return false;
  if (rule.operator === "exact") return actual === expected;
  if (rule.operator === "starts_with") return actual.startsWith(expected);
  if (rule.operator === "ends_with") return actual.endsWith(expected);
  return actual.includes(expected);
}
