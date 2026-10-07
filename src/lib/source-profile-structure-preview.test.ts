import { describe, expect, it } from "vitest";

import { buildSourceStructurePreview, groupSourceStructurePreview } from "@/lib/source-profile-structure-preview";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import { LocalFilesystemProvider } from "@/lib/storage/local-filesystem-provider";
import { indexSource } from "@/lib/storage/portfolio-indexer";
import type { ExerciseResourceConfig, ExerciseScannerConfig } from "@/lib/source-profile-config";

const scanner: ExerciseScannerConfig = {
  exerciseMode: "files",
  numberLocation: "after_text",
  marker: "Oef",
};

const workedSolution: ExerciseResourceConfig = {
  id: "worked-solution",
  kind: "source_file",
  label: "Uitwerking",
  icon: "paperclip",
  order: 10,
  semanticRole: "worked_solution",
  location: { scope: "alongside_exercise" },
  recognition: {
    file: { target: "after_exercise_number", operator: "starts_with", value: "-uitwerking", caseSensitive: false },
    directory: { target: "file_name", operator: "exact", value: "uitwerking", caseSensitive: false },
    fileExtensions: ["png"],
  },
  allowMultiple: false,
  displayMode: "collapsible_group",
};

function flatten(node: ReturnType<typeof buildSourceStructurePreview>["root"]): string[] {
  return [node.name, ...(node.children ?? []).flatMap(flatten)];
}

describe("buildSourceStructurePreview", () => {
  it("keeps the existing example unchanged for explicit none and legacy configs", () => {
    const legacy = buildSourceStructurePreview(scanner, [workedSolution], { method: "none" }, { marker: "H" });
    expect(buildSourceStructurePreview(scanner, [workedSolution], { method: "none" }, { marker: "H", themeMode: "none" })).toEqual(legacy);
    expect(flatten(legacy.root)).not.toContain("Bronmap");
    expect(flatten(legacy.root)).not.toContain("Analyse");
    expect(legacy.notes.some((note) => note.includes("thema"))).toBe(false);
  });

  it("shows theme folders and a direct portfolio in the configured example", () => {
    const preview = buildSourceStructurePreview(scanner, [workedSolution], { method: "none" }, { marker: "H", themeMode: "folder" });
    expect(preview.root.name).toBe("Bronmap");
    expect(preview.root.children?.map((node) => node.name)).toEqual(["Analyse", "Algebra", "H4 - Herhaling"]);
    expect(preview.root.children?.[0]).toMatchObject({
      annotation: "Thema uit bronmap",
      children: [{ name: "H1.1_Stelsels oplossen" }, { name: "H2 - Limieten" }],
    });
    expect(flatten(preview.root)).toContain("Oef1-uitwerking.png");
    expect(preview.notes.some((note) => note.includes("rechtstreeks in de bronmap hebben geen thema"))).toBe(true);
  });

  it("groups real scanner membership by source reference and preserves source folder names", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "portfolio-theme-preview-"));
    try {
      for (const folder of ["02 Analyse/Portfolio 1 Limieten", "02 Analyse/Portfolio 2 Afgeleiden", "Algebra/Portfolio 3 Matrices", "Portfolio 4 Herhaling"]) {
        await mkdir(path.join(root, folder), { recursive: true });
      }
      const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
      config.scanner.portfolio.themeMode = "folder";
      const indexed = await indexSource(new LocalFilesystemProvider(root), config);
      const preview = groupSourceStructurePreview(indexed.map((portfolio) => ({
        sourceTheme: portfolio.sourceTheme,
        node: { kind: "folder" as const, name: portfolio.title, children: [] },
      })));
      expect(preview.children?.map((node) => node.name)).toEqual(["02 Analyse", "Algebra", "Herhaling"]);
      expect(preview.children?.[0].children?.map((node) => node.name)).toEqual(["Limieten", "Afgeleiden"]);
      expect(preview.children?.[1].children?.map((node) => node.name)).toEqual(["Matrices"]);
      expect(preview.children?.[2].annotation).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses the configured portfolio marker and shows direct numeric sections", () => {
    const preview = buildSourceStructurePreview(scanner, [workedSolution], { method: "none" }, { marker: "H" });

    expect(preview.root.name).toBe("H1.1_Stelsels oplossen");
    expect(flatten(preview.root)).toEqual(expect.arrayContaining([
      "1.1 Inleiding",
      "1.2 - Methode van Gauss-Jordan",
      "1.10_Verdieping",
      "2 Toepassingen",
      "header.png",
    ]));
    expect(flatten(preview.root)).not.toContain("Uitwerkingen");
    expect(preview.notes).toContain("Geldige codes voor portfolio's zijn bijvoorbeeld 1, A, 1A, A1, 1.1 en A.1. Mapnamen zoals “H 1.1 Stelsels”, “H 1.1 - Stelsels” en “H1.1-Stelsels” zijn geldig.");
    expect(preview.notes).toContain("Codes voor onderdelen bestaan uit cijfers en numerieke segmenten, zoals 1, 1.1, 1.2 en 1.10. Onderdelen staan rechtstreeks onder de portfolio; een structurele map ‘Uitwerkingen’ is niet nodig. Letter-startende codes worden niet herkend.");
  });

  it("shows a file exercise and a matching direct resource in files mode", () => {
    const preview = buildSourceStructurePreview(scanner, [workedSolution]);
    expect(flatten(preview.root)).toEqual(expect.arrayContaining(["Oef1.png", "Oef1-uitwerking.png"]));
  });

  it("shows resources inside an exercise folder in directories mode", () => {
    const preview = buildSourceStructurePreview({ ...scanner, exerciseMode: "directories" }, [workedSolution]);
    expect(flatten(preview.root)).toEqual(expect.arrayContaining(["Oef1", "uitwerking.png"]));
  });

  it("shows both exercise forms in mixed mode", () => {
    const preview = buildSourceStructurePreview({ ...scanner, exerciseMode: "files_and_directories" }, [workedSolution]);
    expect(flatten(preview.root)).toEqual(expect.arrayContaining(["Oef1.png", "Oef1-uitwerking.png", "Oef2", "uitwerking.png"]));
  });

  it("puts file-exercise fallback resources in their configured subdirectory", () => {
    const fallback: ExerciseResourceConfig = {
      ...workedSolution,
      location: { scope: "subdirectory", subdirectory: "Uitwerkingen" },
      recognition: { ...workedSolution.recognition, file: { target: "fallback" } },
    };
    const preview = buildSourceStructurePreview(scanner, [fallback]);
    expect(flatten(preview.root)).toEqual(expect.arrayContaining(["Uitwerkingen", "Oef1.png"]));
  });

  it("shows the configured subdirectory for a combined direct-or-subdirectory location", () => {
    const combined: ExerciseResourceConfig = {
      ...workedSolution,
      location: { scope: "alongside_and_subdirectory", subdirectory: "Uitwerkingen" },
    };

    const preview = buildSourceStructurePreview(scanner, [combined]);
    expect(flatten(preview.root)).toEqual(expect.arrayContaining(["1.1 Inleiding", "Uitwerkingen", "Oef1-uitwerking.png"]));
  });

  it("illustrates configured level subdirectories", () => {
    const preview = buildSourceStructurePreview(scanner, [workedSolution], {
      method: "subdirectory",
      source: { type: "exercise_resource", resourceId: "worked-solution" },
      mapping: { opwarmer: "Start", basis: "Kern", uitdaging: "Plus", verdieping: "Extra" },
    });

    expect(flatten(preview.root)).toEqual(expect.arrayContaining(["Kern", "Oef1.png", "Oef1-uitwerking.png"]));
    expect(preview.notes).toContain("De ingestelde submapnaam bepaalt in dit voorbeeld automatisch het niveau van de oefening.");
    expect(flatten(preview.root)).toEqual(expect.arrayContaining(["1.1 Inleiding", "Kern", "Oef1.png"]));
  });

  it("adds the configured suffix to the selected resource file", () => {
    const preview = buildSourceStructurePreview(scanner, [workedSolution], {
      method: "marker",
      source: { type: "exercise_resource", resourceId: "worked-solution" },
      convention: "suffix_code",
      prefix: "",
      mapping: { opwarmer: "O", basis: "B", uitdaging: "U", verdieping: "V" },
    });

    expect(flatten(preview.root)).toContain("Oef1-uitwerking-B.png");
  });

  it("adds the configured recognizer and code to the selected resource file", () => {
    const preview = buildSourceStructurePreview(scanner, [workedSolution], {
      method: "marker",
      source: { type: "exercise_resource", resourceId: "worked-solution" },
      convention: "prefixed_code",
      prefix: "Niv",
      mapping: { opwarmer: "1", basis: "2", uitdaging: "3", verdieping: "4" },
    });

    expect(flatten(preview.root)).toContain("Oef1-uitwerking-Niv2.png");
  });

  it("adds the configured marker to an exercise directory name", () => {
    const preview = buildSourceStructurePreview({ ...scanner, exerciseMode: "directories" }, [workedSolution], {
      method: "marker",
      source: { type: "exercise_directory" },
      convention: "suffix_code",
      prefix: "",
      mapping: { opwarmer: "O", basis: "B", uitdaging: "U", verdieping: "V" },
    });

    expect(flatten(preview.root)).toEqual(expect.arrayContaining(["Oef1-B", "uitwerking.png"]));
  });
});

function nodes(node: ReturnType<typeof buildSourceStructurePreview>["root"]): ReturnType<typeof buildSourceStructurePreview>["root"][] {
  return [node, ...(node.children ?? []).flatMap(nodes)];
}
const defaults = BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG;
function example(mode: ExerciseScannerConfig["exerciseMode"] = "files_and_directories") {
  return buildSourceStructurePreview({ ...scanner, exerciseMode: mode }, defaults.exerciseResources, { method: "none" }, defaults.scanner.portfolio, {}, defaults.globalResources);
}
describe("generated interpretation", () => {
  it.each(["files", "directories", "files_and_directories"] as const)("shows direct and sectioned exercises without a fabricated section (%s)", (mode) => {
    const preview = example(mode);
    const direct = preview.root.children!.find((node) => node.name.startsWith("Oef3"));
    expect(direct?.interpretation).toContain("Oefening 3");
    const section = preview.root.children!.find((node) => node.name === "1.1 Inleiding")!;
    expect(nodes(section).some((node) => node.interpretation?.includes("Oefening 1"))).toBe(true);
    expect(section.interpretation).toEqual(["Onderdeel 1.1 · Inleiding"]);
    expect(preview.root.interpretation).toEqual(["Portfolio 1.1 · Stelsels oplossen"]);
    if (mode === "files_and_directories") expect(nodes(preview.root).find((node) => node.name === "Oef2")?.interpretation).toEqual(["Oefening 2"]);
  });
  it("uses configured material and document labels and omits physical files for links", () => {
    const resources = structuredClone(defaults.exerciseResources);
    resources[0].label = "Mijn uitwerking";
    const documents = structuredClone(defaults.globalResources);
    documents[0].label = "Lesdocument";
    const preview = buildSourceStructurePreview(scanner, resources, { method: "none" }, defaults.scanner.portfolio, {}, documents);
    const labels = nodes(preview.root).flatMap((node) => node.interpretation ?? []);
    expect(labels).toContain("Materiaal: Mijn uitwerking");
    expect(labels).toContain("Materiaal: Alternatieve uitwerking");
    expect(labels).toContain("Document: Lesdocument");
    expect(labels.some((label) => label.startsWith("Niveau:"))).toBe(false);
    const link = { id: "link", kind: "external_link" as const, label: "Website", icon: "link" as const, order: 100, semanticRole: "generic" as const, urlTemplate: "https://example.com" };
    expect(flatten(buildSourceStructurePreview(scanner, resources, { method: "none" }, defaults.scanner.portfolio, {}, [link]).root)).not.toContain("Website");
  });
  it("shows one theme layer and a collection containing only direct exercises", () => {
    const preview = buildSourceStructurePreview(scanner, defaults.exerciseResources, { method: "none" }, { marker: "H", themeMode: "folder" });
    const analysis = preview.root.children![0];
    expect(analysis.interpretation).toEqual(["Thema: Analyse"]);
    const directOnly = analysis.children![1];
    expect(directOnly.children!.some((node) => node.interpretation?.some((label) => label.startsWith("Onderdeel")))).toBe(false);
    expect(nodes(directOnly).some((node) => node.interpretation?.includes("Oefening 3"))).toBe(true);
  });
  it.each(["subdirectory", "marker"] as const)("uses existing level detection (%s)", (method) => {
    const recognition = method === "subdirectory" ? {
      method, source: { type: "exercise_resource" as const, resourceId: "worked-solution" },
      mapping: { opwarmer: "Start", basis: "Kern", uitdaging: "Plus", verdieping: "Extra" },
    } : {
      method, source: { type: "exercise_resource" as const, resourceId: "worked-solution" }, convention: "suffix_code" as const, prefix: "",
      mapping: { opwarmer: "O", basis: "B", uitdaging: "U", verdieping: "V" },
    };
    const preview = buildSourceStructurePreview(scanner, defaults.exerciseResources, recognition);
    expect(nodes(preview.root).flatMap((node) => node.interpretation ?? [])).toContain("Niveau: Basis");
    recognition.mapping.uitdaging = recognition.mapping.basis;
    const ambiguous = buildSourceStructurePreview(scanner, defaults.exerciseResources, recognition);
    expect(nodes(ambiguous.root).flatMap((node) => node.interpretation ?? []).some((label) => label.startsWith("Niveau:"))).toBe(false);
  });
  it("recognizes directory level markers without adding them to file examples in mixed mode", () => {
    const preview = buildSourceStructurePreview({ ...scanner, exerciseMode: "files_and_directories" }, defaults.exerciseResources, {
      method: "marker", source: { type: "exercise_directory" }, convention: "suffix_code", prefix: "",
      mapping: { opwarmer: "O", basis: "B", uitdaging: "U", verdieping: "V" },
    });
    expect(nodes(preview.root).find((node) => node.name === "Oef2-U")?.interpretation).toEqual(["Oefening 2", "Niveau: Uitdaging"]);
    expect(flatten(preview.root)).toContain("Oef1.png");
    expect(flatten(preview.root)).not.toContain("Oef1-B.png");
  });
  it("withholds ambiguous or unmatched material/document interpretations", () => {
    const duplicate = { ...workedSolution, id: "duplicate", label: "Dubbel" };
    const documents = [defaults.globalResources[0], { ...defaults.globalResources[0], id: "other", label: "Dubbel document" }];
    const preview = buildSourceStructurePreview(scanner, [workedSolution, duplicate], { method: "none" }, defaults.scanner.portfolio, {}, documents);
    expect(nodes(preview.root).flatMap((node) => node.interpretation ?? []).some((label) => label.startsWith("Materiaal:") || label.startsWith("Document:"))).toBe(false);
    const invalid = { ...workedSolution, recognition: { ...workedSolution.recognition, file: { target: "after_exercise_number" as const, operator: "exact" as const, value: "bad/value", caseSensitive: true } } };
    expect(nodes(buildSourceStructurePreview(scanner, [invalid]).root).flatMap((node) => node.interpretation ?? []).some((label) => label.startsWith("Materiaal:"))).toBe(false);
  });
});

describe("preview compatibility with existing recognition", () => {
  it.each(["files", "directories", "files_and_directories", "resource-level", "directory-level", "subdirectory-level"] as const)("keeps generated interpretations consistent with the existing scanner (%s)", async (shape) => {
    const config = structuredClone(defaults);
    config.scanner.exercise = { ...scanner, exerciseMode: shape === "files" || shape === "directories" ? shape : "files_and_directories" };
    if (shape.endsWith("-level")) config.levelRecognition = shape === "subdirectory-level" ? {
      method: "subdirectory", source: { type: "exercise_resource", resourceId: "worked-solution" },
      mapping: { opwarmer: "Start", basis: "Kern", uitdaging: "Plus", verdieping: "Extra" },
    } : {
      method: "marker", source: shape === "directory-level" ? { type: "exercise_directory" } : { type: "exercise_resource", resourceId: "worked-solution" },
      convention: "suffix_code", prefix: "", mapping: { opwarmer: "O", basis: "B", uitdaging: "U", verdieping: "V" },
    };
    const preview = buildSourceStructurePreview(config.scanner.exercise, config.exerciseResources, config.levelRecognition, config.scanner.portfolio, {}, config.globalResources);
    const root = await mkdtemp(path.join(os.tmpdir(), "generated-preview-"));
    const entries: { node: typeof preview.root; relativePath: string }[] = [];
    async function materialize(node: typeof preview.root, parent = "") {
      const relativePath = parent ? `${parent}/${node.name}` : node.name;
      entries.push({ node, relativePath });
      if (node.kind === "folder") {
        await mkdir(path.join(root, relativePath), { recursive: true });
        for (const child of node.children ?? []) await materialize(child, relativePath);
      } else await writeFile(path.join(root, relativePath), "");
    }
    try {
      await materialize(preview.root);
      const [collection] = await indexSource(new LocalFilesystemProvider(root), config);
      const exercises = [...(collection.exercises ?? []), ...collection.sections.flatMap((section) => section.exercises)];
      expect(collection.exercises?.some((exercise) => exercise.code === "3")).toBe(true);
      expect(collection.sections.flatMap((section) => section.exercises).some((exercise) => exercise.code === "1")).toBe(true);
      for (const { node, relativePath } of entries) {
        if (node.kind !== "file") continue;
        const material = node.interpretation?.find((label) => label.startsWith("Materiaal:"));
        if (material) {
          const exercise = exercises.find((exercise) => exercise.assets.some((asset) => asset.relativePath === relativePath));
          const asset = exercise?.assets.find((asset) => asset.relativePath === relativePath);
          expect(asset, relativePath).toBeDefined();
          expect(material).toBe(`Materiaal: ${config.exerciseResources.find((resource) => resource.id === asset!.resourceId)!.label}`);
          if (node.interpretation?.some((label) => label.startsWith("Niveau:"))) expect(exercise?.levelSource).toBeTruthy();
        }
        const document = node.interpretation?.find((label) => label.startsWith("Document:"));
        if (document) expect(collection.resourceAssets.some((asset) => asset.relativePath === relativePath)).toBe(true);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
