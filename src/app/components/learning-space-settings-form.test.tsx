import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LearningSpace } from "@/lib/repositories";

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
};
const subjects = [{ id: "subject-wiskunde", name: "Wiskunde", sortOrder: 10, isActive: true, usageCount: 0, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" }];

describe("LearningSpaceSettingsForm", () => {
  it("keeps general settings separate from the existing-space personalization card", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={space} subjects={subjects} canPermanentlyDelete action={() => ({ error: null })} />);
    const generalStart = markup.indexOf('id="general-settings-heading"');
    const personalizationStart = markup.indexOf('id="personalization-settings-heading"');
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
    expect(markup).toContain("Personalisatie");
    expect(markup).toContain("Header");
    expect(markup).toContain("Om een eigen afbeelding bovenaan het portfolio weer te geven, plaats je de gewenste afbeelding als &#x27;header.png&#x27; of &#x27;header.jpg&#x27; in de bronmap van de leeromgeving. Zo niet wordt de standaardheader gebruikt.");
    expect(markup).toContain("Benaming portfolio&#x27;s");
    expect(markup).toContain("Benaming oefeningen");
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
    expect(editorPermissionsStart).toBeGreaterThan(personalizationStart);
    expect(editorPermissionsStart).toBeLessThan(sourceStart);
    expect(saveButtons).toHaveLength(3);
    expect(saveButtons[0]).toBeGreaterThan(generalStart);
    expect(saveButtons[0]).toBeLessThan(personalizationStart);
    expect(saveButtons[1]).toBeGreaterThan(personalizationStart);
    expect(saveButtons[1]).toBeLessThan(editorPermissionsStart);
    expect(saveButtons[2]).toBeGreaterThan(sourceStart);
    expect((markup.match(/>Instellingen opslaan<\/button>/g) ?? [])).toHaveLength(3);
    expect(markup).toContain("Archiveren");
    expect(markup).not.toContain("Herstellen");
    expect(markup).not.toContain("Leeromgeving verwijderen");
    expect((markup.match(/<form/g) ?? [])).toHaveLength(1);
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
