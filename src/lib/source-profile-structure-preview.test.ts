import { describe, expect, it } from "vitest";

import { buildSourceStructurePreview } from "@/lib/source-profile-structure-preview";
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
  it("uses the configured portfolio marker and shows direct numeric sections", () => {
    const preview = buildSourceStructurePreview(scanner, [workedSolution], { method: "none" }, { marker: "H" });

    expect(preview.root.name).toBe("H1.1_Stelsels oplossen");
    expect(flatten(preview.root)).toEqual(expect.arrayContaining([
      "1 Inleiding",
      "2 - Methode van Gauss-Jordan",
      "3_Toepassingen",
      "header.png",
    ]));
    expect(flatten(preview.root)).not.toContain("Uitwerkingen");
    expect(preview.notes).toContain("Geldige portfoliocodes zijn bijvoorbeeld 1, A, 1A, A1, 1.1 en A.1. Mapnamen zoals “H 1.1 Stelsels”, “H 1.1 - Stelsels” en “H1.1-Stelsels” zijn geldig.");
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
    expect(flatten(preview.root)).toEqual(expect.arrayContaining(["1 Inleiding", "Uitwerkingen", "Oef1-uitwerking.png"]));
  });

  it("illustrates configured level subdirectories", () => {
    const preview = buildSourceStructurePreview(scanner, [workedSolution], {
      method: "subdirectory",
      source: { type: "exercise_resource", resourceId: "worked-solution" },
      mapping: { opwarmer: "Start", basis: "Kern", uitdaging: "Plus", verdieping: "Extra" },
    });

    expect(flatten(preview.root)).toEqual(expect.arrayContaining(["Kern", "Oef1.png", "Oef1-uitwerking.png"]));
    expect(preview.notes).toContain("De ingestelde submapnaam bepaalt in dit voorbeeld automatisch het interne oefeningniveau.");
    expect(flatten(preview.root)).toEqual(expect.arrayContaining(["1 Inleiding", "Kern", "Oef1.png"]));
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
