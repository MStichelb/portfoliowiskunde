import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLearningSpaceBySlug: vi.fn(),
  getStudentPortfolio: vi.fn(),
  getVisibleExercise: vi.fn(),
  requireAccess: vi.fn(),
  errorReportProps: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("@/lib/public-index", () => ({ isNextPrefetchRequest: vi.fn(() => false), preparePublicIndex: vi.fn() }));
vi.mock("@/lib/learning-space-access", () => ({ requirePublicLearningSpaceAccess: mocks.requireAccess }));
vi.mock("@/lib/repositories", () => ({
  getLearningSpaceBySlug: mocks.getLearningSpaceBySlug,
  getStudentPortfolio: mocks.getStudentPortfolio,
  getVisibleExercise: mocks.getVisibleExercise,
}));
vi.mock("@/app/components/portfolio-documents-with-message", () => ({ PortfolioDocumentsWithMessage: () => null }));
vi.mock("@/app/components/portfolio-error-report-form", () => ({
  PortfolioErrorReportForm: (props: unknown) => { mocks.errorReportProps(props); return <div data-error-report />; },
}));
vi.mock("@/app/components/error-report-form", () => ({ ErrorReportForm: () => null }));
vi.mock("@/app/components/exercise-solution-with-note", () => ({ ExerciseSolutionWithNote: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/app/components/solution-image", () => ({ SolutionImage: () => null }));
vi.mock("@/app/components/solution-variant-heading", () => ({ SolutionVariantHeading: () => null }));

import LearningSpaceExercisePage from "./[spaceSlug]/oefening/[id]/page";
import LearningSpacePortfolioPage from "./[spaceSlug]/portfolio/[id]/page";

const space = {
  id: "space-1", slug: "fysica", isActive: true,
  collectionLabelSingular: "bunDEL", collectionLabelPlural: "BUNDELS",
  exerciseLabelSingular: "OpGavE", exerciseLabelPlural: "OPGAVEN",
};

describe("public LearningSpace terminology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLearningSpaceBySlug.mockResolvedValue(space);
    mocks.requireAccess.mockResolvedValue({ id: "student", role: "student" });
    mocks.getStudentPortfolio.mockResolvedValue({
      id: "portfolio-1", code: "1", title: "Krachten", themeName: null,
      globalResources: [], customText: null, customTextPosition: "above_documents",
      sections: [{ id: "section-1", order: 1, title: "Basis", exercises: [
        { id: "exercise-1", code: "1a", visible: true },
        { id: "exercise-2", code: "2", visible: false },
      ] }],
    });
    mocks.getVisibleExercise.mockResolvedValue({
      id: "exercise-1", code: "1", portfolioId: "portfolio-1", portfolioCode: "1", portfolioTitle: "Krachten",
      sectionTitle: "Basis", resources: [], customNote: null, noteLabel: null, notePosition: "above_solution",
    });
  });

  it("uses custom labels and does not invent an Other theme on portfolio detail", async () => {
    const markup = renderToStaticMarkup(await LearningSpacePortfolioPage({ params: Promise.resolve({ spaceSlug: "fysica", id: "portfolio-1" }) }));

    expect(markup).toContain("Bundel 1");
    expect(markup).toContain("Opgave 1a");
    expect(markup).toContain("Opgave 2");
    expect(markup).not.toContain("Overige");
    expect(mocks.errorReportProps).toHaveBeenCalledWith(expect.objectContaining({ exerciseLabelSingular: "OpGavE" }));
  });

  it("keeps a real theme as the portfolio prefix", async () => {
    mocks.getStudentPortfolio.mockResolvedValue({
      ...(await mocks.getStudentPortfolio()),
      themeName: "Mechanica",
    });
    const markup = renderToStaticMarkup(await LearningSpacePortfolioPage({ params: Promise.resolve({ spaceSlug: "fysica", id: "portfolio-1" }) }));
    expect(markup).toContain("Mechanica • Bundel 1");
  });

  it("uses standalone and inline capitalization on exercise detail", async () => {
    mocks.getVisibleExercise.mockResolvedValue({
      id: "exercise-3", code: "3", portfolioId: "portfolio-1", portfolioCode: "1", portfolioTitle: "Krachten",
      sectionTitle: "Basis", resources: [], customNote: null, noteLabel: null, notePosition: "above_solution",
    });
    const markup = renderToStaticMarkup(await LearningSpaceExercisePage({ params: Promise.resolve({ spaceSlug: "fysica", id: "exercise-1" }) }));
    expect(markup).toContain("Terug naar bundel");
    expect(markup).toContain("Bundel 1");
    expect(markup).toContain("Opgave 3");
  });
});
