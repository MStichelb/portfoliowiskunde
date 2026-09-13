import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import { SourceProfileExerciseResourcesEditor, SourceProfileExerciseResourcesViewer } from "./source-profile-exercise-resources-editor";

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
        { ...base, id: "exercise-final-answer", label: "Antwoordbestand", semanticRole: "final_answer", order: base.order + 10, recognition: { target: "after_exercise_number", operator: "starts_with", value: "antwoord", caseSensitive: false, fileExtensions: ["pdf"] } },
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
      recognition: { target: "after_exercise_number" as const, operator: "starts_with" as const, value: "-hint", caseSensitive: true, fileExtensions: ["png" as const] },
      allowMultiple: true,
      displayMode: "collapsible_each" as const,
    };
    const viewerMarkup = renderToStaticMarkup(<SourceProfileExerciseResourcesViewer resources={[resource]} />);

    expect(viewerMarkup).toContain("In submap");
    expect(viewerMarkup).toContain("assets");
    expect(viewerMarkup).toContain("Na oefeningnummer");
    expect(viewerMarkup).toContain("-hint");
    expect(viewerMarkup).toContain("Meerdere toegestaan");
    expect(viewerMarkup).toContain("Inklapbaar per bestand");
    expect(viewerMarkup).toContain("PNG");
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
