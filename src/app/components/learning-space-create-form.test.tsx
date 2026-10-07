import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { LearningSpaceCreationProfileEditor } from "./learning-space-creation-profile-editor";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import { ExerciseLevelPresentationSettings } from "./exercise-level-presentation-settings";
import { DEFAULT_EXERCISE_LEVEL_PRESENTATION } from "@/lib/exercise-level-presentation";

import { LearningSpaceCreateForm } from "./learning-space-create-form";

describe("LearningSpaceCreateForm", () => {
  it("reuses the shared nine-tab editor and preview slider in the wizard subeditor", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreationProfileEditor config={BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG} draftKey="template:test" />);
    expect(markup.match(/role="tab"/g)).toHaveLength(9);
    expect(markup.match(/Interpretatie tonen/g)).toHaveLength(1);
    expect(markup).toContain("editor-permissions-track");
    expect(markup).toContain('role="switch" aria-checked="false"');
    expect(markup).toContain('aria-label="Voorbeeld van de mapstructuur"');
    expect(markup).toContain("Thema&#x27;s</button>");
  });
  it("uses the agreed labels and help text without visible duplicate section legends", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateForm action={() => undefined} subjects={subjects} />);

    expect(markup).toContain(">Naam<");
    expect(markup).toContain("Klik op de kaartjes hieronder om te oefenen.");
    expect(markup).toContain('name="collectionLabelPlural"');
    expect(markup).toContain('name="subjectId"');
    expect(markup).toContain("Kies een vak");
    expect(markup).not.toContain('<option value="subject-wiskunde" selected="">');
    expect(markup).toContain(">URL<");
    expect(markup).toContain("Dit wordt gebruikt in het webadres van deze leeromgeving.");
    expect(markup).not.toContain("Sortering");
    expect(markup).not.toContain('name="sortOrder"');
    expect(markup).not.toContain('type="number"');
    expect(markup).toContain("Compacte naam in de navigatie en op de homeweergave");
    expect(markup).not.toContain(">Algemeen</legend>");
    expect(markup).not.toContain(">Bronbestanden</legend>");
  });

  it("offers four profile choices with one template-based new profile flow", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateForm action={() => undefined} subjects={subjects} />);
    const profileSelect = markup.match(/<select name="profileMode"[\s\S]*?<\/select>/)![0];
    expect(profileSelect.match(/<option value="(?:template|copy|link|later)"/g)).toHaveLength(4);
    expect(profileSelect.match(/<option/g)).toHaveLength(5); // Four choices and the neutral placeholder.
    expect(profileSelect).toContain("Nieuw bronprofiel vanuit sjabloon");
    expect(profileSelect).toContain("Koppel aan een bestaand bronprofiel");
    expect(profileSelect).not.toContain("Gebruik een sjabloon");
    expect(profileSelect).not.toContain("Maak een nieuw profiel");
    expect(profileSelect).not.toContain('value="new"');
  });

  it("keeps all step values mounted while only step one is visible and has no final submit yet", () => {
    const action = vi.fn();
    const markup = renderToStaticMarkup(<LearningSpaceCreateForm action={action} subjects={subjects} onCancel={() => undefined} />);
    expect(markup).toContain('data-step="1"');
    for (const step of [2, 3, 4]) expect(markup).toContain(`data-step="${step}" hidden=""`);
    expect(markup).toContain('name="exerciseLabelShort"');
    expect(markup).toContain('name="creationFlow" value="wizard"');
    expect(markup).toContain("Volgende");
    expect(markup).toContain("Annuleren");
    expect(markup).not.toContain('type="submit"');
    expect(action).not.toHaveBeenCalled();
  });

  it("starts profile and source choices neutrally with no active detail fields", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateForm action={() => undefined} subjects={subjects} />);
    expect(markup.match(/value="" disabled="" selected="">Maak een keuze/g)).toHaveLength(2);
    expect(markup).not.toContain('name="profileSelectionId"');
    expect(markup).not.toContain('name="profileIntent"');
    expect(markup).not.toContain('class="source-profile-summary"');
    for (const provider of ["OneDrive", "Google Drive", "Lokale bestanden"]) expect(markup).toContain(`<fieldset hidden="" disabled=""><legend class="sr-only">${provider}</legend>`);
    expect(markup).toContain('<summary>Technische gegevens</summary>');
    expect(markup).not.toContain('value="onedrive" selected=""');
  });

  it("splits personalization into sections and uses compact level cards with every existing field", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateForm action={() => undefined} subjects={subjects} />);
    expect(markup).toContain("<h4>Kleur</h4>"); expect(markup).toContain("De kleur van het kaartje van deze leeromgeving.");
    expect(markup).toContain("<h4>Benamingen</h4>"); expect(markup).toContain("Start met");
    expect(markup).toContain("<h3>Niveaus</h3>"); expect(markup).toContain("exercise-level-presentation-cards");
    expect(markup).toContain("creation-terminology-grid");
    expect(markup.match(/class="exercise-level-presentation-row"/g)).toHaveLength(4);
    expect(markup.match(/class="exercise-level-presentation-preview"/g)).toHaveLength(4);
    expect(markup.match(/class="mini-icon-button exercise-level-presentation-reset"/g)).toHaveLength(4);
    for (const level of ["opwarmer", "basis", "uitdaging", "verdieping"]) {
      for (const field of ["levelName", "levelSymbol", "levelCount", "levelColor", "levelShowPublicBackground"]) expect(markup).toContain(`name="${field}_${level}"`);
    }
    expect(markup).not.toMatch(/Stap \d van 4/);
    expect(markup).toContain("Dit vult alvast de benamingen voor de verschillende onderverdelingen in. Je kunt daarna elk woord aanpassen.");
    expect(markup).toContain("creation-color-section");
    expect(markup).toContain("creation-stepper"); expect(markup).toContain('aria-current="step"');
    expect(markup).toContain("creation-wizard-content"); expect(markup).toContain("creation-wizard-footer");
  });

  it.each([[1, false], [2, false], [3, false], [4, false], [4, true]] as const)("keeps the %s-symbol preview intact with background=%s", (count, showPublicBackground) => {
    const presentation = { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION, opwarmer: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.opwarmer, count, showPublicBackground } };
    const markup = renderToStaticMarkup(<ExerciseLevelPresentationSettings layout="cards" initialPresentation={presentation} />);
    const previews = [...markup.matchAll(/<div class="exercise-level-preview-field">([\s\S]*?)<\/div>/g)];
    expect(previews).toHaveLength(4);
    expect(previews[0][1]).toContain("<span>Voorbeeld</span>");
    expect(previews[0][1]).toContain("★".repeat(count));
    expect(previews[0][1].includes("background-color:")).toBe(showPublicBackground);
    expect(previews[0][1]).toContain('aria-label="Opwarmer"');
    expect(markup).toContain(`name="levelCount_opwarmer"`);
    expect(markup).toContain('Herstel standaardinstellingen voor Opwarmer');
  });

  it("stacks level cards at every width while preserving responsive fields inside each card", async () => {
    const css = await readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const listRules = [...css.matchAll(/\.exercise-level-presentation-cards \.exercise-level-presentation-list\s*\{([^}]+)\}/g)];
    expect(listRules.length).toBeGreaterThan(0);
    for (const rule of listRules) expect(rule[1]).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain('grid-template-columns: minmax(120px, 1fr) 112px 58px 120px 84px 96px 30px');
    expect(css).toContain('grid-template-areas: "name symbol count color background preview reset"');
    expect(css).toContain('grid-template-rows: 18px 40px');
    expect(css).toContain('width: 96px; min-width: 96px; height: 40px');
    expect(css).toContain('@container (max-width: 740px)');
    expect(css).toContain('"name symbol count reset" "color background preview ."');
    expect(css).toContain('@container (max-width: 500px)');
    expect(css).toContain('"name reset" "symbol symbol" "count count" "color color" "background background" "preview preview"');
  });

});

const subjects = [
  { id: "subject-fysica", name: "Fysica", sortOrder: 5, isActive: true, usageCount: 0, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" },
  { id: "subject-wiskunde", name: "Wiskunde", sortOrder: 10, isActive: true, usageCount: 0, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" },
];
