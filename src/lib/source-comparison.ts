import type { IndexedPortfolio, IndexWarning } from "@/lib/domain";

export type SourceManifestKind = "portfolio" | "section" | "file";

export interface SourceManifestEntry {
  kind: SourceManifestKind;
  relativePath: string;
}

export interface SourceComparison {
  matchedFiles: number;
  fileOverlap: {
    currentFileCount: number;
    targetFileCount: number;
    matchingFileCount: number;
    uniqueFileCount: number;
    ratio: number;
    suggestsWrongSource: boolean;
  };
  onlyInCurrent: SourceManifestEntry[];
  onlyInTarget: SourceManifestEntry[];
  changed: Array<{ relativePath: string; currentKind: SourceManifestKind; targetKind: SourceManifestKind }>;
  currentWarnings: IndexWarning[];
  targetWarnings: IndexWarning[];
  differenceCount: number;
  hasDifferences: boolean;
}

export function sourceManifestFromIndex(portfolios: IndexedPortfolio[]): SourceManifestEntry[] {
  const entries: SourceManifestEntry[] = [];
  for (const portfolio of portfolios) {
    entries.push({ kind: "portfolio", relativePath: portfolio.relativePath });
    if (portfolio.assignmentPdfPath) entries.push({ kind: "file", relativePath: portfolio.assignmentPdfPath });
    if (portfolio.finalSolutionsPdfPath) entries.push({ kind: "file", relativePath: portfolio.finalSolutionsPdfPath });
    for (const section of portfolio.sections) {
      const assets = section.exercises.flatMap((exercise) => exercise.assets);
      if (assets.length > 0) entries.push({ kind: "section", relativePath: section.relativePath });
      for (const exercise of section.exercises) {
        for (const asset of exercise.assets) entries.push({ kind: "file", relativePath: asset.relativePath });
      }
    }
  }
  return uniqueSortedEntries(entries);
}

export function compareSourceManifests(
  current: SourceManifestEntry[],
  target: SourceManifestEntry[],
  currentWarnings: IndexWarning[] = [],
  targetWarnings: IndexWarning[] = [],
): SourceComparison {
  const currentByPath = new Map(uniqueSortedEntries(current).map((entry) => [entry.relativePath, entry]));
  const targetByPath = new Map(uniqueSortedEntries(target).map((entry) => [entry.relativePath, entry]));
  const onlyInCurrent: SourceManifestEntry[] = [];
  const onlyInTarget: SourceManifestEntry[] = [];
  const changed: SourceComparison["changed"] = [];

  for (const [relativePath, currentEntry] of currentByPath) {
    const targetEntry = targetByPath.get(relativePath);
    if (!targetEntry) {
      onlyInCurrent.push(currentEntry);
    } else if (currentEntry.kind !== targetEntry.kind) {
      changed.push({ relativePath, currentKind: currentEntry.kind, targetKind: targetEntry.kind });
    }
  }
  for (const [relativePath, targetEntry] of targetByPath) {
    if (!currentByPath.has(relativePath)) onlyInTarget.push(targetEntry);
  }

  const warningDifferences = compareWarnings(currentWarnings, targetWarnings);
  const fileOverlap = calculateFileOverlap(currentByPath, targetByPath);
  const differenceCount = onlyInCurrent.length + onlyInTarget.length + changed.length
    + warningDifferences.currentWarnings.length + warningDifferences.targetWarnings.length;
  return {
    matchedFiles: fileOverlap.matchingFileCount,
    fileOverlap,
    onlyInCurrent: sortEntries(onlyInCurrent),
    onlyInTarget: sortEntries(onlyInTarget),
    changed: changed.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "nl")),
    ...warningDifferences,
    differenceCount,
    hasDifferences: differenceCount > 0,
  };
}

function calculateFileOverlap(
  current: Map<string, SourceManifestEntry>,
  target: Map<string, SourceManifestEntry>,
): SourceComparison["fileOverlap"] {
  const currentFiles = new Set([...current].filter(([, entry]) => entry.kind === "file").map(([relativePath]) => relativePath));
  const targetFiles = new Set([...target].filter(([, entry]) => entry.kind === "file").map(([relativePath]) => relativePath));
  const matchingFileCount = [...currentFiles].filter((relativePath) => targetFiles.has(relativePath)).length;
  const uniqueFileCount = new Set([...currentFiles, ...targetFiles]).size;
  const ratio = uniqueFileCount === 0 ? 1 : matchingFileCount / uniqueFileCount;
  return {
    currentFileCount: currentFiles.size,
    targetFileCount: targetFiles.size,
    matchingFileCount,
    uniqueFileCount,
    ratio,
    suggestsWrongSource: currentFiles.size >= 5 && targetFiles.size >= 5 && ratio < 0.25,
  };
}

function compareWarnings(current: IndexWarning[], target: IndexWarning[]): Pick<SourceComparison, "currentWarnings" | "targetWarnings"> {
  const currentByKey = uniqueWarnings(current);
  const targetByKey = uniqueWarnings(target);
  return {
    currentWarnings: [...currentByKey].filter(([key]) => !targetByKey.has(key)).map(([, warning]) => warning),
    targetWarnings: [...targetByKey].filter(([key]) => !currentByKey.has(key)).map(([, warning]) => warning),
  };
}

function uniqueWarnings(warnings: IndexWarning[]): Map<string, IndexWarning> {
  const unique = new Map<string, IndexWarning>();
  for (const warning of warnings) {
    const normalizedPath = warning.path.replaceAll("\\", "/").replace(/^\.\//, "").trim();
    const normalizedMessage = warning.message.replace(/\s+/g, " ").trim();
    unique.set(`${normalizedPath}\u0000${normalizedMessage}`, { ...warning, path: normalizedPath, message: normalizedMessage });
  }
  return unique;
}

function uniqueSortedEntries(entries: SourceManifestEntry[]): SourceManifestEntry[] {
  const unique = new Map<string, SourceManifestEntry>();
  for (const entry of entries) {
    const normalizedEntry = { ...entry, relativePath: normalizeRelativePath(entry.relativePath) };
    unique.set(normalizedEntry.relativePath, normalizedEntry);
  }
  return sortEntries([...unique.values()]);
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath
    .normalize("NFC")
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/|\/$/g, "")
    .trim();
}

function sortEntries(entries: SourceManifestEntry[]): SourceManifestEntry[] {
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "nl"));
}
