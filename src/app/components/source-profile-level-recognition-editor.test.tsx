import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  LEGACY_EXERCISE_RESOURCE_CONFIGS,
  type ExerciseLevelRecognitionConfig,
  type ExerciseResourceConfig,
} from "@/lib/source-profile-config";

import {
  configForLevelRecognitionChoice,
  SourceProfileLevelRecognitionEditor,
  suitableLevelSourceResources,
} from "./source-profile-level-recognition-editor";

const markerRecognition: ExerciseLevelRecognitionConfig = {
  method: "marker",
  source: { type: "exercise_resource", resourceId: "worked-solution" },
  convention: "prefixed_code",
  prefix: "Niv",
  mapping: { opwarmer: "1", basis: "2", uitdaging: "3", verdieping: "4" },
};

function render(recognition: ExerciseLevelRecognitionConfig, exerciseMode: "files" | "directories" | "files_and_directories" = "files_and_directories") {
  return renderToStaticMarkup(<SourceProfileLevelRecognitionEditor
    recognition={recognition}
    resources={LEGACY_EXERCISE_RESOURCE_CONFIGS}
    exerciseMode={exerciseMode}
  />);
}

describe("SourceProfileLevelRecognitionEditor", () => {
  it("maps all four user choices onto the backward-compatible config shape", () => {
    const none = configForLevelRecognitionChoice("none", markerRecognition, LEGACY_EXERCISE_RESOURCE_CONFIGS, "files_and_directories");
    const subdirectory = configForLevelRecognitionChoice("subdirectory", none, LEGACY_EXERCISE_RESOURCE_CONFIGS, "files_and_directories");
    const fileName = configForLevelRecognitionChoice("resource_file_name", none, LEGACY_EXERCISE_RESOURCE_CONFIGS, "files_and_directories");
    const directoryName = configForLevelRecognitionChoice("exercise_directory_name", markerRecognition, LEGACY_EXERCISE_RESOURCE_CONFIGS, "directories");

    expect(none).toEqual({ method: "none" });
    expect(subdirectory).toMatchObject({ method: "subdirectory", source: { type: "exercise_resource", resourceId: "worked-solution" } });
    expect(fileName).toMatchObject({ method: "marker", source: { type: "exercise_resource", resourceId: "worked-solution" }, convention: "suffix_code" });
    expect(directoryName).toMatchObject({ method: "marker", source: { type: "exercise_directory" }, convention: "prefixed_code", prefix: "Niv" });
  });

  it("renders backward-compatible disabled recognition and the simplified choice", () => {
    const markup = render({ method: "none" });

    expect(markup).toContain('name="levelRecognitionJson"');
    expect(markup).toContain('&quot;method&quot;:&quot;none&quot;');
    expect(markup).toContain("Niveau automatisch bepalen");
    expect(markup).toContain("Geen automatische herkenning");
    expect(markup).toContain("Bestaande bronprofielen herkennen standaard geen niveaus automatisch.");
  });

  it("shows no source selector for subdirectories and labels the stable internal levels", () => {
    const markup = render({
      method: "subdirectory",
      source: { type: "exercise_resource", resourceId: "worked-solution" },
      mapping: { opwarmer: "Warm", basis: "Basis", uitdaging: "Plus", verdieping: "Extra" },
    });

    expect(markup).not.toContain("Niveau bepalen via");
    expect(markup).toContain("Niveau 1 · Opwarmer");
    expect(markup).toContain("Niveau 4 · Verdieping");
    expect(markup).toContain("Deze niveaus zijn intern vast.");
  });

  it("offers only suitable individual exercise resources in the file-name selector", () => {
    const fileOnly = { ...LEGACY_EXERCISE_RESOURCE_CONFIGS[0], id: "file-only", label: "Opgave", recognition: { ...LEGACY_EXERCISE_RESOURCE_CONFIGS[0].recognition, directory: null } } satisfies ExerciseResourceConfig;
    const directoryOnly = { ...LEGACY_EXERCISE_RESOURCE_CONFIGS[1], id: "directory-only", label: "Modelantwoord", recognition: { ...LEGACY_EXERCISE_RESOURCE_CONFIGS[1].recognition, file: null } } satisfies ExerciseResourceConfig;

    expect(suitableLevelSourceResources([fileOnly, directoryOnly], "files").map((resource) => resource.id)).toEqual(["file-only"]);
    expect(suitableLevelSourceResources([fileOnly, directoryOnly], "directories").map((resource) => resource.id)).toEqual(["directory-only"]);
    expect(suitableLevelSourceResources([fileOnly, directoryOnly], "files_and_directories")).toEqual([]);

    const markup = render(markerRecognition);
    expect(markup).toContain("Bepalen via Uitwerking");
    expect(markup).toContain("Bepalen via Alternatieve uitwerking");
    expect(markup).toContain("Bestandsnaam bevat");
    expect(markup).toContain('value="Niv"');
  });

  it("disables directory-name recognition for files-only", () => {
    const markup = render({ ...markerRecognition, source: { type: "exercise_directory" } }, "files");

    expect(markup).toMatch(/value="exercise_directory_name"[^>]*disabled/);
    expect(markup).toContain("Niveau uit mapnaam is niet beschikbaar wanneer oefeningen alleen als bestanden voorkomen.");
    expect(markup).toContain("Mapnaam bevat");
  });

  it("warns for mixed exercises but not for directories-only", () => {
    const recognition = { ...markerRecognition, source: { type: "exercise_directory" as const } };
    const mixedMarkup = render(recognition, "files_and_directories");
    const directoriesMarkup = render(recognition, "directories");

    expect(mixedMarkup).toContain("Niveauherkenning via de mapnaam werkt alleen voor oefeningen die als map voorkomen.");
    expect(directoriesMarkup).not.toContain("Niveauherkenning via de mapnaam werkt alleen");
    expect(directoriesMarkup).toContain("Mapnaam bevat");
  });

  it("uses contextual suffix wording for file and directory names", () => {
    const suffix = { ...markerRecognition, convention: "suffix_code" as const, prefix: "" };

    expect(render(suffix)).toContain("Bestandsnaam eindigt op");
    expect(render({ ...suffix, source: { type: "exercise_directory" } }, "directories")).toContain("Mapnaam eindigt op");
  });
});
