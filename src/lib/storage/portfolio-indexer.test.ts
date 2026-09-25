import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, parseSourceProfileConfig, type ExerciseMode, type SourceProfileConfig } from "../source-profile-config";
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
  it("groepeert standaard- en alternatieve bestanden per oefening en gebruikt de portfoliomap als context", async () => {
    const [portfolio] = await indexSource(provider);
    const exercise = portfolio.sections[0].exercises.find((item) => item.code === "2b");

    expect(exercise?.assets.map((asset) => [asset.parsed.variant, asset.parsed.step])).toEqual([
      ["standard", 1],
      ["standard", 2],
      ["alternative", 1],
    ]);
    expect(portfolio.assignmentPdfPath).toContain("Portfolio 3 - Toepassingen.pdf");
    expect(portfolio.finalSolutionsPdfPath).toContain("Eindoplossingen");
    expect(portfolio.warnings).toHaveLength(0);
    expect(portfolio.sections[0].exercises.some((item) => item.code === "7")).toBe(true);
  });

  describe("opgaven-PDF-herkenning", () => {
    it("kiest een positief herkende Portfolio-prefix boven een Hints-bestand", async () => {
      const [portfolio] = await indexSource(assignmentProvider("1", "Test", [
        "Hints portfolio 1.pdf",
        "Portfolio 1 - Test.pdf",
      ]));

      expect(portfolio.assignmentPdfPath).toBe("Portfolio 1 - Test/Portfolio 1 - Test.pdf");
    });

    it("sluit Eindoplossingen en Voorblad uit doordat hun naam niet met Portfolio begint", async () => {
      const [portfolio] = await indexSource(assignmentProvider("1", "Test", [
        "Eindoplossingen portfolio 1 - Test.pdf",
        "Voorblad portfolio 1 - Test.pdf",
        "Portfolio 1 - Test.pdf",
      ]));

      expect(portfolio.assignmentPdfPath).toBe("Portfolio 1 - Test/Portfolio 1 - Test.pdf");
    });

    it("gebruikt de portfoliomap als context en hoeft het nummer in de bestandsnaam niet te controleren", async () => {
      const [portfolio1] = await indexSource(assignmentProvider("1", "Test", ["Portfolio 10 - Hernoemd.pdf"]));
      const [portfolio10] = await indexSource(assignmentProvider("10", "Test", ["Portfolio 1 - Hernoemd.pdf"]));

      expect(portfolio1.assignmentPdfPath).toBe("Portfolio 1 - Test/Portfolio 10 - Hernoemd.pdf");
      expect(portfolio10.assignmentPdfPath).toBe("Portfolio 10 - Test/Portfolio 1 - Hernoemd.pdf");
    });

    it("ondersteunt een alfanumerieke portfolio-ID", async () => {
      const [portfolio] = await indexSource(assignmentProvider("2A", "Test", ["Portfolio 2A - Test.pdf"]));
      expect(portfolio.assignmentPdfPath).toBe("Portfolio 2A - Test/Portfolio 2A - Test.pdf");
    });

    it("ondersteunt een letter-ID", async () => {
      const [portfolio] = await indexSource(assignmentProvider("X", "Test", ["Portfolio X - Test.pdf"]));
      expect(portfolio.assignmentPdfPath).toBe("Portfolio X - Test/Portfolio X - Test.pdf");
    });

    it("vereist na het portfolio-ID geen exacte titelovereenkomst", async () => {
      const title = "Goniometrische & cyclometrische functies";
      const [portfolio] = await indexSource(assignmentProvider("1", title, [
        "Portfolio 1 - Goniometrische functies & cyclometrische functies.pdf",
      ]));

      expect(portfolio.assignmentPdfPath).toContain("Portfolio 1 - Goniometrische functies & cyclometrische functies.pdf");
    });

    it("selecteert niets en waarschuwt deterministisch bij meerdere geldige kandidaten", async () => {
      const [portfolio] = await indexSource(assignmentProvider("1", "Test", [
        "Portfolio 1 - B.pdf",
        "Portfolio 1 - A.pdf",
      ]));

      expect(portfolio.assignmentPdfPath).toBeNull();
      expect(portfolio.warnings).toContainEqual({
        severity: "warning",
        path: "Portfolio 1 - Test",
        message: "Meerdere mogelijke opgaven-PDF's herkend: Portfolio 1 - A.pdf, Portfolio 1 - B.pdf. Geen bestand gekozen.",
      });
    });

    it("behoudt de bestaande missing-documentwarning zonder geldige kandidaat", async () => {
      const [portfolio] = await indexSource(assignmentProvider("1", "Test", ["Hints portfolio 1.pdf"]));

      expect(portfolio.assignmentPdfPath).toBeNull();
      expect(portfolio.warnings).toContainEqual({
        severity: "warning",
        path: "Portfolio 1 - Test",
        message: "Geen opgaven-PDF herkend.",
      });
    });
  });

  describe("Hints-documentherkenning", () => {
    it("laat Hints leeg en waarschuwt niet wanneer geen kandidaat bestaat", async () => {
      const [portfolio] = await indexSource(assignmentProvider("1", "Test", ["Portfolio 1 - Test.pdf"]));

      expect(portfolio.hintsDocumentPath).toBeNull();
      expect(portfolio.warnings.some((warning) => warning.message.includes("Hints"))).toBe(false);
    });

    it("koppelt precies één geldig Hints-bestand zonder bestaande documenten te wijzigen", async () => {
      const [portfolio] = await indexSource(assignmentProvider("1", "Test", [
        "Portfolio 1 - Test.pdf",
        "Hints portfolio 1 - Test.pdf",
      ]));

      expect(portfolio.hintsDocumentPath).toBe("Portfolio 1 - Test/Hints portfolio 1 - Test.pdf");
      expect(portfolio.assignmentPdfPath).toBe("Portfolio 1 - Test/Portfolio 1 - Test.pdf");
      expect(portfolio.finalSolutionsPdfPath).toBe("Portfolio 1 - Test/Eindoplossingen portfolio 1.pdf");
    });

    it("gebruikt ook voor Hints de portfoliomap als context, niet een nummer in de bestandsnaam", async () => {
      const [portfolio1] = await indexSource(assignmentProvider("1", "Test", ["Portfolio 1.pdf", "Hints portfolio 10.pdf"]));
      const [portfolio10] = await indexSource(assignmentProvider("10", "Test", ["Portfolio 10.pdf", "Hints portfolio 1.pdf"]));

      expect(portfolio1.hintsDocumentPath).toBe("Portfolio 1 - Test/Hints portfolio 10.pdf");
      expect(portfolio10.hintsDocumentPath).toBe("Portfolio 10 - Test/Hints portfolio 1.pdf");
    });

    it("ondersteunt Hints voor alfanumerieke en letter-ID's", async () => {
      const [portfolio2A] = await indexSource(assignmentProvider("2A", "Test", ["Portfolio 2A.pdf", "Hints portfolio 2A - Integralen.pdf"]));
      const [portfolioX] = await indexSource(assignmentProvider("X", "Test", ["Portfolio X.pdf", "Hints portfolio X - Extra.pdf"]));

      expect(portfolio2A.hintsDocumentPath).toContain("Hints portfolio 2A - Integralen.pdf");
      expect(portfolioX.hintsDocumentPath).toContain("Hints portfolio X - Extra.pdf");
    });

    it("selecteert niets en waarschuwt deterministisch bij meerdere Hints-kandidaten", async () => {
      const [portfolio] = await indexSource(assignmentProvider("1", "Test", [
        "Portfolio 1.pdf",
        "Hints portfolio 1 - B.pdf",
        "Hints portfolio 1 - A.pdf",
      ]));

      expect(portfolio.hintsDocumentPath).toBeNull();
      expect(portfolio.warnings).toContainEqual({
        severity: "warning",
        path: "Portfolio 1 - Test",
        message: "Meerdere mogelijke Hints-PDF's herkend: Hints portfolio 1 - A.pdf, Hints portfolio 1 - B.pdf. Geen bestand gekozen.",
      });
    });
  });

  describe("profielgestuurde globale herkenning", () => {
    it("gebruikt de herkenningsregels, bestandstypes en semantische rollen uit het bronprofiel", async () => {
      const config = profileConfig([
        {
          id: "werkblad", kind: "source_file", label: "Werkblad", icon: "file-text", order: 10, semanticRole: "assignment",
          recognition: { target: "file_name", operator: "starts_with", value: "Werkblad", caseSensitive: false, fileExtensions: ["docx"] },
        },
        {
          id: "tips", kind: "source_file", label: "Tips", icon: "lightbulb", order: 20, semanticRole: "hint",
          recognition: { target: "file_name", operator: "ends_with", value: "Tips", caseSensitive: false, fileExtensions: ["png"] },
        },
        {
          id: "modelantwoord", kind: "source_file", label: "Modelantwoord", icon: "circle-check-big", order: 30, semanticRole: "final_answer",
          recognition: { target: "file_name", operator: "starts_with", value: "MODELANTWOORD", caseSensitive: false, fileExtensions: ["jpeg"] },
        },
      ]);
      const [portfolio] = await indexSource(assignmentProvider("1", "Test", [
        "Werkblad portfolio 1.docx",
        "Portfolio 1 - Tips.PNG",
        "Modelantwoord portfolio 1.jpeg",
        "Werkblad portfolio 1.pdf",
      ]), config);

      expect(portfolio.assignmentPdfPath).toBe("Portfolio 1 - Test/Werkblad portfolio 1.docx");
      expect(portfolio.hintsDocumentPath).toBe("Portfolio 1 - Test/Portfolio 1 - Tips.PNG");
      expect(portfolio.finalSolutionsPdfPath).toBe("Portfolio 1 - Test/Modelantwoord portfolio 1.jpeg");
    });

    it("respecteert hoofdlettergevoeligheid maar gebruikt de portfoliomap als bron van waarheid", async () => {
      const config = profileConfig([
        {
          id: "werkblad", kind: "source_file", label: "Werkblad", icon: "file-text", order: 10, semanticRole: "assignment",
          recognition: { target: "file_name", operator: "starts_with", value: "WERKBLAD", caseSensitive: true, fileExtensions: ["pdf"] },
        },
      ]);
      const [portfolio] = await indexSource(assignmentProvider("1", "Test", [
        "Werkblad portfolio 1.pdf",
        "WERKBLAD portfolio 10.pdf",
      ]), config);

      // Het nummer in de bestandsnaam bepaalt niet tot welk portfolio het bestand hoort;
      // de map doet dat. Alleen de ingestelde bronprofielregel wordt hier toegepast.
      expect(portfolio.assignmentPdfPath).toBe("Portfolio 1 - Test/WERKBLAD portfolio 10.pdf");
      expect(portfolio.warnings.some((warning) => warning.message === "Geen opgaven-PDF herkend.")).toBe(false);
    });

    it("weigert een globaal bestand dat meerdere bronprofielregels tegelijk matcht", async () => {
      const config = profileConfig([
        {
          id: "one", kind: "source_file", label: "Regel een", icon: "file-text", order: 10, semanticRole: "assignment",
          recognition: { target: "file_name", operator: "starts_with", value: "Portfolio", caseSensitive: false, fileExtensions: ["pdf"] },
        },
        {
          id: "two", kind: "source_file", label: "Regel twee", icon: "book-open", order: 20, semanticRole: "generic",
          recognition: { target: "file_name", operator: "ends_with", value: "Test", caseSensitive: false, fileExtensions: ["pdf"] },
        },
      ]);
      const [portfolio] = await indexSource(assignmentProvider("1", "Test", ["Portfolio 1 - Test.pdf"]), config);

      expect(portfolio.resourceAssets).toHaveLength(0);
      expect(portfolio.warnings).toContainEqual(expect.objectContaining({
        path: "Portfolio 1 - Test/Portfolio 1 - Test.pdf",
        message: "Bestand voldoet aan meerdere globale bronprofielregels: Regel een, Regel twee. Geen resource gekozen.",
      }));
    });
  });

  describe("profielgestuurde oefeningsresources", () => {
    it("gebruikt semantische rollen en toegelaten extensies voor standard en alternative", async () => {
      const config = profileConfig(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources, [
        {
          id: "eigen-model", kind: "source_file", label: "Eigen model", icon: "circle-check-big", order: 10, semanticRole: "worked_solution",
          location: { scope: "alongside_exercise" }, recognition: { target: "fallback", fileExtensions: ["png"] },
          allowMultiple: true, displayMode: "collapsible_group",
        },
        {
          id: "andere-alt-id", kind: "source_file", label: "Andere aanpak", icon: "sparkles", order: 20, semanticRole: "alternative_solution",
          location: { scope: "alongside_exercise" }, recognition: { target: "after_exercise_number", operator: "starts_with", value: "-alt", caseSensitive: false, fileExtensions: ["png"] },
          allowMultiple: true, displayMode: "collapsible_group",
        },
      ]);

      const [portfolio] = await indexSource(provider, config);
      const exercise = portfolio.sections[0].exercises.find((item) => item.code === "2b");

      expect(exercise?.assets.map((asset) => [asset.resourceId, asset.legacyVariant, asset.fileName])).toEqual([
        ["eigen-model", "standard", "PF3-Oef2b(1).png"],
        ["eigen-model", "standard", "PF3-Oef2b(2).png"],
        ["andere-alt-id", "alternative", "PF3-Oef2b-alt(1).png"],
      ]);
    });

    it("herkent een vrij oefeningsonderdeel via tekst na het oefeningnummer zonder de fallback te kapen", async () => {
      const config = profileConfig(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources, [
        {
          id: "exercise-hint", kind: "source_file", label: "Hint", icon: "lightbulb", order: 5, semanticRole: "hint",
          location: { scope: "alongside_exercise" }, recognition: { target: "after_exercise_number", operator: "starts_with", value: "-hint", caseSensitive: false, fileExtensions: ["png"] },
          allowMultiple: true, displayMode: "collapsible_each",
        },
        ...BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources,
      ]);
      const [portfolio] = await indexSource(exerciseFilesProvider([
        "PF3-Oef2b.png",
        "PF3-Oef2b-hint.png",
        "PF3-Oef2b-alt.png",
      ]), config);
      const exercise = portfolio.sections[0].exercises.find((item) => item.code === "2b")!;

      expect(exercise.assets.map((asset) => [asset.resourceId, asset.legacyVariant, asset.fileName])).toEqual([
        ["exercise-hint", null, "PF3-Oef2b-hint.png"],
        ["worked-solution", "standard", "PF3-Oef2b.png"],
        ["alternative-solution", "alternative", "PF3-Oef2b-alt.png"],
      ]);
    });

    it("weigert een bestand dat meerdere expliciete onderdeelregels matcht", async () => {
      const config = profileConfig(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources, [
        {
          id: "hint-a", kind: "source_file", label: "Hint A", icon: "lightbulb", order: 5, semanticRole: "hint",
          location: { scope: "alongside_exercise" }, recognition: { target: "after_exercise_number", operator: "starts_with", value: "-hint", caseSensitive: false, fileExtensions: ["png"] },
          allowMultiple: true, displayMode: "collapsible_each",
        },
        {
          id: "hint-b", kind: "source_file", label: "Hint B", icon: "book-open", order: 6, semanticRole: "explanation",
          location: { scope: "alongside_exercise" }, recognition: { target: "after_exercise_number", operator: "contains", value: "hint", caseSensitive: false, fileExtensions: ["png"] },
          allowMultiple: true, displayMode: "collapsible_group",
        },
        ...BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources,
      ]);
      const [portfolio] = await indexSource(exerciseFilesProvider(["PF3-Oef2b-hint.png"]), config);

      expect(portfolio.sections[0].exercises).toHaveLength(0);
      expect(portfolio.warnings).toContainEqual(expect.objectContaining({
        path: expect.stringContaining("PF3-Oef2b-hint.png"),
        message: "Bestand voldoet aan meerdere onderdeelregels: Hint A, Hint B. Geen onderdeel gekozen.",
      }));
    });

    it("neemt bij meerdere toegestane bestanden alle matches alfabetisch op", async () => {
      const config = profileConfig(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources, [{
        id: "exercise-hint", kind: "source_file", label: "Hint", icon: "lightbulb", order: 5, semanticRole: "hint",
        location: { scope: "alongside_exercise" }, recognition: { target: "after_exercise_number", operator: "starts_with", value: "-hint", caseSensitive: false, fileExtensions: ["png"] },
        allowMultiple: true, displayMode: "collapsible_each",
      }]);
      const [portfolio] = await indexSource(exerciseFilesProvider([
        "PF3-Oef2b-hint-b.png",
        "PF3-Oef2b-hint-a.png",
      ]), config);

      const exercise = portfolio.sections[0].exercises.find((item) => item.code === "2b");
      expect(exercise?.assets.map((asset) => asset.fileName)).toEqual([
        "PF3-Oef2b-hint-a.png",
        "PF3-Oef2b-hint-b.png",
      ]);
    });

    it("kiest niets als een onderdeel slechts één bestand toelaat en meerdere bestanden matchen", async () => {
      const config = profileConfig(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources, [{
        id: "assignment", kind: "source_file", label: "Opgave", icon: "file-text", order: 10, semanticRole: "assignment",
        location: { scope: "alongside_exercise" }, recognition: { target: "after_exercise_number", operator: "starts_with", value: "-opgave", caseSensitive: false, fileExtensions: ["pdf"] },
        allowMultiple: false, displayMode: "always",
      }]);
      const [portfolio] = await indexSource(exerciseFilesProvider([
        "PF3-Oef2b-opgave-a.pdf",
        "PF3-Oef2b-opgave-b.pdf",
      ]), config);

      expect(portfolio.sections[0].exercises).toHaveLength(0);
      expect(portfolio.warnings).toContainEqual(expect.objectContaining({
        message: expect.stringContaining("Dit onderdeel laat maar één bestand toe; er is niets gekozen."),
      }));
    });

    it("is onafhankelijk van de volgorde waarin de provider bestanden teruggeeft", async () => {
      const config = profileConfig(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources, [
        {
          id: "exercise-hint", kind: "source_file", label: "Hint", icon: "lightbulb", order: 5, semanticRole: "hint",
          location: { scope: "alongside_exercise" }, recognition: { target: "after_exercise_number", operator: "starts_with", value: "-hint", caseSensitive: false, fileExtensions: ["png"] },
          allowMultiple: true, displayMode: "collapsible_each",
        },
        ...BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources,
      ]);
      const files = ["PF3-Oef10.png", "PF3-Oef2b-hint.png", "PF3-Oef2b-alt.png", "PF3-Oef2b.png"];
      const normal = await indexSource(exerciseFilesProvider(files), config);
      const reversed = await indexSource(exerciseFilesProvider([...files].reverse()), config);

      expect(reversed).toEqual(normal);
    });

    it("houdt legacy gedrag intact wanneer exerciseResources in een oude V1-config ontbreken", async () => {
      const config = parseSourceProfileConfig({
        configVersion: 1,
        scanner: { convention: "legacy_portfolio_v1", exercise: { numberLocation: "after_text", marker: "Oef" } },
        globalResources: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources,
      });

      const [portfolio] = await indexSource(provider, config);
      const exercise = portfolio.sections[0].exercises.find((item) => item.code === "2b");
      expect(exercise?.assets.map((asset) => asset.parsed.variant)).toEqual(["standard", "standard", "alternative"]);
    });
  });

  describe("flexibele oefeningsherkenning", () => {
    it("onderscheidt Oef3uitwerking en Oef3auitwerking met een regel na het oefeningnummer", async () => {
      const config = profileConfig(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources, [{
        id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 10, semanticRole: "worked_solution",
        location: { scope: "alongside_exercise" },
        recognition: { target: "after_exercise_number", operator: "starts_with", value: "uitwerking", caseSensitive: false, fileExtensions: ["png"] },
        allowMultiple: true, displayMode: "collapsible_group",
      }]);
      const [portfolio] = await indexSource(exerciseFilesProvider(["PF1-Oef3uitwerking.png", "PF1-Oef3auitwerking.png", "PF1-Oef3auitwerkingvervolg.png"]), config);
      expect(portfolio.sections[0].exercises.map((exercise) => [exercise.code, exercise.assets.map((asset) => asset.fileName)])).toEqual([
        ["3", ["PF1-Oef3uitwerking.png"]],
        ["3a", ["PF1-Oef3auitwerking.png", "PF1-Oef3auitwerkingvervolg.png"]],
      ]);
    });

    it("past een bestandsnaamregel niet toe op een oefeningsbestand", async () => {
      const config = profileConfig(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources, [{
        id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 10, semanticRole: "worked_solution",
        location: { scope: "alongside_exercise" },
        recognition: { target: "file_name", operator: "contains", value: "uitwerking", caseSensitive: false, fileExtensions: ["png"] },
        allowMultiple: true, displayMode: "collapsible_group",
      }]);
      const [portfolio] = await indexSource(exerciseFilesProvider(["PF1-Oef3uitwerking.png"]), config);
      expect(portfolio.sections[0]?.exercises ?? []).toHaveLength(0);
      expect(portfolio.warnings).toHaveLength(0);
    });

    it("houdt een beschrijvende vervolgnaam bij het langste geldige oefeningnummer wanneer er een echte grens staat", async () => {
      const [portfolio] = await indexSource(exerciseFilesProvider([
        "PF1-Oef3a.png",
        "PF1-Oef3a vervolg.png",
        "PF1-Oef3a(2).png",
      ]));
      expect(portfolio.sections[0].exercises.map((exercise) => exercise.code)).toEqual(["3a"]);
      expect(portfolio.sections[0].exercises[0].assets.map((asset) => asset.fileName)).toEqual([
        "PF1-Oef3a vervolg.png",
        "PF1-Oef3a(2).png",
        "PF1-Oef3a.png",
      ].sort((left, right) => left.localeCompare(right, "nl")));
    });

    it("ondersteunt een eigen marker en oefeningnummers aan het begin zonder aparte bestands/mapinstelling", async () => {
      const afterVraag = profileConfig([], [{
        id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 10, semanticRole: "worked_solution",
        location: { scope: "alongside_exercise" }, recognition: { target: "fallback", fileExtensions: ["png"] },
        allowMultiple: true, displayMode: "collapsible_group",
      }], { exerciseMode: "files_and_directories", numberLocation: "after_text", marker: "Vraag" });
      const [markerPortfolio] = await indexSource(exerciseFilesProvider(["reeks-Vraag12b.png"]), afterVraag);
      expect(markerPortfolio.sections[0].exercises[0].code).toBe("12b");

      const atStart = profileConfig([], [{
        id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 10, semanticRole: "worked_solution",
        location: { scope: "alongside_exercise" }, recognition: { target: "fallback", fileExtensions: ["png"] },
        allowMultiple: true, displayMode: "collapsible_group",
      }], { exerciseMode: "files_and_directories", numberLocation: "start", marker: "" });
      const [startPortfolio] = await indexSource(exerciseFilesProvider(["7a.png"]), atStart);
      expect(startPortfolio.sections[0].exercises[0].code).toBe("7a");
    });

    it("laat meerdere fallback-onderdelen toe wanneer locatie of bestandstype ze eenduidig maakt", async () => {
      const portfolioPath = "Portfolio 8 - Fallbacks";
      const assetsPath = `${portfolioPath}/assets`;
      const fallbackProvider: StorageProvider = {
        id: "multiple-fallbacks",
        async list(relativePath = "") {
          if (!relativePath) return [{ name: portfolioPath, relativePath: portfolioPath, kind: "directory" }];
          if (relativePath === portfolioPath) return [
            { name: "PF8-Oef1.pdf", relativePath: `${portfolioPath}/PF8-Oef1.pdf`, kind: "file" },
            { name: "assets", relativePath: assetsPath, kind: "directory" },
          ];
          if (relativePath === assetsPath) return [
            { name: "PF8-Oef1.png", relativePath: `${assetsPath}/PF8-Oef1.png`, kind: "file" },
          ];
          return [];
        },
        async readFile() { return Buffer.from(""); },
      };
      const config = profileConfig([], [
        { id: "assignment", kind: "source_file", label: "Opgave", icon: "file-text", order: 10, semanticRole: "assignment", location: { scope: "alongside_exercise" }, recognition: { target: "fallback", fileExtensions: ["pdf"] }, allowMultiple: false, displayMode: "always" },
        { id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 20, semanticRole: "worked_solution", location: { scope: "subdirectory", subdirectory: "assets" }, recognition: { target: "fallback", fileExtensions: ["png"] }, allowMultiple: true, displayMode: "collapsible_group" },
      ]);

      const [portfolio] = await indexSource(fallbackProvider, config);
      expect(portfolio.sections[0].exercises[0].assets.map((asset) => [asset.resourceId, asset.fileName])).toEqual([
        ["assignment", "PF8-Oef1.pdf"],
        ["worked", "PF8-Oef1.png"],
      ]);
      expect(portfolio.warnings).toHaveLength(0);
    });

    it("herkent een portfolio zonder onderdelen en zoekt uitwerkingen in een submap", async () => {
      const portfolioPath = "Portfolio 8 - Zonder onderdelen";
      const assetsPath = `${portfolioPath}/assets`;
      const noSectionsProvider: StorageProvider = {
        id: "no-sections",
        async list(relativePath = "") {
          if (!relativePath) return [{ name: portfolioPath, relativePath: portfolioPath, kind: "directory" }];
          if (relativePath === portfolioPath) return [
            { name: "PF8-Oef1.pdf", relativePath: `${portfolioPath}/PF8-Oef1.pdf`, kind: "file" },
            { name: "assets", relativePath: assetsPath, kind: "directory" },
          ];
          if (relativePath === assetsPath) return [
            { name: "PF8-Oef1uitwerking.png", relativePath: `${assetsPath}/PF8-Oef1uitwerking.png`, kind: "file" },
            { name: "PF8-Oef1uitwerkingvervolg.png", relativePath: `${assetsPath}/PF8-Oef1uitwerkingvervolg.png`, kind: "file" },
          ];
          return [];
        },
        async readFile() { return Buffer.from(""); },
      };
      const config = profileConfig([], [
        { id: "assignment", kind: "source_file", label: "Opgave", icon: "file-text", order: 10, semanticRole: "assignment", location: { scope: "alongside_exercise" }, recognition: { target: "fallback", fileExtensions: ["pdf"] }, allowMultiple: false, displayMode: "always" },
        { id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 20, semanticRole: "worked_solution", location: { scope: "subdirectory", subdirectory: "assets" }, recognition: { target: "after_exercise_number", operator: "starts_with", value: "uitwerking", caseSensitive: false, fileExtensions: ["png"] }, allowMultiple: true, displayMode: "collapsible_group" },
      ]);
      const [portfolio] = await indexSource(noSectionsProvider, config);
      expect(portfolio.sections).toHaveLength(1);
      expect(portfolio.sections[0].title).toBe("Oefeningen");
      const exercise = portfolio.sections[0].exercises[0];
      expect(exercise.code).toBe("1");
      expect(exercise.assets.map((asset) => asset.fileName)).toEqual(["PF8-Oef1.pdf", "PF8-Oef1uitwerking.png", "PF8-Oef1uitwerkingvervolg.png"]);
    });

    it("kan voor één onderdeel zowel bij de oefening als in een vaste submap zoeken", async () => {
      const portfolioPath = "Portfolio 8 - Gemengd";
      const assetsPath = `${portfolioPath}/assets`;
      const mixedProvider: StorageProvider = {
        id: "mixed-location",
        async list(relativePath = "") {
          if (!relativePath) return [{ name: portfolioPath, relativePath: portfolioPath, kind: "directory" }];
          if (relativePath === portfolioPath) return [
            { name: "PF8-Oef2-uitwerking-a.png", relativePath: `${portfolioPath}/PF8-Oef2-uitwerking-a.png`, kind: "file" },
            { name: "assets", relativePath: assetsPath, kind: "directory" },
          ];
          if (relativePath === assetsPath) return [
            { name: "PF8-Oef2-uitwerking-b.png", relativePath: `${assetsPath}/PF8-Oef2-uitwerking-b.png`, kind: "file" },
          ];
          return [];
        },
        async readFile() { return Buffer.from(""); },
      };
      const config = profileConfig([], [{
        id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 10, semanticRole: "worked_solution",
        location: { scope: "alongside_and_subdirectory", subdirectory: "assets" },
        recognition: { target: "after_exercise_number", operator: "starts_with", value: "-uitwerking", caseSensitive: false, fileExtensions: ["png"] },
        allowMultiple: true, displayMode: "collapsible_group",
      }]);
      const [portfolio] = await indexSource(mixedProvider, config);
      expect(portfolio.sections[0].exercises[0].assets.map((asset) => asset.fileName)).toEqual([
        "PF8-Oef2-uitwerking-a.png",
        "PF8-Oef2-uitwerking-b.png",
      ]);
    });

    it("herkent oefeningsmappen en bestandsnaamregels binnen zo'n map", async () => {
      const portfolioPath = "Portfolio 9 - Mappen";
      const exercisePath = `${portfolioPath}/Oef3a`;
      const folderProvider: StorageProvider = {
        id: "exercise-folders",
        async list(relativePath = "") {
          if (!relativePath) return [{ name: portfolioPath, relativePath: portfolioPath, kind: "directory" }];
          if (relativePath === portfolioPath) return [{ name: "Oef3a", relativePath: exercisePath, kind: "directory" }];
          if (relativePath === exercisePath) return [
            { name: "opgave.pdf", relativePath: `${exercisePath}/opgave.pdf`, kind: "file" },
            { name: "uitwerking.png", relativePath: `${exercisePath}/uitwerking.png`, kind: "file" },
            { name: "uitwerking vervolg.png", relativePath: `${exercisePath}/uitwerking vervolg.png`, kind: "file" },
          ];
          return [];
        },
        async readFile() { return Buffer.from(""); },
      };
      const config = profileConfig([], [
        { id: "assignment", kind: "source_file", label: "Opgave", icon: "file-text", order: 10, semanticRole: "assignment", location: { scope: "alongside_exercise" }, recognition: { target: "file_name", operator: "starts_with", value: "opgave", caseSensitive: false, fileExtensions: ["pdf"] }, allowMultiple: false, displayMode: "always" },
        { id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 20, semanticRole: "worked_solution", location: { scope: "alongside_exercise" }, recognition: { target: "file_name", operator: "starts_with", value: "uitwerking", caseSensitive: false, fileExtensions: ["png"] }, allowMultiple: true, displayMode: "collapsible_group" },
      ]);
      const [portfolio] = await indexSource(folderProvider, config);
      expect(portfolio.sections[0].exercises[0].code).toBe("3a");
      expect(portfolio.sections[0].exercises[0].assets.map((asset) => asset.fileName)).toEqual(["opgave.pdf", "uitwerking vervolg.png", "uitwerking.png"].sort((a, b) => a.localeCompare(b, "nl")));
    });

    it("herkent in mixed mode file- en directory-oefeningen met strikt gescheiden contextregels", async () => {
      const [portfolio] = await indexSource(locationAwareExerciseProvider(), locationAwareConfig("files_and_directories"));

      expect(portfolio.sections[0].exercises.map((exercise) => [
        exercise.code,
        exercise.assets.map((asset) => [asset.resourceId, asset.fileName]),
      ])).toEqual([
        ["1", [["worked", "Oef1-uitwerking.png"]]],
        ["2", [
          ["worked", "uitwerking.png"],
          ["hints", "hints.jpg"],
          ["alternative", "alternatief.png"],
        ]],
      ]);
      expect(portfolio.warnings).toHaveLength(0);
    });

    it("laat files-only uitsluitend oefeningsbestanden indexeren", async () => {
      const [portfolio] = await indexSource(locationAwareExerciseProvider(), locationAwareConfig("files"));
      expect(portfolio.sections[0].exercises.map((exercise) => exercise.code)).toEqual(["1"]);
      expect(portfolio.sections[0].exercises[0].assets.map((asset) => asset.resourceId)).toEqual(["worked"]);
    });

    it("laat directories-only uitsluitend oefeningsmappen indexeren", async () => {
      const [portfolio] = await indexSource(locationAwareExerciseProvider(), locationAwareConfig("directories"));
      expect(portfolio.sections[0].exercises.map((exercise) => exercise.code)).toEqual(["2"]);
      expect(portfolio.sections[0].exercises[0].assets.map((asset) => asset.resourceId)).toEqual(["worked", "hints", "alternative"]);
    });

    it("houdt fallbackherkenning lokaal binnen de oefeningscontext", async () => {
      const config = profileConfig([], [{
        id: "file-fallback", kind: "source_file", label: "Bestandsfallback", icon: "file-text", order: 10, semanticRole: "generic",
        location: { scope: "alongside_exercise" },
        recognition: { file: { target: "fallback" }, directory: null, fileExtensions: ["png", "jpg"] },
        allowMultiple: true, displayMode: "collapsible_group",
      }], { exerciseMode: "files_and_directories", numberLocation: "after_text", marker: "Oef" });
      const [portfolio] = await indexSource(locationAwareExerciseProvider(), config);

      expect(portfolio.sections[0].exercises.map((exercise) => exercise.code)).toEqual(["1"]);
      expect(portfolio.sections[0].exercises[0].assets.map((asset) => asset.fileName)).toEqual(["Oef1-uitwerking.png"]);
    });

    it("herkent directe resources voor file-oefeningen via tekst na het oefeningnummer", async () => {
      const config = profileConfig([], [{
        id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 10, semanticRole: "worked_solution",
        location: { scope: "alongside_exercise" },
        recognition: { file: { target: "after_exercise_number", operator: "exact", value: "-uitwerking", caseSensitive: false }, directory: null, fileExtensions: ["png"] },
        allowMultiple: false, displayMode: "collapsible_group",
      }], { exerciseMode: "files", numberLocation: "after_text", marker: "Oef" });
      const [portfolio] = await indexSource(exerciseFilesProvider(["Oef3-uitwerking.png", "Oef4-uitwerking.png"]), config);

      expect(portfolio.sections[0].exercises.map((exercise) => [exercise.code, exercise.assets[0].resourceId])).toEqual([
        ["3", "worked"],
        ["4", "worked"],
      ]);
    });

    it("koppelt genummerde resources in een vaste submap aan file-oefeningen via fallback", async () => {
      const config = profileConfig([], [{
        id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 10, semanticRole: "worked_solution",
        location: { scope: "subdirectory", subdirectory: "Uitwerkingen" },
        recognition: { file: { target: "fallback" }, directory: null, fileExtensions: ["png"] },
        allowMultiple: false, displayMode: "collapsible_group",
      }], { exerciseMode: "files", numberLocation: "after_text", marker: "Oef" });
      const [portfolio] = await indexSource(fileExerciseSubdirectoryProvider(["Oef3.png", "Oef4.png"]), config);

      expect(portfolio.sections[0].exercises.map((exercise) => [exercise.code, exercise.assets[0].relativePath])).toEqual([
        ["3", "Portfolio X - Bestandoefeningen/Uitwerkingen/Oef3.png"],
        ["4", "Portfolio X - Bestandoefeningen/Uitwerkingen/Oef4.png"],
      ]);
      expect(portfolio.warnings).toHaveLength(0);
    });

    it("koppelt een ongenummerd submapbestand niet op basis van nabijheid aan een file-oefening", async () => {
      const config = profileConfig([], [{
        id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 10, semanticRole: "worked_solution",
        location: { scope: "subdirectory", subdirectory: "Uitwerkingen" },
        recognition: { file: { target: "fallback" }, directory: null, fileExtensions: ["png"] },
        allowMultiple: false, displayMode: "collapsible_group",
      }], { exerciseMode: "files", numberLocation: "after_text", marker: "Oef" });
      const [portfolio] = await indexSource(fileExerciseSubdirectoryProvider(["uitwerking.png"]), config);

      expect(portfolio.sections[0].exercises).toHaveLength(0);
      expect(portfolio.warnings).toHaveLength(0);
    });

    it("ondersteunt tekst na oefeningnummer binnen een oefeningsmap", async () => {
      const config = profileConfig([], [{
        id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 10, semanticRole: "worked_solution",
        location: { scope: "alongside_exercise" },
        recognition: { file: null, directory: { target: "after_exercise_number", operator: "exact", value: "-uitwerking", caseSensitive: false }, fileExtensions: ["png"] },
        allowMultiple: false, displayMode: "collapsible_group",
      }], { exerciseMode: "directories", numberLocation: "after_text", marker: "Oef" });
      const [portfolio] = await indexSource(directoryExerciseProvider({ direct: ["Oef3-uitwerking.png"] }), config);

      expect(portfolio.sections[0].exercises[0].code).toBe("3");
      expect(portfolio.sections[0].exercises[0].assets[0]).toMatchObject({ resourceId: "worked", fileName: "Oef3-uitwerking.png" });
    });

    it("herkent een resource in een submap van een oefeningsmap", async () => {
      const config = profileConfig([], [{
        id: "hints", kind: "source_file", label: "Hints", icon: "lightbulb", order: 10, semanticRole: "hint",
        location: { scope: "subdirectory", subdirectory: "assets" },
        recognition: { file: null, directory: { target: "file_name", operator: "exact", value: "hint", caseSensitive: false }, fileExtensions: ["jpg"] },
        allowMultiple: false, displayMode: "collapsible_each",
      }], { exerciseMode: "directories", numberLocation: "after_text", marker: "Oef" });
      const [portfolio] = await indexSource(directoryExerciseProvider({ assets: ["hint.jpg"] }), config);

      expect(portfolio.sections[0].exercises[0].assets[0]).toMatchObject({ resourceId: "hints", relativePath: "Portfolio X - Mapoefeningen/Oef3/assets/hint.jpg" });
    });

    it("laat een directory-fallback geen file-oefening kapen", async () => {
      const config = profileConfig([], [{
        id: "directory-fallback", kind: "source_file", label: "Mapfallback", icon: "file-text", order: 10, semanticRole: "generic",
        location: { scope: "alongside_exercise" },
        recognition: { file: null, directory: { target: "fallback" }, fileExtensions: ["png", "jpg"] },
        allowMultiple: true, displayMode: "collapsible_group",
      }], { exerciseMode: "files_and_directories", numberLocation: "after_text", marker: "Oef" });
      const [portfolio] = await indexSource(locationAwareExerciseProvider(), config);

      expect(portfolio.sections[0].exercises.map((exercise) => exercise.code)).toEqual(["2"]);
      expect(portfolio.sections[0].exercises[0].assets.map((asset) => asset.fileName)).toEqual(["alternatief.png", "hints.jpg", "uitwerking.png"]);
    });
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
    expect(portfolio.sections[0].exercises[2].assets[0].parsed).toMatchObject({ portfolioCode: "X", variant: "alternative", step: 1 });
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

  it("waarschuwt bij een ambigu oefeningnummer in plaats van een letter uit de onderdeeltekst op te eten", async () => {
    const ambiguousProvider: StorageProvider = {
      ...provider,
      async list(relativePath = "") {
        if (relativePath === "Portfolio 3 - Toepassingen/Uitwerkingen/1 - Afgeleiden") return [
          { name: "PF3-Oef3uitwerking.png", relativePath: `${relativePath}/PF3-Oef3uitwerking.png`, kind: "file" },
        ];
        return tree[relativePath] ?? [];
      },
    };
    const [portfolio] = await indexSource(ambiguousProvider);
    expect(portfolio.sections[0].exercises).toHaveLength(0);
    expect(portfolio.warnings).toContainEqual(expect.objectContaining({ message: expect.stringContaining("Oefeningnummer kon niet eenduidig worden bepaald") }));
  });

  it("negeert een PF-prefix in de bestandsnaam omdat de portfoliomap de context bepaalt", async () => {
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
    expect(exercise?.assets.map((asset) => asset.fileName)).toEqual(["PF3-Oef10.png", "PF8-Oef10.png"]);
    expect(portfolio.warnings.some((warning) => warning.path.endsWith("PF8-Oef10.png"))).toBe(false);
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
    expect(portfolio.sections[0].exercises.map((exercise) => exercise.code)).toEqual(["1", "30c"]);
    expect(portfolio.sections[0].exercises.some((exercise) => exercise.code === "5" || exercise.code === "10")).toBe(false);
    expect(portfolio.warnings).toHaveLength(0);
  });
});


function profileConfig(
  globalResources: SourceProfileConfig["globalResources"],
  exerciseResources?: unknown,
  exerciseScanner: SourceProfileConfig["scanner"]["exercise"] = { exerciseMode: "files_and_directories", numberLocation: "after_text", marker: "Oef" },
): SourceProfileConfig {
  return parseSourceProfileConfig({
    configVersion: 1,
    scanner: { convention: "legacy_portfolio_v1", exercise: exerciseScanner },
    globalResources,
    ...(exerciseResources ? { exerciseResources } : {}),
  });
}

function locationAwareConfig(exerciseMode: ExerciseMode): SourceProfileConfig {
  return profileConfig([], [
    {
      id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 10, semanticRole: "worked_solution",
      location: { scope: "alongside_exercise" },
      recognition: {
        file: { target: "after_exercise_number", operator: "exact", value: "-uitwerking", caseSensitive: false },
        directory: { target: "file_name", operator: "exact", value: "uitwerking", caseSensitive: false },
        fileExtensions: ["png"],
      },
      allowMultiple: false, displayMode: "collapsible_group",
    },
    {
      id: "hints", kind: "source_file", label: "Hints", icon: "lightbulb", order: 20, semanticRole: "hint",
      location: { scope: "alongside_exercise" },
      recognition: {
        file: { target: "after_exercise_number", operator: "exact", value: "-hints", caseSensitive: false },
        directory: { target: "file_name", operator: "exact", value: "hints", caseSensitive: false },
        fileExtensions: ["jpg"],
      },
      allowMultiple: false, displayMode: "collapsible_each",
    },
    {
      id: "alternative", kind: "source_file", label: "Alternatief", icon: "shapes", order: 30, semanticRole: "alternative_solution",
      location: { scope: "alongside_exercise" },
      recognition: {
        file: { target: "after_exercise_number", operator: "exact", value: "-alternatief", caseSensitive: false },
        directory: { target: "file_name", operator: "exact", value: "alternatief", caseSensitive: false },
        fileExtensions: ["png"],
      },
      allowMultiple: false, displayMode: "collapsible_group",
    },
  ], { exerciseMode, numberLocation: "after_text", marker: "Oef" });
}

function locationAwareExerciseProvider(): StorageProvider {
  const portfolioPath = "Portfolio X - Contextafhankelijk";
  const exercisePath = `${portfolioPath}/Oef2`;
  return {
    id: "location-aware-exercises",
    async list(relativePath = "") {
      if (!relativePath) return [{ name: portfolioPath, relativePath: portfolioPath, kind: "directory" }];
      if (relativePath === portfolioPath) return [
        { name: "Oef1-uitwerking.png", relativePath: `${portfolioPath}/Oef1-uitwerking.png`, kind: "file" },
        { name: "Oef2", relativePath: exercisePath, kind: "directory" },
      ];
      if (relativePath === exercisePath) return [
        { name: "uitwerking.png", relativePath: `${exercisePath}/uitwerking.png`, kind: "file" },
        { name: "hints.jpg", relativePath: `${exercisePath}/hints.jpg`, kind: "file" },
        { name: "alternatief.png", relativePath: `${exercisePath}/alternatief.png`, kind: "file" },
      ];
      return [];
    },
    async readFile() { return Buffer.from(""); },
  };
}

function fileExerciseSubdirectoryProvider(resourceFileNames: readonly string[]): StorageProvider {
  const portfolioPath = "Portfolio X - Bestandoefeningen";
  const resourcePath = `${portfolioPath}/Uitwerkingen`;
  return {
    id: "file-exercise-subdirectory",
    async list(relativePath = "") {
      if (!relativePath) return [{ name: portfolioPath, relativePath: portfolioPath, kind: "directory" }];
      if (relativePath === portfolioPath) return [
        { name: "Oef3.png", relativePath: `${portfolioPath}/Oef3.png`, kind: "file" },
        { name: "Oef4.png", relativePath: `${portfolioPath}/Oef4.png`, kind: "file" },
        { name: "Uitwerkingen", relativePath: resourcePath, kind: "directory" },
      ];
      if (relativePath === resourcePath) return resourceFileNames.map((name) => ({ name, relativePath: `${resourcePath}/${name}`, kind: "file" as const }));
      return [];
    },
    async readFile() { return Buffer.from(""); },
  };
}

function directoryExerciseProvider(files: { direct?: readonly string[]; assets?: readonly string[] }): StorageProvider {
  const portfolioPath = "Portfolio X - Mapoefeningen";
  const exercisePath = `${portfolioPath}/Oef3`;
  const assetsPath = `${exercisePath}/assets`;
  return {
    id: "directory-exercise-context",
    async list(relativePath = "") {
      if (!relativePath) return [{ name: portfolioPath, relativePath: portfolioPath, kind: "directory" }];
      if (relativePath === portfolioPath) return [{ name: "Oef3", relativePath: exercisePath, kind: "directory" }];
      if (relativePath === exercisePath) return [
        ...(files.direct ?? []).map((name) => ({ name, relativePath: `${exercisePath}/${name}`, kind: "file" as const })),
        ...(files.assets ? [{ name: "assets", relativePath: assetsPath, kind: "directory" as const }] : []),
      ];
      if (relativePath === assetsPath) return (files.assets ?? []).map((name) => ({ name, relativePath: `${assetsPath}/${name}`, kind: "file" as const }));
      return [];
    },
    async readFile() { return Buffer.from(""); },
  };
}

function exerciseFilesProvider(fileNames: string[]): StorageProvider {
  const portfolioPath = "Portfolio 3 - Toepassingen";
  const solutionsPath = `${portfolioPath}/Uitwerkingen`;
  const sectionPath = `${solutionsPath}/1 - Afgeleiden`;
  return {
    id: "exercise-files-fixture",
    async list(relativePath = "") {
      if (relativePath === "") return [{ name: portfolioPath, relativePath: portfolioPath, kind: "directory" }];
      if (relativePath === portfolioPath) return [
        { name: "Portfolio 3 - Toepassingen.pdf", relativePath: `${portfolioPath}/Portfolio 3 - Toepassingen.pdf`, kind: "file" },
        { name: "Eindoplossingen portfolio 3.pdf", relativePath: `${portfolioPath}/Eindoplossingen portfolio 3.pdf`, kind: "file" },
        { name: "Uitwerkingen", relativePath: solutionsPath, kind: "directory" },
      ];
      if (relativePath === solutionsPath) return [{ name: "1 - Afgeleiden", relativePath: sectionPath, kind: "directory" }];
      if (relativePath === sectionPath) return fileNames.map((name) => ({ name, relativePath: `${sectionPath}/${name}`, kind: "file" as const }));
      return [];
    },
    async readFile() { return Buffer.from(""); },
  };
}

function assignmentProvider(code: string, title: string, fileNames: string[]): StorageProvider {
  const portfolioPath = `Portfolio ${code} - ${title}`;
  const solutionsPath = `${portfolioPath}/Uitwerkingen`;

  return {
    id: `assignment-${code}`,
    async list(relativePath = "") {
      if (relativePath === "") return [{ name: portfolioPath, relativePath: portfolioPath, kind: "directory" }];
      if (relativePath === portfolioPath) return [
        ...fileNames.map((name) => ({ name, relativePath: `${portfolioPath}/${name}`, kind: "file" as const })),
        { name: `Eindoplossingen portfolio ${code}.pdf`, relativePath: `${portfolioPath}/Eindoplossingen portfolio ${code}.pdf`, kind: "file" as const },
        { name: "Uitwerkingen", relativePath: solutionsPath, kind: "directory" as const },
      ];
      return [];
    },
    async readFile() { return Buffer.from(""); },
  };
}
