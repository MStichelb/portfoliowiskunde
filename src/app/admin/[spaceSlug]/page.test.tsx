import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canManageLearningSpace: vi.fn(),
  canConfigureLearningSpace: vi.fn(),
  getLearningSpaceSourceStatus: vi.fn(),
  getActiveSourceProfile: vi.fn(),
  hasConfiguredActiveSource: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getAdminPortfolios: vi.fn(),
  getThemes: vi.fn(),
  getActiveWarningCounts: vi.fn(),
  getMissingIndexCounts: vi.fn(),
  header: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({
  canManageLearningSpace: mocks.canManageLearningSpace,
  canConfigureLearningSpace: mocks.canConfigureLearningSpace,
}));
vi.mock("@/lib/learning-space-source-status", () => ({ getLearningSpaceSourceStatus: mocks.getLearningSpaceSourceStatus }));
vi.mock("@/lib/source-profiles", () => ({ getActiveSourceProfileForLearningSpace: mocks.getActiveSourceProfile }));
vi.mock("@/lib/storage", () => ({ hasConfiguredActiveSource: mocks.hasConfiguredActiveSource }));
vi.mock("@/lib/repositories", () => ({
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
  getAdminPortfolios: mocks.getAdminPortfolios,
  getThemes: mocks.getThemes,
  getActiveWarningCounts: mocks.getActiveWarningCounts,
  getMissingIndexCounts: mocks.getMissingIndexCounts,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/app/components/admin-space-header", () => ({
  AdminSpaceHeader: (props: unknown) => {
    mocks.header(props);
    return <header>Beheerheader</header>;
  },
}));
vi.mock("@/app/components/confirm-action-button", () => ({ ConfirmActionButton: () => <button>Opschonen</button> }));
vi.mock("@/app/components/publication-status", () => ({ PublicationStatus: () => <span>Publicatiestatus</span> }));
vi.mock("../actions", () => ({ archiveMissingIndexAction: vi.fn() }));

import LearningSpaceAdminPage from "./page";

describe("LearningSpace portfolio management source status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue(teacher);
    mocks.canManageLearningSpace.mockResolvedValue(true);
    mocks.canConfigureLearningSpace.mockResolvedValue(false);
    mocks.getLearningSpaceSourceStatus.mockResolvedValue({ learningSpaceId: "space-5" });
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(space);
    mocks.getAdminPortfolios.mockResolvedValue([]);
    mocks.getActiveSourceProfile.mockResolvedValue({ id: "profile-1" });
    mocks.hasConfiguredActiveSource.mockResolvedValue(true);
    mocks.getThemes.mockResolvedValue([]);
    mocks.getActiveWarningCounts.mockResolvedValue(new Map());
    mocks.getMissingIndexCounts.mockResolvedValue({ exercises: 0, assets: 0 });
  });

  it.each([[true, true], [true, false], [false, true], [false, false]])("shows only missing setup items for profile=%s/source=%s", async (missingProfile, missingSource) => {
    mocks.canConfigureLearningSpace.mockResolvedValue(true);
    mocks.getActiveSourceProfile.mockResolvedValue(missingProfile ? null : { id: "profile" });
    mocks.hasConfiguredActiveSource.mockResolvedValue(!missingSource);
    const markup = renderToStaticMarkup(await LearningSpaceAdminPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(markup.includes("Maak de configuratie af")).toBe(missingProfile || missingSource);
    expect(markup.includes("Bronprofiel instellen")).toBe(missingProfile);
    expect(markup.includes("Bron instellen")).toBe(missingSource);
    expect(mocks.header).toHaveBeenCalledWith(expect.objectContaining({ setup: { missingProfile, missingSource } }));
    if (!missingProfile && !missingSource) expect(markup).toContain("Synchroniseer om de eerste inhoud te laden.");
  });

  it("shows a content empty state after successful synchronization", async () => {
    mocks.getLearningSpaceSourceStatus.mockResolvedValue({ synchronization: { latestSuccessful: { id: "sync" } } });
    const markup = renderToStaticMarkup(await LearningSpaceAdminPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(markup).toContain("Nog geen");
    expect(markup).not.toContain("Synchroniseer om de eerste inhoud");
  });

  it("shows incomplete configuration warnings and removes them after configuration", async () => {
    mocks.getActiveSourceProfile.mockResolvedValue(null);
    mocks.hasConfiguredActiveSource.mockResolvedValue(false);
    const incomplete = renderToStaticMarkup(await LearningSpaceAdminPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(incomplete).toContain("Bronprofiel ontbreekt");
    expect(incomplete).toContain("Bron ontbreekt");
    expect(incomplete.match(/Bronprofiel ontbreekt/g)).toHaveLength(1);
    expect(incomplete.match(/Bron ontbreekt/g)).toHaveLength(1);
    expect(incomplete).toContain("Je inhoud verschijnt zodra de instellingen zijn aangevuld.");
    expect(incomplete).not.toContain("Configureer een bron en synchroniseer");
    mocks.getActiveSourceProfile.mockResolvedValue({ id: "profile-1" });
    mocks.hasConfiguredActiveSource.mockResolvedValue(true);
    const complete = renderToStaticMarkup(await LearningSpaceAdminPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(complete).not.toContain("Bronprofiel ontbreekt");
    expect(complete).not.toContain("Bron ontbreekt");
  });

  it("passes the authorized stored status into the existing header for an editor", async () => {
    const markup = renderToStaticMarkup(await LearningSpaceAdminPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("Beheerheader");
    expect(mocks.getLearningSpaceSourceStatus).toHaveBeenCalledWith(teacher, "space-5");
    expect(mocks.header).toHaveBeenCalledWith(expect.objectContaining({ sourceStatus: { learningSpaceId: "space-5" } }));
  });

  it.each([
    [0, [2, 1], 3],
    [2, [], 2],
    [2, [2, 1], 5],
    [1, [0], 1],
    [0, [], 0],
  ] as const)("counts direct=%s and sections=%j once in the portfolio total", async (direct: number, sectionCounts: readonly number[], expected: number) => {
    mocks.getAdminPortfolios.mockResolvedValue([{
      id: "portfolio-count", code: "1", title: "Tellingen", themeId: null, effectiveStatus: "visible",
      exercises: Array.from({ length: direct }, (_, index) => ({ id: `direct-${index}` })),
      sections: sectionCounts.map((count, index) => ({
        id: `section-${index}`, exercises: Array.from({ length: count }, (_, exercise) => ({ id: `section-${index}-exercise-${exercise}` })),
      })),
    }]);
    const markup = renderToStaticMarkup(await LearningSpaceAdminPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(markup).toContain(`<td>${sectionCounts.length}</td><td>${expected}</td>`);
  });

  it("uses the same header status flow for an owner without rendering a modal", async () => {
    mocks.canConfigureLearningSpace.mockResolvedValue(true);

    const markup = renderToStaticMarkup(await LearningSpaceAdminPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).not.toContain("Uitgebreide bronstatus");
    expect(mocks.getLearningSpaceSourceStatus).toHaveBeenCalledWith(teacher, "space-5");
    expect(mocks.header).toHaveBeenCalledWith(expect.objectContaining({ canConfigure: true, sourceStatus: { learningSpaceId: "space-5" } }));
  });

  it("keeps portfolio warnings and the existing cleanup action in their original location", async () => {
    mocks.getAdminPortfolios.mockResolvedValue([{
      id: "portfolio-1", code: "1", title: "Portfolio 1", themeId: null, effectiveStatus: "visible",
      sections: [{ exercises: [] }],
    }]);
    mocks.getActiveWarningCounts.mockResolvedValue(new Map([["portfolio-1", 2]]));
    mocks.getMissingIndexCounts.mockResolvedValue({ exercises: 1, assets: 3 });

    const markup = renderToStaticMarkup(await LearningSpaceAdminPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("1 verdwenen oefeningen en 3 verdwenen bestanden");
    expect(markup).toContain("Opschonen");
    expect(markup).toContain('class="warning-count"');
    expect(markup).toContain("2 waarschuwingen");
  });

  it("uses the configured collection terminology in the LearningSpace overview", async () => {
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({
      ...space,
      subjectId: "subject-fysica",
      subjectName: "Fysica",
      collectionLabelSingular: "bunDEL",
      collectionLabelPlural: "BUNDELS",
      exerciseLabelSingular: "OpGavE",
      exerciseLabelPlural: "OPGAVEN",
    });
    mocks.getAdminPortfolios.mockResolvedValue([{
      id: "portfolio-1", code: "1", title: "Krachten", themeId: null, effectiveStatus: "visible", sections: [],
    }]);

    const markup = renderToStaticMarkup(await LearningSpaceAdminPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).not.toContain("Overige Bundels");
    expect(markup).toContain("Opgaven");
    expect(markup).toContain('aria-label="Bundel beheren"');
    expect(markup).toContain('href="/admin/5/portfolio/portfolio-1"');
  });
});

const teacher = {
  id: "editor", displayName: "Editor", firstName: null, lastName: null, email: null,
  role: "teacher" as const, status: "active" as const, classGroupOverrideId: null,
};

const space = {
  id: "space-5", subjectId: "subject-wiskunde", subjectName: "Wiskunde", subjectIsActive: true,
  collectionLabelSingular: "Portfolio", collectionLabelPlural: "Portfolio's",
  exerciseLabelSingular: "Oefening", exerciseLabelPlural: "Oefeningen",
  name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 5, isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "onedrive" as const, localSourcePath: null,
  oneDriveDriveId: "drive", oneDriveFolderId: "folder", oneDriveFolderPath: "Portfolio/5", googleDriveFolderId: null,
  googleDriveFolderLabel: null, sources: [], activeSourceId: null, primarySource: null, mirrorSource: null,
};
