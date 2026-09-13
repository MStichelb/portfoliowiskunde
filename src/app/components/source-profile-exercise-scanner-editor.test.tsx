import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import { SourceProfileExerciseScannerEditor } from "./source-profile-exercise-scanner-editor";

describe("SourceProfileExerciseScannerEditor", () => {
  it("serializes the exercise-number rule and keeps examples behind the help control", () => {
    const markup = renderToStaticMarkup(<SourceProfileExerciseScannerEditor scanner={BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.scanner.exercise} embedded />);
    expect(markup).toContain("Oefeningen herkennen");
    expect(markup).toContain('name="exerciseScannerJson"');
    expect(markup).toContain('&quot;exerciseMode&quot;:&quot;files_and_directories&quot;');
    expect(markup).toContain("Oefeningen als bestanden");
    expect(markup).toContain("Oefeningen als mappen");
    expect(markup).toContain("Oefeningen als bestanden en mappen");
    expect(markup).toContain('value="Oef"');
    expect(markup).toContain("Nummer staat na tekst");
    expect(markup).not.toContain("Nummer vinden");
    expect(markup).toContain("Uitleg over oefeningen herkennen");
    expect(markup).not.toContain("PF1-Oef3auitwerking(2).png");
    expect(markup).not.toContain("Nummerformaat");
    expect(markup).not.toContain("Hoe kunnen oefeningen voorkomen");
  });
});
