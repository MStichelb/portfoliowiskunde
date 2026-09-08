import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canManageLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getAdminPortfolio: vi.fn(),
  getPortfolioWarnings: vi.fn(),
  getThemes: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  portfolioForm: vi.fn(),
  requireAdminUser: vi.fn(),
  savePortfolioAction: vi.fn(),
  saveSectionPublicationAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ canManageLearningSpace: mocks.canManageLearningSpace }));
vi.mock("@/lib/repositories", () => ({
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
  getAdminPortfolio: mocks.getAdminPortfolio,
  getPortfolioWarnings: mocks.getPortfolioWarnings,
  getThemes: mocks.getThemes,
}));
vi.mock("../../../actions", () => ({
  savePortfolioAction: mocks.savePortfolioAction,
  saveSectionPublicationAction: mocks.saveSectionPublicationAction,
}));
vi.mock("@/app/components/admin-space-header", () => ({ AdminSpaceHeader: () => <div>Beheerheader</div> }));
vi.mock("@/app/components/portfolio-publication-form", () => ({
  PortfolioPublicationForm: (props: unknown) => {
    mocks.portfolioForm(props);
    return <div>Gecombineerd instellingenformulier</div>;
  },
}));
vi.mock("@/app/components/portfolio-document-links", () => ({ PortfolioDocumentLinks: () => <div>Documenten</div> }));
vi.mock("@/app/components/publication-status", () => ({ PublicationStatus: () => <span>Status</span> }));
vi.mock("@/app/components/section-publication-form", () => ({ SectionPublicationForm: () => <div>Onderdeelinstellingen</div> }));
vi.mock("@/app/components/exercise-bulk-table", () => ({ ExerciseBulkTable: () => <div>Oefeningen</div> }));

import LearningSpacePortfolioAdminPage from "./page";

describe("LearningSpace portfolio settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: "teacher", role: "teacher", status: "active" });
    mocks.canManageLearningSpace.mockResolvedValue(true);
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ id: "space-5", slug: "5" });
    mocks.getAdminPortfolio.mockResolvedValue({
      id: "portfolio-1", code: "1", title: "Goniometrie", detectedTitle: "Goniometrie", cardColor: "#E7EEF2",
      visible: true, limited: false, publishFrom: null, publishUntil: null, customText: "Bericht", customTextPosition: "above_documents",
      themeId: "theme-analysis", effectiveStatus: { state: "visible" }, hintsDocumentPath: null, sections: [],
    });
    mocks.getPortfolioWarnings.mockResolvedValue([]);
    mocks.getThemes.mockResolvedValue([{ id: "theme-analysis", learningSpaceId: "space-5", name: "Analyse", sortOrder: 1 }]);
  });

  it("geeft opgeslagen thema en beschikbare opties door aan het ene settingsformulier", async () => {
    const markup = renderToStaticMarkup(await LearningSpacePortfolioAdminPage({ params: Promise.resolve({ spaceSlug: "5", id: "portfolio-1" }) }));

    expect(mocks.portfolioForm).toHaveBeenCalledWith(expect.objectContaining({
      themeId: "theme-analysis",
      themes: [expect.objectContaining({ id: "theme-analysis", name: "Analyse" })],
      action: mocks.savePortfolioAction,
    }));
    expect(markup).toContain("Gecombineerd instellingenformulier");
    expect(markup).not.toContain("Thema opslaan");
  });
});
