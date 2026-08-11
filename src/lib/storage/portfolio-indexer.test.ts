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
  it("groepeert standaard- en alternatieve stappen per oefening", async () => {
    const [portfolio] = await indexSource(provider);
    const exercise = portfolio.sections[0].exercises.find((item) => item.code === "2b");

    expect(exercise?.assets.map((asset) => [asset.parsed.variant, asset.parsed.step])).toEqual([
      ["alternative", 1],
      ["standard", 1],
      ["standard", 2],
    ]);
    expect(portfolio.assignmentPdfPath).toContain("Portfolio 3 - Toepassingen.pdf");
    expect(portfolio.finalSolutionsPdfPath).toContain("Eindoplossingen");
    expect(portfolio.warnings).toHaveLength(2);
  });
});
