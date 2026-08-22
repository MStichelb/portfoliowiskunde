import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LearningSpaceCreateForm } from "./learning-space-create-form";

describe("LearningSpaceCreateForm", () => {
  it("uses the agreed labels and help text without visible duplicate section legends", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateForm action={() => undefined} />);

    expect(markup).toContain("Weergavenaam");
    expect(markup).toContain(">URL<");
    expect(markup).toContain("Dit wordt gebruikt in het webadres van deze leeromgeving.");
    expect(markup).toContain("Dit bepaalt de volgorde in de navigatie.");
    expect(markup).toContain("Compacte naam voor de navigatie, bijvoorbeeld 5WIS.");
    expect(markup).not.toContain(">Algemeen</legend>");
    expect(markup).not.toContain(">Bronbestanden</legend>");
  });

  it("defaults new LearningSpaces to OneDrive and orders production providers first", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateForm action={() => undefined} />);
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
