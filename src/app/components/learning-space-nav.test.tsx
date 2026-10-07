import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LearningSpace } from "@/lib/repositories";

import { LearningSpaceNav } from "./learning-space-nav";

const base: LearningSpace = {
  id: "space-5", subjectId: "subject-wiskunde", subjectName: "Wiskunde", subjectIsActive: true,
  collectionLabelSingular: "Portfolio", collectionLabelPlural: "Portfolio's",
  exerciseLabelSingular: "Oefening", exerciseLabelPlural: "Oefeningen",
  name: "Vijfde jaar wiskunde", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 50, isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "local", localSourcePath: null,
  oneDriveDriveId: null, oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null,
  googleDriveFolderLabel: null, sources: [], activeSourceId: null, primarySource: null, mirrorSource: null,
};

describe("LearningSpace admin navigation", () => {
  it("contains only the agreed functional tabs", () => {
    const markup = renderToStaticMarkup(<LearningSpaceNav current={base} section="portfolios" />);
    expect(markup).not.toContain("5WIS");
    expect(markup).not.toContain("Vijfde jaar wiskunde");
    expect(markup).not.toContain("space-switcher");
    expect(markup).toContain("Portfolio");
    expect(markup).toContain("Thema");
    expect(markup).toContain("Instellingen");
    expect(markup).toContain("Toegang");
    expect(markup).toContain("Publieke pagina");
    expect(markup).not.toContain(">Foutmeldingen<");
    expect(markup).not.toContain('/admin/5/status');
  });

  it("shows the access tab in the agreed order and accepts access as current section", () => {
    const markup = renderToStaticMarkup(<LearningSpaceNav current={base} section="access" />);
    const portfolios = markup.indexOf("Portfolio");
    const themes = markup.indexOf("Thema");
    const settings = markup.indexOf("Instellingen");
    const access = markup.indexOf("Toegang");
    const publicPage = markup.indexOf("Publieke pagina");

    expect(portfolios).toBeLessThan(themes);
    expect(themes).toBeLessThan(settings);
    expect(settings).toBeLessThan(access);
    expect(access).toBeLessThan(publicPage);
    expect(markup).toContain('href="/admin/5/toegang"');
    expect(markup).toContain('class="space-link-current" href="/admin/5/toegang"');
  });

  it("uses per-space terminology without deriving it from the subject", () => {
    const markup = renderToStaticMarkup(<LearningSpaceNav
      current={{ ...base, subjectId: "subject-fysica", subjectName: "Fysica", collectionLabelSingular: "bunDEL", collectionLabelPlural: "bUNDELS", themeLabelSingular: "dEEL", themeLabelPlural: "dELEN" }}
      section="portfolios"
    />);

    expect(markup).toContain("Bundels");
    expect(markup).toContain(">Delen</a>");
    expect(markup).toContain('href="/admin/5/themas"');
    expect(markup).not.toContain("Thema");
    expect(markup).not.toContain("bUNDELS");
    expect(markup).not.toContain("Portfolio&#x27;s");
    expect(markup).toContain('href="/admin/5"');
  });
});
