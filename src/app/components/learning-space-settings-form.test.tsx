import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LearningSpace } from "@/lib/repositories";
import { DEFAULT_EXERCISE_LEVEL_PRESENTATION } from "@/lib/exercise-level-presentation";

import { LearningSpaceSettingsForm } from "./learning-space-settings-form";

const space: LearningSpace = {
  id: "space-6", subjectId: "subject-wiskunde", subjectName: "Wiskunde", subjectIsActive: true,
  collectionLabelSingular: "Portfolio", collectionLabelPlural: "Portfolio's",
  exerciseLabelSingular: "Oefening", exerciseLabelPlural: "Oefeningen",
  name: "Zesde jaar", slug: "6", shortLabel: "6WIS", description: "Oefenmateriaal",
  cardColor: "#DCEFE9", sortOrder: 6, isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "local",
  localSourcePath: "C:\\Portfolio", oneDriveDriveId: null, oneDriveFolderId: null,
  oneDriveFolderPath: null, googleDriveFolderId: null, googleDriveFolderLabel: null,
  sources: [], activeSourceId: null, primarySource: null, mirrorSource: null,
  levelPresentation: DEFAULT_EXERCISE_LEVEL_PRESENTATION,
};
const subjects = [{ id: "subject-wiskunde", name: "Wiskunde", sortOrder: 10, isActive: true, usageCount: 0, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" }];

describe("LearningSpaceSettingsForm", () => {
  it("separates appearance, naming and levels without changing the shared save form", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={space} subjects={subjects} canPermanentlyDelete={false} action={() => ({ error: null })} />);
    const appearance = markup.slice(markup.indexOf('id="settings-panel-appearance"'), markup.indexOf('id="settings-panel-labels"'));
    const labels = markup.slice(markup.indexOf('id="settings-panel-labels"'), markup.indexOf('id="settings-panel-levels"'));
    const levels = markup.slice(markup.indexOf('id="settings-panel-levels"'), markup.indexOf('id="settings-panel-source"'));
    expect(appearance).toContain("Pas het uiterlijk van deze leeromgeving aan.");
    expect(appearance).toContain('name="cardColor"');
    expect(appearance).toContain("Header");
    expect(appearance).not.toMatch(/name="(?:themeLabel|levelName)/);
    expect(labels).toContain("Kies welke woorden in deze leeromgeving worden gebruikt.");
    for (const field of ["themeLabelSingular", "themeLabelPlural", "collectionLabelSingular", "collectionLabelPlural", "sectionLabelSingular", "sectionLabelPlural", "exerciseLabelSingular", "exerciseLabelPlural", "exerciseLabelShort"]) {
      expect(labels).toContain(`name="${field}"`);
    }
    expect(labels).not.toMatch(/name="(?:cardColor|levelName)/);
    expect(levels).toContain("Pas de niveaus en hun weergave aan.");
    for (const field of ["levelName_basis", "levelSymbol_basis", "levelCount_basis", "levelColor_basis", "levelShowPublicBackground_basis"]) expect(levels).toContain(`name="${field}"`);
    expect(levels).toContain('class="exercise-level-presentation-preview"');
    expect(levels).toContain("Herstel standaardinstellingen voor Basis");
    expect(levels).not.toMatch(/name="(?:cardColor|themeLabel)/);
    expect((markup.match(/<form/g) ?? [])).toHaveLength(1);
    expect((markup.match(/>Instellingen opslaan<\/button>/g) ?? [])).toHaveLength(5);
    for (const section of [appearance, labels, levels]) expect(section).toContain('type="submit">Instellingen opslaan');
  });

  it("places only lifecycle controls in Beheer and editor permissions in Rechten", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={space} subjects={subjects} canPermanentlyDelete action={() => ({ error: null })} />);
    const general = markup.slice(markup.indexOf('id="settings-panel-general"'), markup.indexOf('id="settings-panel-management"'));
    const management = markup.slice(markup.indexOf('id="settings-panel-management"'), markup.indexOf('id="settings-panel-appearance"'));
    const rights = markup.slice(markup.indexOf('id="settings-panel-rights"'), markup.indexOf('id="settings-panel-source"'));
    expect(general).not.toMatch(/Bewerkersrechten|Archiveren|Herstellen|Leeromgeving verwijderen/);
    expect(management).toContain('<h2 id="lifecycle-settings-heading">Beheer</h2>');
    expect(management).toContain("Beheer de status en levenscyclus van deze leeromgeving.");
    expect(management).toContain("Deze leeromgeving is actief.");
    expect(management).toContain("Archiveren");
    expect(management).not.toMatch(/Bewerkersrechten|name="name"/);
    expect(rights).toContain('<h2 id="rights-settings-heading">Rechten</h2>');
    expect(rights).toContain("Beheer welke mogelijkheden verschillende gebruikersrollen binnen deze leeromgeving hebben.");
    expect(rights).toContain("Bewerkersrechten");
    expect(rights).toContain('role="switch"');
    expect(rights).not.toMatch(/Archiveren|type="submit"/);
  });

  it("renders saved terms in hierarchy order and keeps an empty abbreviation", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={{ ...space,
      themeLabelSingular: "Deel", themeLabelPlural: "Delen", sectionLabelSingular: "Sectie", sectionLabelPlural: "Secties",
      collectionLabelSingular: "Bundel", collectionLabelPlural: "Bundels", exerciseLabelSingular: "Vraag", exerciseLabelPlural: "Vragen", exerciseLabelShort: "",
    }} subjects={subjects} canPermanentlyDelete={false} action={() => ({ error: null })} />);
    for (const [field, value] of Object.entries({ themeLabelSingular: "Deel", themeLabelPlural: "Delen", collectionLabelSingular: "Bundel", collectionLabelPlural: "Bundels", sectionLabelSingular: "Sectie", sectionLabelPlural: "Secties", exerciseLabelSingular: "Vraag", exerciseLabelPlural: "Vragen", exerciseLabelShort: "" })) {
      expect(markup).toContain(`name="${field}" value="${value}"`);
    }
    expect(markup.indexOf("Groepering")).toBeLessThan(markup.indexOf("Hoofdgeheel"));
    expect(markup.indexOf("Hoofdgeheel")).toBeLessThan(markup.indexOf("Onderverdeling"));
    expect(markup.indexOf("Onderverdeling")).toBeLessThan(markup.indexOf("Oefeneenheid"));
    expect(markup).not.toMatch(/niveau [0-3]|entity|theme model|section model/i);
  });
  it("keeps general settings separate from the existing-space personalization card", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={space} subjects={subjects} canPermanentlyDelete action={() => ({ error: null })} />);
    const generalStart = markup.indexOf('id="general-settings-heading"');
    const personalizationStart = markup.indexOf('id="appearance-settings-heading"');
    const editorPermissionsStart = markup.indexOf('id="editor-permissions-heading"');
    const sourceStart = markup.indexOf('id="source-settings-heading"');
    const saveButtons = [...markup.matchAll(/class="primary-button settings-save-button"/g)].map((match) => match.index ?? -1);

    expect(markup).toContain("Weergavenaam");
    expect(markup).toContain('name="subjectId"');
    expect(markup).toContain('<option value="subject-wiskunde" selected="">Wiskunde</option>');
    expect(markup).toContain("Met deze naam verschijnt de leeromgeving bij de leerlingen.");
    expect(markup).toContain("URL");
    expect(markup).toContain("Kort label");
    expect(markup).not.toContain("Sortering");
    expect(markup).not.toContain('type="number"');
    expect(markup).toContain("Beschrijving");
    expect(markup).toContain("Kleur");
    expect(markup).toContain("Vormgeving");
    expect(markup).toContain("Benamingen");
    expect(markup).toContain("Header");
    expect(markup).toContain("Om een eigen afbeelding bovenaan het portfolio weer te geven, plaats je de gewenste afbeelding als &#x27;header.png&#x27; of &#x27;header.jpg&#x27; in de bronmap van de leeromgeving. Zo niet wordt de standaardheader gebruikt.");
    expect(markup).toContain("Groepering");
    expect(markup).toContain("Hoofdgeheel");
    expect(markup).toContain("Onderverdeling");
    expect(markup).toContain("Oefeneenheid");
    expect(markup).toContain('name="themeLabelSingular" value="Thema"');
    expect(markup).toContain('name="themeLabelPlural" value="Thema&#x27;s"');
    expect(markup).toContain('name="sectionLabelSingular" value="Onderdeel"');
    expect(markup).toContain('name="sectionLabelPlural" value="Onderdelen"');
    expect(markup).toContain('name="exerciseLabelShort" value="Oef."');
    expect(markup).toContain("Afkorting");
    expect(markup).toContain("Niveaus");
    expect(markup).toContain('name="levelSymbol_opwarmer"');
    expect(markup).toContain('name="levelCount_verdieping"');
    expect(markup).toContain('name="levelName_basis" value="Basis"');
    expect(markup).toContain('type="color" name="levelColor_uitdaging" value="#C00000"');
    const publicBackgroundInput = markup.match(/<input[^>]*name="levelShowPublicBackground_opwarmer"[^>]*>/)?.[0] ?? "";
    expect(publicBackgroundInput).toContain('type="checkbox"');
    expect(publicBackgroundInput).toContain('value="true"');
    expect(publicBackgroundInput).not.toContain('checked=""');
    expect(markup).toContain(">Achtergrond<input");
    expect(markup.match(/exercise-level-badge-symbol-only/g)).toHaveLength(4);
    expect(markup).toContain('aria-label="Herstel standaardinstellingen voor Opwarmer"');
    expect(markup).not.toContain("exercise-level-presentation-heading");
    expect(markup).not.toContain("<strong>Opwarmer</strong>");
    expect(markup).toContain("★");
    expect(markup).toContain("★★");
    expect(markup).toContain("★★★");
    expect(markup).toContain("◆");
    expect(markup).toContain('<option value="large_circle">⬤ Grote bol</option>');
    expect(markup.indexOf('name="levelName_opwarmer"')).toBeLessThan(markup.indexOf('aria-label="Herstel standaardinstellingen voor Opwarmer"'));
    expect(markup).toContain('name="collectionLabelSingular" value="Portfolio"');
    expect(markup).toContain('name="collectionLabelPlural" value="Portfolio&#x27;s"');
    expect(markup).toContain('name="exerciseLabelSingular" value="Oefening"');
    expect(markup).toContain('name="exerciseLabelPlural" value="Oefeningen"');
    expect(markup).toContain("Bewerkersrechten");
    expect(markup).toContain("Bewerkers kunnen geen toegang beheren");
    expect(markup).toContain("Alleen de eigenaar en hoofdbeheerders mogen Smartschoolgroepen en individuele leerlingen aan deze leeromgeving koppelen.");
    expect((markup.match(/>Brontype</g) ?? [])).toHaveLength(1);
    expect(markup).not.toContain('name="editorsCanManageAccess"');
    const editorPermissionsSwitch = markup.match(/<button[^>]*role="switch"[^>]*>/)?.[0] ?? "";
    expect(editorPermissionsSwitch).toContain('type="button"');
    expect(editorPermissionsSwitch).toContain('aria-checked="false"');
    expect(editorPermissionsSwitch).not.toContain("formAction");
    expect(personalizationStart).toBeGreaterThan(generalStart);
    expect(editorPermissionsStart).toBeGreaterThan(generalStart);
    expect(editorPermissionsStart).toBeGreaterThan(personalizationStart);
    expect(editorPermissionsStart).toBeLessThan(sourceStart);
    expect(saveButtons).toHaveLength(5);
    expect(saveButtons[0]).toBeGreaterThan(generalStart);
    expect(saveButtons[0]).toBeLessThan(personalizationStart);
    expect(saveButtons[1]).toBeGreaterThan(personalizationStart);
    expect(saveButtons[1]).toBeLessThan(sourceStart);
    expect(saveButtons[4]).toBeGreaterThan(sourceStart);
    expect((markup.match(/>Instellingen opslaan<\/button>/g) ?? [])).toHaveLength(5);
    expect(markup).toContain("Archiveren");
    expect(markup).not.toContain("Herstellen");
    expect(markup).not.toContain("Leeromgeving verwijderen");
    expect((markup.match(/<form/g) ?? [])).toHaveLength(1);
  });

  it("uses the save flow as implicit Enter submit instead of the archive action", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={space} subjects={subjects} canPermanentlyDelete action={() => ({ error: null })} />);
    const firstSubmit = markup.match(/<button[^>]*type="submit"[^>]*>[^<]*/)?.[0] ?? "";

    expect(firstSubmit).toContain("Instellingen opslaan");
    expect(firstSubmit).not.toContain("formAction");
    expect(markup.indexOf(firstSubmit)).toBeLessThan(markup.indexOf("Archiveren"));
    expect((markup.match(/<form/g) ?? [])).toHaveLength(1);
  });

  it("renders a custom fixed-symbol presentation in the personalization card", () => {
    const circlePresentation = {
      opwarmer: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.opwarmer, displayName: "Instap", symbolId: "circle" as const },
      basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, displayName: "Kern", symbolId: "circle" as const, color: "#123456", showPublicBackground: true },
      uitdaging: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.uitdaging, displayName: "Sterk", symbolId: "circle" as const },
      verdieping: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.verdieping, displayName: "Extra", symbolId: "large_circle" as const, count: 4 },
    };
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={{ ...space, levelPresentation: circlePresentation }} subjects={subjects} canPermanentlyDelete={false} action={() => ({ error: null })} />);

    expect(markup).toContain('<option value="circle" selected="">● Bol</option>');
    expect(markup).toContain("●●●");
    expect(markup).toContain('<option value="large_circle" selected="">⬤ Grote bol</option>');
    expect(markup).toContain("⬤⬤⬤⬤");
    expect(markup).toContain('name="levelName_basis" value="Kern"');
    expect(markup).toContain("background-color:#D0D6DD");
    expect(markup).toContain("color:#123456");
    const publicBackgroundInput = markup.match(/<input[^>]*name="levelShowPublicBackground_basis"[^>]*>/)?.[0] ?? "";
    expect(publicBackgroundInput).toContain('type="checkbox"');
    expect(publicBackgroundInput).toContain('value="true"');
    expect(publicBackgroundInput).toContain('checked=""');
    expect(markup.match(/exercise-level-badge-symbol-only/g)).toHaveLength(3);
    expect(markup).not.toContain('name="levelSymbol_opwarmer" type="text"');
  });

  it("orders the general fields without exposing the internal sorting value", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={space} subjects={subjects} canPermanentlyDelete={false} action={() => ({ error: null })} />);
    const name = markup.indexOf("Weergavenaam");
    const url = markup.indexOf(">URL<");
    const shortLabel = markup.indexOf("Kort label");
    const subject = markup.indexOf(">Vak<");
    const description = markup.indexOf("Beschrijving");

    expect((markup.match(/>Vak</g) ?? [])).toHaveLength(1);
    expect(name).toBeLessThan(subject);
    expect(subject).toBeLessThan(url);
    expect(url).toBeLessThan(shortLabel);
    expect(shortLabel).toBeLessThan(description);
    expect(markup).not.toContain("Alleen actieve vakken kunnen als nieuwe keuze worden ingesteld.");
    expect(markup).toContain('class="settings-grid general-settings-grid"');
    expect(markup).toContain('type="hidden" name="sortOrder" value="6"');
  });

  it("preserves a stored Local provider and orders provider options", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={space} subjects={subjects} canPermanentlyDelete={false} action={() => ({ error: null })} />);
    const oneDrive = markup.indexOf('<option value="onedrive">');
    const googleDrive = markup.indexOf('<option value="google_drive">');
    const local = markup.indexOf('<option value="local" selected="">');

    expect(markup).toContain("Primaire bron");
    expect(oneDrive).toBeGreaterThan(-1);
    expect(oneDrive).toBeLessThan(googleDrive);
    expect(googleDrive).toBeLessThan(local);
  });

  it("preserves a stored Google Drive provider", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={{
      ...space,
      sourceType: "google_drive",
      localSourcePath: null,
      googleDriveFolderId: "folder-6",
      googleDriveFolderLabel: "Mirror 6",
    }} subjects={subjects} canPermanentlyDelete={false} action={() => ({ error: null })} />);

    expect(markup).toContain('<option value="google_drive" selected="">Google Drive</option>');
    expect(markup).toContain('name="primaryGoogleDriveFolderId"');
    expect(markup).not.toContain('name="primaryLocalSourcePath"');
  });

  it("links OneDrive source guidance to the canonical connections page", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={{
      ...space,
      sourceType: "onedrive",
      localSourcePath: null,
      oneDriveDriveId: "drive-6",
      oneDriveFolderId: "folder-6",
      oneDriveFolderPath: "Portfolio/6WIS",
    }} subjects={subjects} canPermanentlyDelete={false} action={() => ({ error: null })} />);

    expect(markup).toContain('href="/admin/verbindingen">Verbindingen</a>');
    expect(markup).not.toContain("Mijn verbindingen");
  });

  it("shows the persisted editor access delegation setting", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={{ ...space, editorsCanManageAccess: true }} subjects={subjects} canPermanentlyDelete={false} action={() => ({ error: null })} />);

    const editorPermissionsSwitch = markup.match(/<button[^>]*role="switch"[^>]*>/)?.[0] ?? "";
    expect(editorPermissionsSwitch).toContain('aria-checked="true"');
    expect(editorPermissionsSwitch).toContain("is-enabled");
    expect(markup).toContain("Bewerkers kunnen toegang beheren");
    expect(markup).toContain("Bewerkers mogen Smartschoolgroepen en individuele leerlingen aan deze leeromgeving koppelen.");
  });

  it("shows restore to an owner and reserves archived deletion for a superadmin", () => {
    const archivedSpace = { ...space, isActive: false, archivedAt: "2026-09-01T00:00:00.000Z" };
    const ownerMarkup = renderToStaticMarkup(<LearningSpaceSettingsForm space={archivedSpace} subjects={subjects} canPermanentlyDelete={false} action={() => ({ error: null })} />);
    const superadminMarkup = renderToStaticMarkup(<LearningSpaceSettingsForm space={archivedSpace} subjects={subjects} canPermanentlyDelete action={() => ({ error: null })} />);

    expect(ownerMarkup).toContain("Herstellen");
    expect(ownerMarkup).not.toContain("Archiveren");
    expect(ownerMarkup).not.toContain("Leeromgeving verwijderen");
    expect(superadminMarkup).toContain("Herstellen");
    expect(superadminMarkup).toContain("Leeromgeving verwijderen");
    expect(superadminMarkup).toContain('aria-label="Leeromgeving permanent verwijderen?"');
    expect((superadminMarkup.match(/<form/g) ?? [])).toHaveLength(1);
  });

  it("keeps the current inactive subject visible without offering other inactive subjects", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm
      space={{ ...space, subjectId: "subject-fysica", subjectName: "Fysica", subjectIsActive: false }}
      subjects={subjects}
      canPermanentlyDelete={false}
      action={() => ({ error: null })}
    />);

    expect(markup).toContain('<option value="subject-fysica" selected="">Fysica (inactief)</option>');
    expect(markup).toContain('<option value="subject-wiskunde">Wiskunde</option>');
  });
});
