import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalFilesystemProvider } from "./local-filesystem-provider";
import { indexSource } from "./portfolio-indexer";
import type { StorageEntry, StorageProvider } from "./provider";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

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

  it("indexeert Portfolio X en koppelt PFX-assets zonder speciale infrastructuur", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-x-index-"));
    const portfolioPath = "Portfolio X - Kwadraten";
    const sectionPath = path.join(temporaryDirectory, portfolioPath, "Uitwerkingen", "1 - Basis");
    await mkdir(sectionPath, { recursive: true });
    await Promise.all([
      path.join(temporaryDirectory, portfolioPath, "Portfolio X - Kwadraten.pdf"),
      path.join(temporaryDirectory, portfolioPath, "Eindoplossingen portfolio X.pdf"),
      path.join(sectionPath, "PFX-Oef1.png"),
      path.join(sectionPath, "PFX-Oef2a.png"),
      path.join(sectionPath, "PFX-Oef3-alt(2).png"),
    ].map((filePath) => writeFile(filePath, "fixture")));

    const [portfolio] = await indexSource(new LocalFilesystemProvider(temporaryDirectory));
    expect(portfolio).toMatchObject({ code: "X", title: "Kwadraten", warnings: [] });
    expect(portfolio.sections[0].exercises.map((exercise) => exercise.code)).toEqual(["1", "2a", "3"]);
    expect(portfolio.sections[0].exercises[2].assets[0].parsed).toMatchObject({ portfolioCode: "X", variant: "alternative", step: 2 });
  });

  it("sorteert geïndexeerde portfolio's met de centrale natuurlijke comparator", async () => {
    const codes = ["12", "2B", "3", "X", "10", "2", "A", "1", "2A", "11"];
    const sortingProvider: StorageProvider = {
      id: "portfolio-order-fixture",
      async list(relativePath = "") {
        if (relativePath !== "") return [];
        return codes.map((code) => ({ name: `Portfolio ${code} - Test`, relativePath: `Portfolio ${code} - Test`, kind: "directory" as const }));
      },
      async readFile() { return Buffer.from(""); },
    };
    expect((await indexSource(sortingProvider)).map((portfolio) => portfolio.code)).toEqual(["1", "2", "2A", "2B", "3", "10", "11", "12", "A", "X"]);
  });

  it("negeert gewone ondersteunende bestanden, maar waarschuwt voor malformed PF/Oef-namen", async () => {
    const malformedProvider: StorageProvider = {
      ...provider,
      async list(relativePath = "") {
        if (relativePath === "Portfolio 3 - Toepassingen/Uitwerkingen/1 - Afgeleiden") return [
          { name: "notities.docx", relativePath: `${relativePath}/notities.docx`, kind: "file" },
          { name: "willekeurig-bestand.png", relativePath: `${relativePath}/willekeurig-bestand.png`, kind: "file" },
          { name: "PF3-Oef2--onvolledig.png", relativePath: `${relativePath}/PF3-Oef2--onvolledig.png`, kind: "file" },
        ];
        return tree[relativePath] ?? [];
      },
    };
    const [portfolio] = await indexSource(malformedProvider);
    expect(portfolio.sections[0].exercises).toHaveLength(0);
    expect(portfolio.warnings).toHaveLength(1);
    expect(portfolio.warnings[0].path).toContain("PF3-Oef2--onvolledig.png");
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

  it("negeert alle bestanden rechtstreeks onder Uitwerkingen en scant alleen geldige onderdeelmappen", async () => {
    const portfolioPath = "Portfolio 4 - De bepaalde integraal";
    const solutionsPath = `${portfolioPath}/Uitwerkingen`;
    const sectionPath = `${solutionsPath}/4 - Hyperbolische functies`;
    const directFiles = ["PF4-Oef5.png", "PF4-Oef10(2).png", "Uitgewerkte oefeningen.docx"].map((name) => ({ name, relativePath: `${solutionsPath}/${name}`, kind: "file" as const }));
    const sectionFiles = ["PF4-Oef30c-controlerend(2).png", "PF5-Oef1.png"].map((name) => ({ name, relativePath: `${sectionPath}/${name}`, kind: "file" as const }));
    const sectionOnlyProvider: StorageProvider = {
      id: "section-only-fixture",
      async list(relativePath = "") {
        if (relativePath === "") return [{ name: portfolioPath, relativePath: portfolioPath, kind: "directory" }];
        if (relativePath === portfolioPath) return [
          { name: "Portfolio 4 - De bepaalde integraal.pdf", relativePath: `${portfolioPath}/Portfolio 4 - De bepaalde integraal.pdf`, kind: "file" },
          { name: "Eindoplossingen portfolio 4.pdf", relativePath: `${portfolioPath}/Eindoplossingen portfolio 4.pdf`, kind: "file" },
          { name: "Uitwerkingen", relativePath: solutionsPath, kind: "directory" },
        ];
        if (relativePath === solutionsPath) return [...directFiles, { name: "4 - Hyperbolische functies", relativePath: sectionPath, kind: "directory" }];
        if (relativePath === sectionPath) return sectionFiles;
        return [];
      },
      async readFile() { return Buffer.from(""); },
    };

    const [portfolio] = await indexSource(sectionOnlyProvider);
    expect(portfolio.sections).toHaveLength(1);
    expect(portfolio.sections[0].exercises).toMatchObject([{ code: "30c", assets: [{ fileName: "PF4-Oef30c-controlerend(2).png" }] }]);
    expect(portfolio.sections[0].exercises.some((exercise) => exercise.code === "5" || exercise.code === "10")).toBe(false);
    expect(portfolio.warnings).toHaveLength(1);
    expect(portfolio.warnings[0]).toMatchObject({ path: `${sectionPath}/PF5-Oef1.png`, message: "Portfolio-code PF5 komt niet overeen met Portfolio 4." });
  });
});
