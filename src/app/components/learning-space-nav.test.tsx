import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LearningSpace } from "@/lib/repositories";

import { LearningSpaceNav } from "./learning-space-nav";

const base: LearningSpace = {
  id: "space-5", name: "Vijfde jaar wiskunde", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 50, isActive: true, archivedAt: null, sourceType: "local", localSourcePath: null,
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
    expect(markup).toContain("Publieke pagina");
    expect(markup).not.toContain(">Foutmeldingen<");
  });
});
