import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import { SourceProfileExerciseRecognitionFields, SourceProfileExerciseResourcesEditor, SourceProfileExerciseResourcesViewer } from "./source-profile-exercise-resources-editor";

const action = async () => undefined;

describe("SourceProfileExerciseResourcesEditor", () => {
  it("renders the default exercise resources and their serialized config", () => {
    const markup = renderToStaticMarkup(<SourceProfileExerciseResourcesEditor
      resources={BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources}
      action={action}
      ownerIdField="sourceProfileId"
      ownerId="profile-1"
    />);

    expect(markup).toContain("Onderdelen per oefening");
    expect(markup).toContain("Uitwerking");
    expect(markup).toContain("Alternatieve uitwerking");
    expect(markup).toContain('name="exerciseResourcesJson"');
    expect(markup).toContain("2/10");
    expect(markup).toContain("Onderdeel toevoegen");
    expect(markup).toContain("Uitleg over onderdelen per oefening");
    expect(markup).toContain("lucide-notebook-pen");
    expect(markup).toContain("lucide-shapes");
  });

  it("renders Opgave and Eindoplossing as exercise-part meanings", () => {
    const base = BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources[0];
    const markup = renderToStaticMarkup(<SourceProfileExerciseResourcesEditor
      resources={[
        { ...base, id: "exercise-assignment", label: "Opgavebestand", semanticRole: "assignment" },
        { ...base, id: "exercise-final-answer", label: "Antwoordbestand", semanticRole: "final_answer", order: base.order + 10, recognition: { file: { target: "after_exercise_number", operator: "starts_with", value: "antwoord", caseSensitive: false }, directory: null, fileExtensions: ["pdf"] } },
      ]}
      action={action}
      ownerIdField="sourceProfileId"
      ownerId="profile-1"
    />);

    expect(markup).toContain("Opgavebestand");
    expect(markup).toContain("Antwoordbestand");
  });

  it("renders location, multi-file and display settings in read-only mode", () => {
    const resource = {
      ...BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources[0],
      id: "hint-file",
      label: "Hint",
      semanticRole: "hint" as const,
      location: { scope: "subdirectory" as const, subdirectory: "assets" },
      recognition: { file: { target: "after_exercise_number" as const, operator: "starts_with" as const, value: "-hint", caseSensitive: true }, directory: null, fileExtensions: ["png" as const] },
      allowMultiple: true,
      displayMode: "collapsible_each" as const,
    };
    const viewerMarkup = renderToStaticMarkup(<SourceProfileExerciseResourcesViewer resources={[resource]} />);

    expect(viewerMarkup).toContain("In een submap");
    expect(viewerMarkup).toContain("assets");
    expect(viewerMarkup).toContain("Tekst na oefeningnummer");
    expect(viewerMarkup).toContain("-hint");
    expect(viewerMarkup).toContain("Meerdere toegestaan");
    expect(viewerMarkup).toContain("Inklapbaar per bestand");
    expect(viewerMarkup).toContain("PNG");
  });

  it("serializes an exact recognition rule with the one-file invariant", () => {
    const base = BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources[0];
    const markup = renderToStaticMarkup(<SourceProfileExerciseResourcesEditor
      resources={[{
        ...base,
        recognition: { file: { target: "after_exercise_number", operator: "exact", value: "uitwerking", caseSensitive: false }, directory: null, fileExtensions: ["pdf"] },
        allowMultiple: true,
      }]}
      action={action}
      ownerIdField="sourceProfileId"
      ownerId="profile-1"
    />);

    expect(markup).toContain('&quot;operator&quot;:&quot;exact&quot;');
    expect(markup).toContain('&quot;allowMultiple&quot;:false');
  });

  it("shows only the active recognition context and keeps a dormant exact rule from forcing one file", () => {
    const base = BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources[0];
    const resource = {
      ...base,
      recognition: {
        file: { target: "after_exercise_number" as const, operator: "starts_with" as const, value: "-uitwerking", caseSensitive: false },
        directory: { target: "file_name" as const, operator: "exact" as const, value: "uitwerking", caseSensitive: false },
        fileExtensions: ["png" as const],
      },
      allowMultiple: true,
    };
    const filesMarkup = renderToStaticMarkup(<SourceProfileExerciseResourcesViewer resources={[resource]} exerciseMode="files" />);
    const directoriesMarkup = renderToStaticMarkup(<SourceProfileExerciseResourcesViewer resources={[resource]} exerciseMode="directories" />);
    const editorMarkup = renderToStaticMarkup(<SourceProfileExerciseResourcesEditor
      resources={[resource]}
      action={action}
      ownerIdField="sourceProfileId"
      ownerId="profile-1"
      exerciseMode="files"
    />);

    expect(filesMarkup).toContain("Oefeningen als bestand");
    expect(filesMarkup).not.toContain("Oefeningen als map");
    expect(directoriesMarkup).toContain("Oefeningen als map");
    expect(directoriesMarkup).not.toContain("Oefeningen als bestand</b>");
    expect(editorMarkup).toContain('&quot;allowMultiple&quot;:true');
  });

  it("does not invent a missing second context rule", () => {
    const resource = {
      ...BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources[1],
      recognition: {
        file: null,
        directory: { target: "file_name" as const, operator: "starts_with" as const, value: "uitwerking", caseSensitive: false },
        fileExtensions: ["png" as const],
      },
    };
    const markup = renderToStaticMarkup(<SourceProfileExerciseResourcesViewer resources={[resource]} />);

    expect(resource.recognition.file).toBeNull();
    expect(markup).toContain("Nog geen herkenningsregel ingesteld");
  });

  it("offers only context-valid targets and shows both blocks in mixed mode", () => {
    const resource = {
      ...BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources[0],
      recognition: {
        file: { target: "after_exercise_number" as const, operator: "starts_with" as const, value: "-uitwerking", caseSensitive: false },
        directory: { target: "file_name" as const, operator: "starts_with" as const, value: "uitwerking", caseSensitive: false },
        fileExtensions: ["png" as const],
      },
    };
    const renderFields = (exerciseMode: "files" | "directories" | "files_and_directories") => renderToStaticMarkup(
      <SourceProfileExerciseRecognitionFields resource={resource} exerciseMode={exerciseMode} onChange={() => undefined} />,
    );

    const filesMarkup = renderFields("files");
    expect(filesMarkup).toContain("Tekst na oefeningnummer");
    expect(filesMarkup).not.toContain("Bestandsnaam");

    const directoriesMarkup = renderFields("directories");
    expect(directoriesMarkup).toContain("Bestandsnaam");
    expect(directoriesMarkup).toContain("Tekst na oefeningnummer");

    const mixedMarkup = renderFields("files_and_directories");
    expect(mixedMarkup).toContain("Voor oefeningen als bestand");
    expect(mixedMarkup).toContain("Voor oefeningen als map");
  });

  it("uses context-aware labels for the resource location", () => {
    const resource = { ...BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources[0], location: { scope: "alongside_and_subdirectory" as const, subdirectory: "assets" } };
    const filesMarkup = renderToStaticMarkup(<SourceProfileExerciseResourcesViewer resources={[resource]} exerciseMode="files" />);
    const directoriesMarkup = renderToStaticMarkup(<SourceProfileExerciseResourcesViewer resources={[resource]} exerciseMode="directories" />);
    const mixedMarkup = renderToStaticMarkup(<SourceProfileExerciseResourcesViewer resources={[resource]} exerciseMode="files_and_directories" />);

    expect(filesMarkup).toContain("Bij de oefening of in een submap");
    expect(directoriesMarkup).toContain("In de map of een submap van de oefening");
    expect(mixedMarkup).toContain("Direct bij de oefening of in een submap");
  });

  it("embeds in the combined profile form without creating a nested form", () => {
    const markup = renderToStaticMarkup(<SourceProfileExerciseResourcesEditor
      resources={BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources}
      ownerIdField="sourceProfileId"
      ownerId="profile-1"
      embedded
    />);

    expect(markup).toContain('name="exerciseResourcesJson"');
    expect(markup).not.toContain('name="sourceProfileId"');
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("Onderdelen opslaan");
  });

  it("renders exercise resources in profile order in read-only mode", () => {
    const markup = renderToStaticMarkup(<SourceProfileExerciseResourcesViewer
      resources={[...BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources].reverse()}
    />);

    expect(markup).toContain("Deze configuratie is alleen-lezen.");
    expect(markup.indexOf("Uitwerking")).toBeLessThan(markup.indexOf("Alternatieve uitwerking"));
    expect(markup).toContain("Standaard / overige bestanden");
    expect(markup).toContain("PDF, PNG, JPG, JPEG");
    expect(markup).not.toContain("Onderdeel toevoegen");
  });
});
