import { describe, expect, it } from "vitest";

import { compareSourceManifests, type SourceManifestEntry } from "./source-comparison";

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

  it("counts parser warnings as confirmable content differences", () => {
    const comparison = compareSourceManifests(base, base, [{ severity: "warning", path: "Portfolio 7/PF8-Oef1.png", message: "Portfolio mismatch" }]);
    expect(comparison.differenceCount).toBe(1);
    expect(comparison.targetWarnings).toHaveLength(1);
  });
});
