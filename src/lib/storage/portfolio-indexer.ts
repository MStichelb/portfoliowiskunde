import type { IndexedPortfolio, IndexWarning } from "@/lib/domain";
import {
  normalizePortfolioCode,
  parsePortfolioDirectory,
  parseSectionDirectory,
  parseSolutionFileName,
} from "@/lib/parser";
import type { StorageEntry, StorageProvider } from "@/lib/storage/provider";

function isPdf(entry: StorageEntry): boolean {
  return entry.kind === "file" && /\.pdf$/i.test(entry.name);
}

function canonicalName(value: string): string {
  return value.toLocaleLowerCase("nl");
}

function isAssignmentPdf(entry: StorageEntry, code: string): boolean {
  const name = canonicalName(entry.name);
  return (
    isPdf(entry) &&
    name.includes(`portfolio ${code.toLowerCase()}`) &&
    !name.includes("eindoplossingen") &&
    !name.includes("voorblad")
  );
}

function isFinalSolutionsPdf(entry: StorageEntry, code: string): boolean {
  const name = canonicalName(entry.name);
  return isPdf(entry) && name.includes("eindoplossingen") && name.includes(`portfolio ${code.toLowerCase()}`);
}

// Only names that start like a reserved PF/Oef solution are treated as malformed input.
// Other files under Uitwerkingen are supporting source material and intentionally ignored.
function looksLikeSolutionFile(name: string): boolean {
  return /^pf\s*\d+[a-z]?\s*-\s*oef/i.test(name.trim());
}

export async function indexSource(provider: StorageProvider): Promise<IndexedPortfolio[]> {
  const rootEntries = await provider.list();
  const portfolios: IndexedPortfolio[] = [];

  for (const entry of rootEntries) {
    if (entry.kind !== "directory") continue;
    const parsedPortfolio = parsePortfolioDirectory(entry.name);
    if (!parsedPortfolio) continue;
    portfolios.push(await indexPortfolio(provider, entry, parsedPortfolio.code, parsedPortfolio.title));
  }

  return portfolios.sort((a, b) => a.code.localeCompare(b.code, "nl", { numeric: true }));
}

async function indexPortfolio(
  provider: StorageProvider,
  directory: StorageEntry,
  code: string,
  title: string,
): Promise<IndexedPortfolio> {
  const warnings: IndexWarning[] = [];
  const entries = await provider.list(directory.relativePath);
  const assignmentPdf = entries.find((entry) => isAssignmentPdf(entry, code));
  const finalSolutionsPdf = entries.find((entry) => isFinalSolutionsPdf(entry, code));
  const solutionsDirectory = entries.find(
    (entry) => entry.kind === "directory" && canonicalName(entry.name) === "uitwerkingen",
  );

  if (!assignmentPdf) {
    warnings.push({ severity: "warning", path: directory.relativePath, message: "Geen opgaven-PDF herkend." });
  }
  if (!finalSolutionsPdf) {
    warnings.push({ severity: "info", path: directory.relativePath, message: "Geen eindoplossingen-PDF herkend." });
  }
  if (!solutionsDirectory) {
    warnings.push({ severity: "warning", path: directory.relativePath, message: "Map Uitwerkingen ontbreekt." });
  }

  const sections = solutionsDirectory
    ? await indexSections(provider, solutionsDirectory, code, warnings)
    : [];

  return {
    code,
    title,
    relativePath: directory.relativePath,
    assignmentPdfPath: assignmentPdf?.relativePath ?? null,
    assignmentPdfSourceId: assignmentPdf?.sourceId ?? null,
    finalSolutionsPdfPath: finalSolutionsPdf?.relativePath ?? null,
    finalSolutionsPdfSourceId: finalSolutionsPdf?.sourceId ?? null,
    sections,
    warnings,
  };
}

async function indexSections(
  provider: StorageProvider,
  solutionsDirectory: StorageEntry,
  portfolioCode: string,
  warnings: IndexWarning[],
): Promise<IndexedPortfolio["sections"]> {
  const entries = await provider.list(solutionsDirectory.relativePath);
  const sections: IndexedPortfolio["sections"] = [];

  for (const entry of entries) {
    // Files directly under Uitwerkingen are source material, never individual solutions.
    if (entry.kind === "file") continue;

    const parsedSection = parseSectionDirectory(entry.name);
    if (!parsedSection) {
      warnings.push({ severity: "warning", path: entry.relativePath, message: "Onderdeelmap volgt niet het patroon '<nummer> - <titel>'." });
      continue;
    }

    const files = await provider.list(entry.relativePath);
    const exercises = new Map<string, IndexedPortfolio["sections"][number]["exercises"][number]>();
    const indexedPaths = new Set<string>();

    for (const file of files) {
      if (file.kind !== "file") continue;
      if (indexedPaths.has(file.relativePath)) {
        warnings.push({ severity: "warning", path: file.relativePath, message: "Dubbel bronbestand tijdens scanning genegeerd." });
        continue;
      }
      indexedPaths.add(file.relativePath);
      const parsed = parseSolutionFileName(file.name);
      if (!parsed) {
        if (looksLikeSolutionFile(file.name)) warnings.push({ severity: "warning", path: file.relativePath, message: "Uitwerking niet herkend; verwacht bijvoorbeeld PF3-Oef2b-alt(1).png." });
        continue;
      }
      if (parsed.portfolioCode !== normalizePortfolioCode(portfolioCode)) {
        warnings.push({ severity: "warning", path: file.relativePath, message: `Portfolio-code PF${parsed.portfolioCode} komt niet overeen met Portfolio ${portfolioCode}.` });
        continue;
      }

      const existing = exercises.get(parsed.exerciseCode) ?? {
        code: parsed.exerciseCode,
        number: parsed.exerciseNumber,
        suffix: parsed.exerciseSuffix,
        assets: [],
      };
      existing.assets.push({
        relativePath: file.relativePath,
        sourceId: file.sourceId ?? file.relativePath,
        fileName: file.name,
        lastModifiedAt: file.lastModifiedAt ?? null,
        sourceVersion: file.sourceVersion ?? null,
        parsed,
      });
      exercises.set(parsed.exerciseCode, existing);
    }

    for (const exercise of exercises.values()) {
      exercise.assets.sort(
        (a, b) =>
          a.parsed.variant.localeCompare(b.parsed.variant) ||
          a.parsed.step - b.parsed.step ||
          a.fileName.localeCompare(b.fileName, "nl"),
      );
    }

    sections.push({
      order: parsedSection.order,
      title: parsedSection.title,
      relativePath: entry.relativePath,
      exercises: [...exercises.values()].sort(
        (a, b) => a.number - b.number || a.suffix.localeCompare(b.suffix),
      ),
    });
  }

  return sections.sort((a, b) => a.order - b.order);
}
