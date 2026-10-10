import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_EXERCISE_LEVEL_PRESENTATION } from "@/lib/exercise-level-presentation";

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

const levelPresentation = {
  ...DEFAULT_EXERCISE_LEVEL_PRESENTATION,
  opwarmer: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.opwarmer, displayName: "Instap", symbolId: "circle" as const, count: 2, color: "#123456" },
  basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, displayName: "Kern", symbolId: "diamond" as const, color: "#654321", showPublicBackground: true },
};

const space = {
  id: "space-1", slug: "fysica", isActive: true,
  collectionLabelSingular: "bunDEL", collectionLabelPlural: "BUNDELS",
  exerciseLabelSingular: "OpGavE", exerciseLabelPlural: "OPGAVEN",
  levelPresentation,
};

const studentPortfolio = {
  id: "portfolio-1", code: "1", title: "Krachten", themeName: null,
  globalResources: [], customText: null, customTextPosition: "above_documents",
  sections: [{ id: "section-1", code: "1", title: "Basis", exercises: [
    { id: "exercise-1", code: "1a", visible: true, effectiveLevel: null },
    { id: "exercise-2", code: "2", visible: false, effectiveLevel: null },
  ] }],
};

describe("public LearningSpace terminology", () => {
  it.each(["empty", "mixed"])("omits empty section headings and grids in %s portfolios without duplicating exercises", async (structure: string) => {
    const emptySection = { id: "empty-section", code: "2", title: "Leeg onderdeel", exercises: [] };
    const direct = { id: "direct-visible", code: "3", visible: true, effectiveLevel: null };
    const sections = structure === "empty" ? [emptySection] : [emptySection, ...studentPortfolio.sections];
    const exercises = structure === "empty" ? [] : [direct];
    const portfolio = { ...studentPortfolio, sections, exercises };
    mocks.getStudentPortfolio.mockResolvedValue(portfolio);

    const markup = renderToStaticMarkup(await LearningSpacePortfolioPage({ params: Promise.resolve({ spaceSlug: "fysica", id: "portfolio-1" }) }));

    expect(markup).not.toContain("Leeg onderdeel");
    expect(markup.match(/<h2>/g)?.length ?? 0).toBe(structure === "empty" ? 0 : 1);
    expect(markup.match(/class="exercise-grid"/g)?.length ?? 0).toBe(structure === "empty" ? 0 : 2);
    expect(portfolio.sections[0]).toEqual(emptySection);
    if (structure === "mixed") {
      expect(markup.match(/href="\/fysica\/oefening\/direct-visible"/g)).toHaveLength(1);
      expect(markup.match(/href="\/fysica\/oefening\/exercise-1"/g)).toHaveLength(1);
      expect(markup.match(/Niet beschikbaar/g)).toHaveLength(1);
      expect(markup.indexOf("Oef. 3")).toBeLessThan(markup.indexOf("<h2>1. Basis</h2>"));
      expect(markup).not.toContain("Zonder onderdeel");
    }
  });

  it("keeps a section containing only unavailable exercise items", async () => {
    mocks.getStudentPortfolio.mockResolvedValue({
      ...studentPortfolio,
      sections: [{ ...studentPortfolio.sections[0], exercises: [studentPortfolio.sections[0].exercises[1]] }],
    });

    const markup = renderToStaticMarkup(await LearningSpacePortfolioPage({ params: Promise.resolve({ spaceSlug: "fysica", id: "portfolio-1" }) }));

    expect(markup).toContain("<h2>1. Basis</h2>");
    expect(markup).toContain('<span class="exercise-hidden">Oef. 2<small>Niet beschikbaar</small>');
    expect(markup).not.toContain('/fysica/oefening/exercise-2');
  });

  it.each(["sections", "direct", "mixed"])("preserves source hierarchy and visibility for %s portfolios", async (structure: string) => {
    const direct = [
      { id: "direct-visible", code: "3", visible: true, effectiveLevel: "basis" },
      { id: "direct-hidden", code: "4", visible: false, effectiveLevel: null },
    ];
    const sections = structure === "direct" ? [] : studentPortfolio.sections;
    const exercises = structure === "sections" ? [] : direct;
    mocks.getStudentPortfolio.mockResolvedValue({ ...studentPortfolio, sections, exercises });
    const markup = renderToStaticMarkup(await LearningSpacePortfolioPage({ params: Promise.resolve({ spaceSlug: "fysica", id: "portfolio-1" }) }));
    expect(markup.match(/<h2>/g)?.length ?? 0).toBe(sections.length);
    expect(markup.match(/class="exercise-grid"/g)?.length ?? 0).toBe(sections.length + (exercises.length ? 1 : 0));
    if (exercises.length) {
      expect(markup).toContain('<div class="section"><ol class="exercise-grid"');
      expect(markup).toContain('/fysica/oefening/direct-visible');
      expect(markup).not.toContain('/fysica/oefening/direct-hidden');
      expect(markup).toContain('<span class="exercise-hidden">Oef. 4<small>Niet beschikbaar</small>');
      if (sections.length) expect(markup.indexOf("Oef. 3")).toBeLessThan(markup.indexOf("<h2>1. Basis</h2>"));
    }
    if (sections.length) expect(markup).toContain('<section class="section"><h2>1. Basis</h2>');
    expect(mocks.errorReportProps).toHaveBeenCalledWith(expect.objectContaining({ exercises: [...exercises, ...sections.flatMap((section) => section.exercises)] }));
    for (const label of ["Algemeen", "Overig", "Onderdeel 0", "Zonder onderdeel", "null"]) expect(markup).not.toContain(label);
  });

  it("opens direct exercises from a portfolio and includes them in report choices without a section label", async () => {
    const direct = { ...studentPortfolio.sections[0].exercises[0], id: "direct-exercise", code: "3" };
    mocks.getStudentPortfolio.mockResolvedValue({ ...studentPortfolio, exercises: [direct], sections: [] });
    const markup = renderToStaticMarkup(await LearningSpacePortfolioPage({ params: Promise.resolve({ spaceSlug: "fysica", id: "portfolio-1" }) }));
    expect(markup).toContain('/fysica/oefening/direct-exercise');
    expect(markup).toContain("Oef. 3");
    expect(markup).not.toContain("Basis");
    expect(mocks.errorReportProps).toHaveBeenCalledWith(expect.objectContaining({ exercises: [direct] }));
    mocks.getVisibleExercise.mockResolvedValue({ ...(await mocks.getVisibleExercise()), sectionCode: null, sectionTitle: null });
    const detail = renderToStaticMarkup(await LearningSpaceExercisePage({ params: Promise.resolve({ spaceSlug: "fysica", id: "direct-exercise" }) }));
    expect(detail).toContain("Opgave 1");
    expect(detail).not.toContain("null");
    expect(detail).not.toContain("Basis");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLearningSpaceBySlug.mockResolvedValue(space);
    mocks.requireAccess.mockResolvedValue({ id: "student", role: "student" });
    mocks.getStudentPortfolio.mockResolvedValue(studentPortfolio);
    mocks.getVisibleExercise.mockResolvedValue({
      id: "exercise-1", code: "1", portfolioId: "portfolio-1", portfolioCode: "1", portfolioTitle: "Krachten",
      sectionCode: "1.1", sectionTitle: "Basis", effectiveLevel: null, resources: [], customNote: null, noteLabel: null, notePosition: "above_solution",
    });
  });

  it("uses custom labels and does not invent an Other theme on portfolio detail", async () => {
    const markup = renderToStaticMarkup(await LearningSpacePortfolioPage({ params: Promise.resolve({ spaceSlug: "fysica", id: "portfolio-1" }) }));

    expect(markup).toContain("Bundel 1");
    expect(markup).toContain("1. Basis");
    expect(markup).toContain("Oef. 1a");
    expect(markup).toContain("Oef. 2");
    expect(markup).not.toContain("Overige");
    expect(mocks.errorReportProps).toHaveBeenCalledWith(expect.objectContaining({ exerciseLabelSingular: "OpGavE" }));
  });

  it.each(["1.1", "1.2", "1.10", "01.02"])("shows source section code %s exactly", async (code: string) => {
    mocks.getStudentPortfolio.mockResolvedValue({
      ...studentPortfolio,
      sections: [{ ...studentPortfolio.sections[0], code }],
    });

    const markup = renderToStaticMarkup(await LearningSpacePortfolioPage({ params: Promise.resolve({ spaceSlug: "fysica", id: "portfolio-1" }) }));
    expect(markup).toContain(`${code} Basis`);
    expect(markup).not.toContain(`${code}. Basis`);
  });

  it("keeps a real theme as the portfolio prefix", async () => {
    mocks.getStudentPortfolio.mockResolvedValue({
      ...studentPortfolio,
      themeName: "Mechanica",
    });
    const markup = renderToStaticMarkup(await LearningSpacePortfolioPage({ params: Promise.resolve({ spaceSlug: "fysica", id: "portfolio-1" }) }));
    expect(markup).toContain("Mechanica • Bundel 1");
  });

  it("uses standalone and inline capitalization on exercise detail", async () => {
    mocks.getVisibleExercise.mockResolvedValue({
      id: "exercise-3", code: "3", portfolioId: "portfolio-1", portfolioCode: "1", portfolioTitle: "Krachten",
      sectionCode: "1.1", sectionTitle: "Basis", effectiveLevel: null, resources: [], customNote: null, noteLabel: null, notePosition: "above_solution",
    });
    const markup = renderToStaticMarkup(await LearningSpaceExercisePage({ params: Promise.resolve({ spaceSlug: "fysica", id: "exercise-1" }) }));
    expect(markup).toContain("Terug naar bundel");
    expect(markup).toContain("Bundel 1");
    expect(markup).toContain("Opgave 3");
    expect(markup).toContain("1.1 Basis");
    expect(markup).not.toContain("1.1. Basis");
  });

  it("renders configured public level symbols before clickable exercise labels and omits null levels", async () => {
    mocks.getStudentPortfolio.mockResolvedValue({
      ...studentPortfolio,
      sections: [{ id: "section-1", code: "1", title: "Basis", exercises: [
        { id: "exercise-1", code: "1a", visible: true, effectiveLevel: "opwarmer" },
        { id: "exercise-2", code: "1b", visible: true, effectiveLevel: "basis" },
        { id: "exercise-3", code: "1c", visible: true, effectiveLevel: null },
        { id: "exercise-4", code: "1d", visible: false, effectiveLevel: "uitdaging" },
      ] }],
    });

    const markup = renderToStaticMarkup(await LearningSpacePortfolioPage({ params: Promise.resolve({ spaceSlug: "fysica", id: "portfolio-1" }) }));

    expect(markup).toContain('aria-label="Instap"');
    expect(markup).toContain('title="Instap"');
    expect(markup).toContain("●●");
    expect(markup).toContain("color:#123456");
    expect(markup).not.toContain("background-color:#D0D6DD");
    expect(markup).toContain('aria-label="Kern"');
    expect(markup).toContain("background-color:");
    expect(markup.indexOf('aria-label="Instap"')).toBeLessThan(markup.indexOf("Oef. 1a"));
    expect(markup.indexOf('aria-label="Kern"')).toBeLessThan(markup.indexOf("Oef. 1b"));
    expect(markup).not.toContain('aria-label="Geen niveau"');
    expect(markup).not.toContain('aria-label="Uitdaging"');
    expect(mocks.getLearningSpaceBySlug).toHaveBeenCalledTimes(1);
    expect(mocks.getStudentPortfolio).toHaveBeenCalledTimes(1);
  });

  it("renders the configured public level before the exercise detail title", async () => {
    mocks.getVisibleExercise.mockResolvedValue({
      id: "exercise-1", code: "1", portfolioId: "portfolio-1", portfolioCode: "1", portfolioTitle: "Krachten",
      sectionCode: "1.1", sectionTitle: "Basis", effectiveLevel: "basis", resources: [], customNote: null, noteLabel: null, notePosition: "above_solution",
    });

    const markup = renderToStaticMarkup(await LearningSpaceExercisePage({ params: Promise.resolve({ spaceSlug: "fysica", id: "exercise-1" }) }));

    expect(markup).toContain('class="public-exercise-title"');
    expect(markup).toContain('aria-label="Kern"');
    expect(markup).toContain("color:#654321");
    expect(markup).toContain("background-color:");
    expect(markup.indexOf('aria-label="Kern"')).toBeLessThan(markup.indexOf("Opgave 1"));
    expect(mocks.getLearningSpaceBySlug).toHaveBeenCalledTimes(1);
    expect(mocks.getVisibleExercise).toHaveBeenCalledTimes(1);
  });

  it("omits the public level indicator on exercise detail when no effective level exists", async () => {
    const markup = renderToStaticMarkup(await LearningSpaceExercisePage({ params: Promise.resolve({ spaceSlug: "fysica", id: "exercise-1" }) }));

    expect(markup).toContain("Opgave 1");
    expect(markup).not.toContain("exercise-level-badge");
    expect(markup).not.toContain("Geen niveau");
  });
});
