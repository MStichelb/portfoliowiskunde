import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canManageLearningSpace: vi.fn(),
  canConfigureLearningSpace: vi.fn(),
  getLearningSpaceSourceStatus: vi.fn(),
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
    mocks.getThemes.mockResolvedValue([]);
    mocks.getActiveWarningCounts.mockResolvedValue(new Map());
    mocks.getMissingIndexCounts.mockResolvedValue({ exercises: 0, assets: 0 });
  });

  it("passes the authorized stored status into the existing header for an editor", async () => {
    const markup = renderToStaticMarkup(await LearningSpaceAdminPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("Beheerheader");
    expect(mocks.getLearningSpaceSourceStatus).toHaveBeenCalledWith(teacher, "space-5");
    expect(mocks.header).toHaveBeenCalledWith(expect.objectContaining({ sourceStatus: { learningSpaceId: "space-5" } }));
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
});

const teacher = {
  id: "editor", displayName: "Editor", firstName: null, lastName: null, email: null,
  role: "teacher" as const, status: "active" as const, classGroupOverrideId: null,
};

const space = {
  id: "space-5", name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 5, isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "onedrive" as const, localSourcePath: null,
  oneDriveDriveId: "drive", oneDriveFolderId: "folder", oneDriveFolderPath: "Portfolio/5", googleDriveFolderId: null,
  googleDriveFolderLabel: null, sources: [], activeSourceId: null, primarySource: null, mirrorSource: null,
};
