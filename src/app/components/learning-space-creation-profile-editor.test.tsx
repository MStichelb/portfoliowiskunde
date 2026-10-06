import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import { creationProfileSummary } from "@/lib/learning-space-creation-summary";
import { parseCreationProfileDraft, validateCreationStep } from "@/lib/learning-space-creation-wizard";
import { LearningSpaceCreationProfileEditor } from "./learning-space-creation-profile-editor";

describe("embedded creation profile", () => {
  it("reuses all existing editor sections and serializes the full validated draft without a nested save form", () => {
    const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    const markup = renderToStaticMarkup(<LearningSpaceCreationProfileEditor config={config} draftKey="template:one" />);
    for (const name of ["portfolioScannerJson", "exerciseScannerJson", "resourcesJson", "exerciseResourcesJson", "levelRecognitionJson"]) expect(markup).toContain(`name="${name}"`);
    expect(markup).not.toContain("<form"); expect(markup).not.toContain('type="submit"');
    expect(markup).toContain("Globale documenten"); expect(markup).toContain("Oefeningen herkennen");
    const form = new FormData();
    for (const [key, value] of Object.entries({ portfolioScannerJson: config.scanner.portfolio, exerciseScannerJson: config.scanner.exercise, resourcesJson: config.globalResources, exerciseResourcesJson: config.exerciseResources, levelRecognitionJson: config.levelRecognition })) form.set(key, JSON.stringify(value));
    expect(parseCreationProfileDraft(form)).toEqual(config);
    form.set("profileMode", "new"); form.set("profileDraftEnabled", "1"); expect(validateCreationStep(3, form)).toBeNull();
    form.set("exerciseResourcesJson", "bad json"); expect(validateCreationStep(3, form)).not.toBeNull();
  });
  it("summarizes structural choices, material, levels and documents using custom terminology", () => {
    const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG); config.scanner.portfolio.themeMode = "folder";
    config.levelRecognition = { method: "marker", source: { type: "exercise_directory" }, convention: "suffix_code", prefix: "", mapping: { opwarmer: "1", basis: "2", uitdaging: "3", verdieping: "4" } };
    const text = creationProfileSummary(config, { themeLabelPlural: "Delen", collectionLabelPlural: "Bundels", exerciseLabelPlural: "Opdrachten" }).join(" ");
    expect(text).toContain("bundels"); expect(text).toContain("Delen:"); expect(text).toContain("Opdrachten: bestanden en mappen");
    for (const resource of [...config.exerciseResources, ...config.globalResources]) expect(text).toContain(resource.label);
    expect(text).toContain("Materialen:");
    expect(text).toContain("Documenten bij bundels:");
    expect(text).toContain("Niveaus:");
    expect(text).not.toMatch(/regex|scanner|prefix|suffix/);
    config.scanner.portfolio.themeMode = "none";
    expect(creationProfileSummary(config, { themeLabelPlural: "Delen" }).join(" ")).not.toContain("Delen:");
    config.levelRecognition = { method: "none" }; expect(creationProfileSummary(config).join(" ")).not.toContain("Niveaus");
  });
  it("scopes responsive card and grid layouts to the wizard without clipping horizontal content", async () => {
    const css = await readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("@container (max-width: 660px)"); expect(css).toContain("@container (max-width: 440px)");
    expect(css).toContain(".exercise-level-presentation-cards .exercise-level-presentation-row");
    expect(css).toContain(".creation-wizard-content { min-height: 0; min-width: 0; overflow-y: auto;");
    const wizardRules = css.slice(css.indexOf(".learning-space-create-dialog {"), css.indexOf(".exercise-note-dialog {"));
    expect(wizardRules).not.toMatch(/overflow-x:\s*(?:hidden|clip)/);
    expect(wizardRules).toContain("grid-template-columns: minmax(0, 1fr)");
  });
});
