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
  externalLinksForm: vi.fn(),
  requireAdminUser: vi.fn(),
  savePortfolioAction: vi.fn(),
  savePortfolioExternalLinksAction: vi.fn(),
  saveSectionPublicationAction: vi.fn(),
  bulkTable: vi.fn(),
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
  savePortfolioExternalLinksAction: mocks.savePortfolioExternalLinksAction,
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
vi.mock("@/app/components/portfolio-external-links-form", () => ({
  PortfolioExternalLinksForm: (props: unknown) => {
    mocks.externalLinksForm(props);
    return <div>Externe links instellen</div>;
  },
}));
vi.mock("@/app/components/publication-status", () => ({ PublicationStatus: () => <span>Status</span> }));
vi.mock("@/app/components/section-publication-form", () => ({ SectionPublicationForm: () => <div>Onderdeelinstellingen</div> }));
vi.mock("@/app/components/exercise-bulk-table", () => ({ ExerciseBulkTable: (props: unknown) => { mocks.bulkTable(props); return <div>Oefeningenlijst</div>; } }));

import LearningSpacePortfolioAdminPage from "./page";

describe("LearningSpace portfolio settings page", () => {
  it("passes direct exercises to the existing controls without adding a section", async () => {
    const portfolio = await mocks.getAdminPortfolio();
    const direct = portfolio.sections[0].exercises[0];
    mocks.getAdminPortfolio.mockResolvedValue({ ...portfolio, exercises: [direct], sections: [] });
    const markup = renderToStaticMarkup(await LearningSpacePortfolioAdminPage({ params: Promise.resolve({ spaceSlug: "5", id: "portfolio-1" }) }));
    expect(markup).not.toContain("Onderdelen");
    expect(markup).not.toContain("section-card-list");
    expect(mocks.bulkTable).toHaveBeenCalledWith(expect.objectContaining({
      sections: [], exercises: [expect.objectContaining({ id: direct.id, configuredVisible: true, status: direct.effectiveStatus })],
    }));
  });

  it("retains real section settings alongside direct exercises in mixed portfolios", async () => {
    const portfolio = await mocks.getAdminPortfolio();
    const direct = { ...portfolio.sections[0].exercises[0], id: "direct-exercise", code: "2" };
    mocks.getAdminPortfolio.mockResolvedValue({ ...portfolio, exercises: [direct] });
    const markup = renderToStaticMarkup(await LearningSpacePortfolioAdminPage({ params: Promise.resolve({ spaceSlug: "5", id: "portfolio-1" }) }));
    expect(markup).toContain("<h2>Onderdelen</h2>");
    expect(markup).toContain("1.1 Basis");
    expect(markup.match(/class="section-settings-card"/g)).toHaveLength(1);
    expect(mocks.bulkTable).toHaveBeenCalledWith(expect.objectContaining({
      exercises: [expect.objectContaining({ id: "direct-exercise" })],
      sections: [expect.objectContaining({ id: "section-1", code: "1.1" })],
    }));
    for (const label of ["Algemeen", "Overig", "Onderdeel 0", "Zonder onderdeel", "null"]) expect(markup).not.toContain(label);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: "teacher", role: "teacher", status: "active" });
    mocks.canManageLearningSpace.mockResolvedValue(true);
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({
      id: "space-5", slug: "5", collectionLabelSingular: "Portfolio", collectionLabelPlural: "Portfolio's", exerciseLabelSingular: "Oefening", exerciseLabelPlural: "Oefeningen",
      levelPresentation: { opwarmer: { symbolId: "star", count: 1 }, basis: { symbolId: "star", count: 2 }, uitdaging: { symbolId: "star", count: 3 }, verdieping: { symbolId: "diamond", count: 1 } },
    });
    mocks.getAdminPortfolio.mockResolvedValue({
      id: "portfolio-1", code: "1", title: "Goniometrie", detectedTitle: "Goniometrie", cardColor: "#E7EEF2",
      visible: true, limited: false, publishFrom: null, publishUntil: null, customText: "Bericht", customTextPosition: "above_documents",
      themeId: "theme-analysis", effectiveStatus: { state: "visible" }, hintsDocumentPath: null,
      globalResources: [{ id: "video", kind: "external_link", label: "Video", icon: "monitor-play", semanticRole: "generic", documentKind: null, url: null, available: false }],
      sections: [{ id: "section-1", code: "1.1", title: "Basis", exercises: [{
        id: "exercise-1", code: "1", levelOverrideMode: "inherit", levelOverride: null, effectiveLevel: "basis", visibilityMode: "visible", effectiveStatus: { state: "visible" },
        standardAssets: 1, alternativeAssets: 0, missingAssets: 0, showAlternativeToStudents: false, isIndexed: true,
        noteLabel: null, customNote: null, notePosition: "above_solution",
      }] }],
    });
    mocks.getPortfolioWarnings.mockResolvedValue([]);
    mocks.getThemes.mockResolvedValue([{ id: "theme-analysis", learningSpaceId: "space-5", name: "Analyse", sortOrder: 1 }]);
  });

  it.each(["1", "2", "3", "1.2", "1.10", "01.02"])("shows source section code %s in settings and the bulk table", async (code: string) => {
    const portfolio = await mocks.getAdminPortfolio();
    mocks.getAdminPortfolio.mockResolvedValue({ ...portfolio, sections: [{ ...portfolio.sections[0], code }] });
    const markup = renderToStaticMarkup(await LearningSpacePortfolioAdminPage({ params: Promise.resolve({ spaceSlug: "5", id: "portfolio-1" }) }));
    expect(markup).toContain(`${code}${code.includes(".") ? "" : "."} Basis`);
    expect(mocks.bulkTable).toHaveBeenCalledWith(expect.objectContaining({ sections: [expect.objectContaining({ code })] }));
  });

  it("geeft opgeslagen thema en beschikbare opties door aan het ene settingsformulier", async () => {
    const markup = renderToStaticMarkup(await LearningSpacePortfolioAdminPage({ params: Promise.resolve({ spaceSlug: "5", id: "portfolio-1" }) }));

    expect(mocks.portfolioForm).toHaveBeenCalledWith(expect.objectContaining({
      themeId: "theme-analysis",
      themes: [expect.objectContaining({ id: "theme-analysis", name: "Analyse" })],
      action: mocks.savePortfolioAction,
    }));
    expect(markup).toContain("Gecombineerd instellingenformulier");
    expect(mocks.externalLinksForm).toHaveBeenCalledWith(expect.objectContaining({
      portfolioId: "portfolio-1",
      resources: [expect.objectContaining({ id: "video", kind: "external_link" })],
      action: mocks.savePortfolioExternalLinksAction,
    }));
    expect(markup).toContain("Externe links instellen");
    expect(markup).toContain("Portfolio-instellingen");
    expect(markup).not.toContain("Thema opslaan");
  });

  it("renders custom terminology while keeping the internal portfolio route untouched", async () => {
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({
      id: "space-5", slug: "5", subjectName: "Fysica", collectionLabelSingular: "bunDEL", collectionLabelPlural: "bUNDELS", exerciseLabelSingular: "OpGavE", exerciseLabelPlural: "OPGAVEN",
    });

    const markup = renderToStaticMarkup(await LearningSpacePortfolioAdminPage({ params: Promise.resolve({ spaceSlug: "5", id: "portfolio-1" }) }));

    expect(markup).toContain("Bundel 1");
    expect(markup).toContain("Bundel-instellingen");
    expect(markup).toContain("Opgaven");
    expect(markup).toContain("1.1 Basis");
    expect(markup).not.toContain("1.1. Basis");
    expect(mocks.bulkTable).toHaveBeenCalledWith(expect.objectContaining({ learningSpaceId: "space-5", exerciseLabelSingular: "OpGavE", exerciseLabelPlural: "OPGAVEN" }));
    expect(mocks.bulkTable).toHaveBeenCalledWith(expect.objectContaining({
      sections: [expect.objectContaining({ code: "1.1", exercises: [expect.objectContaining({ effectiveLevel: "basis" })] })],
    }));
  });
});
