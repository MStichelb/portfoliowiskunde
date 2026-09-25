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
});
