import { describe, expect, it } from "vitest";

import type { IndexedPortfolio, IndexWarning } from "./domain";
import { compareSourceManifests, sourceManifestFromIndex, type SourceManifestEntry } from "./source-comparison";

const base: SourceManifestEntry[] = [
  { kind: "portfolio", relativePath: "Portfolio 7 - Analyse" },
  { kind: "section", relativePath: "Portfolio 7 - Analyse/Uitwerkingen/1 - Limieten" },
  { kind: "file", relativePath: "Portfolio 7 - Analyse/Portfolio 7 - Analyse.pdf" },
  { kind: "file", relativePath: "Portfolio 7 - Analyse/Uitwerkingen/1 - Limieten/PF7-Oef1.png" },
];

describe("source comparison", () => {
  it("reports identical logical structures without using provider IDs", () => {
    expect(compareSourceManifests(base, [...base])).toMatchObject({
      matchedFiles: 2,
      onlyInCurrent: [],
      onlyInTarget: [],
      changed: [],
      fileOverlap: { matchingFileCount: 2, uniqueFileCount: 2, ratio: 1, suggestsWrongSource: false },
      differenceCount: 0,
      hasDifferences: false,
    });
  });

  it("classifies missing, extra and structurally changed paths", () => {
    const target: SourceManifestEntry[] = [
      ...base.filter((entry) => !entry.relativePath.endsWith("PF7-Oef1.png")),
      { kind: "file", relativePath: "Portfolio 7 - Analyse/Uitwerkingen/1 - Limieten/PF7-Oef2.png" },
      { kind: "file", relativePath: "Portfolio 7 - Analyse" },
    ];
    const comparison = compareSourceManifests(base, target);
    expect(comparison.onlyInCurrent.map((entry) => entry.relativePath)).toEqual(["Portfolio 7 - Analyse/Uitwerkingen/1 - Limieten/PF7-Oef1.png"]);
    expect(comparison.onlyInTarget.map((entry) => entry.relativePath)).toEqual(["Portfolio 7 - Analyse/Uitwerkingen/1 - Limieten/PF7-Oef2.png"]);
    expect(comparison.changed).toEqual([{ relativePath: "Portfolio 7 - Analyse", currentKind: "portfolio", targetKind: "file" }]);
    expect(comparison.hasDifferences).toBe(true);
  });

  it("counts a parser warning that occurs only in the target", () => {
    const comparison = compareSourceManifests(base, base, [], [{ severity: "warning", path: "Portfolio 7/PF8-Oef1.png", message: "Portfolio mismatch" }]);
    expect(comparison.differenceCount).toBe(1);
    expect(comparison.targetWarnings).toHaveLength(1);
  });

  it("cancels warnings that occur for the same logical item in both sources", () => {
    const shared: IndexWarning = {
      severity: "warning",
      path: "Portfolio 2A - Rekenen met matrices",
      message: "Geen eindoplossingen-PDF herkend.",
    };
    const comparison = compareSourceManifests(base, base, [shared, shared], [{ ...shared, message: "  Geen eindoplossingen-PDF   herkend. " }]);
    expect(comparison).toMatchObject({ currentWarnings: [], targetWarnings: [], differenceCount: 0, hasDifferences: false });
  });

  it("reports warnings that occur in only one source symmetrically", () => {
    const currentWarning: IndexWarning = { severity: "warning", path: "Portfolio 2A", message: "Alleen actief" };
    const targetWarning: IndexWarning = { severity: "warning", path: "Portfolio 2B", message: "Alleen target" };
    const comparison = compareSourceManifests(base, base, [currentWarning], [targetWarning]);
    expect(comparison.currentWarnings).toEqual([currentWarning]);
    expect(comparison.targetWarnings).toEqual([targetWarning]);
    expect(comparison.differenceCount).toBe(2);
  });

  it("omits a directory-only section but retains sections with relevant indexed files", () => {
    const emptySection = "Portfolio 5 - Limieten van rijen & reeksen/Uitwerkingen/4 - Limieten van recursieve rijen";
    const populatedSection = "Portfolio 5 - Limieten van rijen & reeksen/Uitwerkingen/5 - Convergentie";
    const portfolio: IndexedPortfolio = {
      code: "5", title: "Limieten van rijen & reeksen", relativePath: "Portfolio 5 - Limieten van rijen & reeksen",
      assignmentPdfPath: null, assignmentPdfSourceId: null, finalSolutionsPdfPath: null, finalSolutionsPdfSourceId: null, warnings: [],
      sections: [
        { order: 4, title: "Limieten van recursieve rijen", relativePath: emptySection, exercises: [] },
        { order: 5, title: "Convergentie", relativePath: populatedSection, exercises: [{
          code: "1", number: 1, suffix: "", assets: [{
            relativePath: `${populatedSection}/PF5-Oef1.png`, sourceId: "asset-1", fileName: "PF5-Oef1.png",
            lastModifiedAt: null, sourceVersion: null,
            parsed: { portfolioCode: "5", exerciseNumber: 1, exerciseSuffix: "", exerciseCode: "1", variant: "standard", step: 1, extension: "png" },
          }],
        }] },
      ],
    };
    const manifest = sourceManifestFromIndex([portfolio]);
    expect(manifest).not.toContainEqual({ kind: "section", relativePath: emptySection });
    expect(manifest).toContainEqual({ kind: "section", relativePath: populatedSection });
  });

  it("ignores a completely empty portfolio that exists only in the current source", () => {
    const emptyPortfolio = { kind: "portfolio" as const, relativePath: "Portfolio 2A - Extra oef" };
    const comparison = compareSourceManifests([...base, emptyPortfolio], base);
    expect(comparison).toMatchObject({ onlyInCurrent: [], differenceCount: 0, hasDifferences: false });
  });

  it("ignores a completely empty portfolio that exists only in the target source", () => {
    const emptyPortfolio = { kind: "portfolio" as const, relativePath: "Portfolio 7 - Kwadraten" };
    const comparison = compareSourceManifests(base, [...base, emptyPortfolio]);
    expect(comparison).toMatchObject({ onlyInTarget: [], differenceCount: 0, hasDifferences: false });
  });

  it("ignores structural parser warnings attached to a completely empty portfolio", () => {
    const path = "Portfolio 2A - Extra oef";
    const warnings: IndexWarning[] = [
      { severity: "warning", path, message: "Geen opgaven-PDF herkend." },
      { severity: "info", path, message: "Geen eindoplossingen-PDF herkend." },
      { severity: "warning", path, message: "Map Uitwerkingen ontbreekt." },
    ];
    const currentOnly = compareSourceManifests([...base, { kind: "portfolio", relativePath: path }], base, warnings);
    const targetOnly = compareSourceManifests(base, [...base, { kind: "portfolio", relativePath: path }], [], warnings);
    expect(currentOnly).toMatchObject({ currentWarnings: [], differenceCount: 0, hasDifferences: false });
    expect(targetOnly).toMatchObject({ targetWarnings: [], differenceCount: 0, hasDifferences: false });
  });

  it("retains a source-only portfolio when it contains a relevant file", () => {
    const path = "Portfolio 7 - Kwadraten";
    const comparison = compareSourceManifests([
      ...base,
      { kind: "portfolio", relativePath: path },
      { kind: "file", relativePath: `${path}/Portfolio 7 - Kwadraten.pdf` },
    ], base);
    expect(comparison.onlyInCurrent.map((entry) => entry.relativePath)).toEqual([
      path,
      `${path}/Portfolio 7 - Kwadraten.pdf`,
    ]);
    expect(comparison.hasDifferences).toBe(true);
  });

  it("retains a concrete parser warning below an otherwise empty portfolio", () => {
    const path = "Portfolio 7 - Kwadraten";
    const malformed: IndexWarning = {
      severity: "warning",
      path: `${path}/Uitwerkingen/1 - Basis/PF7-Oef-onvolledig.png`,
      message: "Uitwerking niet herkend.",
    };
    const comparison = compareSourceManifests([{ kind: "portfolio", relativePath: path }], [], [malformed]);
    expect(comparison.currentWarnings).toEqual([malformed]);
    expect(comparison.hasDifferences).toBe(true);
  });

  it("does not suggest a wrong source when the mirror misses one of one hundred files", () => {
    const current = fileEntries("Portfolio 1", 100);
    const comparison = compareSourceManifests(current, current.slice(0, 99));
    expect(comparison.fileOverlap).toMatchObject({ matchingFileCount: 99, uniqueFileCount: 100, ratio: 0.99, suggestsWrongSource: false });
  });

  it("does not suggest a wrong source for a substantial eighty-percent overlap", () => {
    const current = fileEntries("Portfolio 1", 100);
    const comparison = compareSourceManifests(current, current.slice(0, 80));
    expect(comparison.fileOverlap).toMatchObject({ matchingFileCount: 80, uniqueFileCount: 100, ratio: 0.8, suggestsWrongSource: false });
  });

  it("suggests a wrong source for two substantial sources with zero overlap", () => {
    const comparison = compareSourceManifests(fileEntries("Portfolio 1", 10), fileEntries("Portfolio 2", 10));
    expect(comparison.fileOverlap).toMatchObject({
      currentFileCount: 10, targetFileCount: 10, matchingFileCount: 0, uniqueFileCount: 20, ratio: 0, suggestsWrongSource: true,
    });
  });

  it("suggests a wrong source below twenty-five percent overlap", () => {
    const shared = fileEntries("Gedeeld", 2);
    const current = [...shared, ...fileEntries("Alleen actief", 8)];
    const target = [...shared, ...fileEntries("Alleen target", 8)];
    const comparison = compareSourceManifests(current, target);
    expect(comparison.fileOverlap.ratio).toBeCloseTo(2 / 18);
    expect(comparison.fileOverlap.suggestsWrongSource).toBe(true);
  });

  it("does not make a misleading suggestion for two nearly empty sources", () => {
    const comparison = compareSourceManifests(fileEntries("Portfolio 1", 4), fileEntries("Portfolio 2", 4));
    expect(comparison.fileOverlap).toMatchObject({ matchingFileCount: 0, ratio: 0, suggestsWrongSource: false });
  });

  it("keeps parser warnings outside the file overlap score", () => {
    const files = fileEntries("Portfolio 1", 5);
    const warning: IndexWarning = { severity: "warning", path: "Portfolio 1", message: "Parserwaarschuwing" };
    const comparison = compareSourceManifests(files, files, [], [warning]);
    expect(comparison.fileOverlap).toMatchObject({ matchingFileCount: 5, uniqueFileCount: 5, ratio: 1, suggestsWrongSource: false });
    expect(comparison.differenceCount).toBe(1);
  });

  it("keeps empty directory structures outside the file overlap score", () => {
    const directories = Array.from({ length: 50 }, (_, index): SourceManifestEntry => ({
      kind: "section", relativePath: `Lege map ${index + 1}`,
    }));
    const comparison = compareSourceManifests(
      [...fileEntries("Portfolio 1", 4), ...directories],
      [...fileEntries("Portfolio 2", 4), ...directories.map((entry) => ({ ...entry, relativePath: `Target/${entry.relativePath}` }))],
    );
    expect(comparison.fileOverlap).toMatchObject({ currentFileCount: 4, targetFileCount: 4, matchingFileCount: 0, suggestsWrongSource: false });
    expect([...comparison.onlyInCurrent, ...comparison.onlyInTarget].every((entry) => entry.kind === "file")).toBe(true);
  });

  it("ignores a source-only section without relevant files", () => {
    const emptySection: SourceManifestEntry = {
      kind: "section",
      relativePath: "Portfolio 7 - Analyse/Uitwerkingen/9 - Leeg onderdeel",
    };
    expect(compareSourceManifests([...base, emptySection], base)).toMatchObject({
      onlyInCurrent: [],
      differenceCount: 0,
      hasDifferences: false,
    });
  });

  it("normalizes relative path separators before calculating overlap", () => {
    const current = fileEntries("Portfolio 1", 5);
    const target = current.map((entry) => ({ ...entry, relativePath: `.\\${entry.relativePath.replaceAll("/", "\\")}` }));
    expect(compareSourceManifests(current, target).fileOverlap).toMatchObject({ matchingFileCount: 5, ratio: 1, suggestsWrongSource: false });
  });
});

function fileEntries(prefix: string, count: number): SourceManifestEntry[] {
  return Array.from({ length: count }, (_, index) => ({ kind: "file", relativePath: `${prefix}/bestand-${index + 1}.png` }));
}
