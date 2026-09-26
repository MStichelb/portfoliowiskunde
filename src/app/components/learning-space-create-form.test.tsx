import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LearningSpaceCreateForm } from "./learning-space-create-form";

describe("LearningSpaceCreateForm", () => {
  it("uses the agreed labels and help text without visible duplicate section legends", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateForm action={() => undefined} subjects={subjects} />);

    expect(markup).toContain("Weergavenaam");
    expect(markup).toContain('name="subjectId"');
    expect(markup).toContain("Kies een vak");
    expect(markup).not.toContain('<option value="subject-wiskunde" selected="">');
    expect(markup).toContain(">URL<");
    expect(markup).toContain("Dit wordt gebruikt in het webadres van deze leeromgeving.");
    expect(markup).toContain("Dit bepaalt de volgorde in de navigatie.");
    expect(markup).toContain("Compacte naam voor de navigatie");
    expect(markup).not.toContain(">Algemeen</legend>");
    expect(markup).not.toContain(">Bronbestanden</legend>");
  });

  it("defaults new LearningSpaces to OneDrive and orders production providers first", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateForm action={() => undefined} subjects={subjects} />);
    const oneDrive = markup.indexOf('<option value="onedrive" selected="">');
    const googleDrive = markup.indexOf('<option value="google_drive">');
    const local = markup.indexOf('<option value="local">');

    expect(oneDrive).toBeGreaterThan(-1);
    expect(oneDrive).toBeLessThan(googleDrive);
    expect(googleDrive).toBeLessThan(local);
    expect(markup).toContain('name="oneDriveDriveId"');
    expect(markup).not.toContain('name="localSourcePath"');
  });
});

const subjects = [
  { id: "subject-fysica", name: "Fysica", sortOrder: 5, isActive: true, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" },
  { id: "subject-wiskunde", name: "Wiskunde", sortOrder: 10, isActive: true, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" },
];
