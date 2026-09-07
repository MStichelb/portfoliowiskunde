import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LearningSpace } from "@/lib/repositories";

import { LearningSpaceSettingsForm } from "./learning-space-settings-form";

const space: LearningSpace = {
  id: "space-6", name: "Zesde jaar", slug: "6", shortLabel: "6WIS", description: "Oefenmateriaal",
  cardColor: "#DCEFE9", sortOrder: 6, isActive: true, archivedAt: null, sourceType: "local",
  localSourcePath: "C:\\Portfolio", oneDriveDriveId: null, oneDriveFolderId: null,
  oneDriveFolderPath: null, googleDriveFolderId: null, googleDriveFolderLabel: null,
  sources: [], activeSourceId: null, primarySource: null, mirrorSource: null,
};

describe("LearningSpaceSettingsForm", () => {
  it("keeps all general fields and places a save button in both settings cards", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={space} action={() => ({ error: null })} />);
    const generalStart = markup.indexOf('id="general-settings-heading"');
    const sourceStart = markup.indexOf('id="source-settings-heading"');
    const saveButtons = [...markup.matchAll(/class="primary-button settings-save-button"/g)].map((match) => match.index ?? -1);

    expect(markup).toContain("Weergavenaam");
    expect(markup).toContain("Met deze naam verschijnt de leeromgeving bij de leerlingen.");
    expect(markup).toContain("URL");
    expect(markup).toContain("Kort label");
    expect(markup).toContain("Sortering");
    expect(markup).toContain("Beschrijving");
    expect(markup).toContain("Kleur");
    expect(saveButtons).toHaveLength(2);
    expect(saveButtons[0]).toBeGreaterThan(generalStart);
    expect(saveButtons[0]).toBeLessThan(sourceStart);
    expect(saveButtons[1]).toBeGreaterThan(sourceStart);
    expect((markup.match(/>Instellingen opslaan<\/button>/g) ?? [])).toHaveLength(2);
  });

  it("preserves a stored Local provider and orders provider options", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSettingsForm space={space} action={() => ({ error: null })} />);
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
    }} action={() => ({ error: null })} />);

    expect(markup).toContain('<option value="google_drive" selected="">Google Drive</option>');
    expect(markup).toContain('name="primaryGoogleDriveFolderId"');
    expect(markup).not.toContain('name="primaryLocalSourcePath"');
  });
});
