import { describe, expect, it } from "vitest";

import { indexSource } from "./portfolio-indexer";
import type { StorageEntry, StorageProvider } from "./provider";

const tree: Record<string, StorageEntry[]> = {
  "": [{ name: "Portfolio 3 - Toepassingen", relativePath: "Portfolio 3 - Toepassingen", kind: "directory" }],
  "Portfolio 3 - Toepassingen": [
    { name: "Portfolio 3 - Toepassingen.pdf", relativePath: "Portfolio 3 - Toepassingen/Portfolio 3 - Toepassingen.pdf", kind: "file" },
    { name: "Eindoplossingen portfolio 3 - Toepassingen.pdf", relativePath: "Portfolio 3 - Toepassingen/Eindoplossingen portfolio 3 - Toepassingen.pdf", kind: "file" },
    { name: "Uitwerkingen", relativePath: "Portfolio 3 - Toepassingen/Uitwerkingen", kind: "directory" },
  ],
  "Portfolio 3 - Toepassingen/Uitwerkingen": [
    { name: "1 - Afgeleiden", relativePath: "Portfolio 3 - Toepassingen/Uitwerkingen/1 - Afgeleiden", kind: "directory" },
  ],
  "Portfolio 3 - Toepassingen/Uitwerkingen/1 - Afgeleiden": [
    { name: "PF3-Oef2b(1).png", relativePath: "Portfolio 3 - Toepassingen/Uitwerkingen/1 - Afgeleiden/PF3-Oef2b(1).png", kind: "file" },
    { name: "PF3-Oef2b(2).png", relativePath: "Portfolio 3 - Toepassingen/Uitwerkingen/1 - Afgeleiden/PF3-Oef2b(2).png", kind: "file" },
    { name: "PF3-Oef2b-alt(1).png", relativePath: "Portfolio 3 - Toepassingen/Uitwerkingen/1 - Afgeleiden/PF3-Oef2b-alt(1).png", kind: "file" },
    { name: "PF4-Oef7.png", relativePath: "Portfolio 3 - Toepassingen/Uitwerkingen/1 - Afgeleiden/PF4-Oef7.png", kind: "file" },
    { name: "onduidelijk.png", relativePath: "Portfolio 3 - Toepassingen/Uitwerkingen/1 - Afgeleiden/onduidelijk.png", kind: "file" },
  ],
};

const provider: StorageProvider = {
  id: "fixture",
  async list(relativePath = "") { return tree[relativePath] ?? []; },
  async readFile() { return Buffer.from(""); },
};

describe("portfolio indexer", () => {
  it("groepeert standaard- en alternatieve stappen per oefening en sluit bestanden met een verkeerde PF-code uit", async () => {
    const [portfolio] = await indexSource(provider);
    const exercise = portfolio.sections[0].exercises.find((item) => item.code === "2b");

    expect(exercise?.assets.map((asset) => [asset.parsed.variant, asset.parsed.step])).toEqual([
      ["alternative", 1],
      ["standard", 1],
      ["standard", 2],
    ]);
    expect(portfolio.assignmentPdfPath).toContain("Portfolio 3 - Toepassingen.pdf");
    expect(portfolio.finalSolutionsPdfPath).toContain("Eindoplossingen");
    expect(portfolio.warnings).toHaveLength(1);
    expect(portfolio.sections[0].exercises.some((item) => item.code === "7")).toBe(false);
  });

  it("negeert gewone ondersteunende bestanden, maar waarschuwt voor malformed PF/Oef-namen", async () => {
    const malformedProvider: StorageProvider = {
      ...provider,
      async list(relativePath = "") {
        if (relativePath === "Portfolio 3 - Toepassingen/Uitwerkingen/1 - Afgeleiden") return [
          { name: "notities.docx", relativePath: `${relativePath}/notities.docx`, kind: "file" },
          { name: "willekeurig-bestand.png", relativePath: `${relativePath}/willekeurig-bestand.png`, kind: "file" },
          { name: "PF3-Oef2-onvolledig.png", relativePath: `${relativePath}/PF3-Oef2-onvolledig.png`, kind: "file" },
        ];
        return tree[relativePath] ?? [];
      },
    };
    const [portfolio] = await indexSource(malformedProvider);
    expect(portfolio.sections[0].exercises).toHaveLength(0);
    expect(portfolio.warnings).toHaveLength(1);
    expect(portfolio.warnings[0].path).toContain("PF3-Oef2-onvolledig.png");
  });

  it("laat een geldig en ongeldig bestand voor hetzelfde oefeningnummer nooit samenvloeien", async () => {
    const collisionProvider: StorageProvider = {
      ...provider,
      async list(relativePath = "") {
        if (relativePath === "Portfolio 3 - Toepassingen/Uitwerkingen/1 - Afgeleiden") return [
          { name: "PF3-Oef10.png", relativePath: `${relativePath}/PF3-Oef10.png`, kind: "file" },
          { name: "PF8-Oef10.png", relativePath: `${relativePath}/PF8-Oef10.png`, kind: "file" },
        ];
        return tree[relativePath] ?? [];
      },
    };
    const [portfolio] = await indexSource(collisionProvider);
    const exercise = portfolio.sections[0].exercises.find((item) => item.code === "10");
    expect(exercise?.assets.map((asset) => asset.fileName)).toEqual(["PF3-Oef10.png"]);
    expect(portfolio.warnings.some((warning) => warning.path.endsWith("PF8-Oef10.png"))).toBe(true);
  });
});
