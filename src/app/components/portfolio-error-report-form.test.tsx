import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PortfolioErrorReportForm, shouldShowErrorReportVariant } from "./portfolio-error-report-form";

const standardExercise = { id: "exercise-5", code: "5", hasAlternativeSolution: false, visible: true };
const alternativeExercise = { id: "exercise-5a", code: "5a", hasAlternativeSolution: true, visible: true };
const hiddenExercise = { id: "exercise-6", code: "6", hasAlternativeSolution: false, visible: false };

describe("PortfolioErrorReportForm", () => {
  it("starts collapsed and renders only supplied document types", () => {
    const collapsed = renderToStaticMarkup(<PortfolioErrorReportForm portfolioId="portfolio-1" documents={["assignment", "hints"]} exercises={[standardExercise]} />);
    const open = renderToStaticMarkup(<PortfolioErrorReportForm portfolioId="portfolio-1" documents={["assignment", "hints"]} exercises={[standardExercise]} initiallyOpen />);

    expect(collapsed).toContain("Foutje gezien? Meld het.");
    expect(collapsed).toContain('aria-expanded="false"');
    expect(open).toContain('<option value="assignment" selected="">Opgaven</option>');
    expect(open).toContain('<option value="hints">Hints</option>');
    expect(open).not.toContain("Eindoplossingen");
    expect(open).not.toContain('name="reporterName"');
  });

  it("uses a free exercise-code input with indexed suggestions and only offers eligible variants", () => {
    const markup = renderToStaticMarkup(<PortfolioErrorReportForm portfolioId="portfolio-1" documents={["final_solutions"]} exercises={[alternativeExercise, standardExercise, hiddenExercise]} initiallyOpen />);

    expect(markup).toContain('name="exerciseCode"');
    expect(markup).toContain('value="5a"');
    expect(markup).toContain('<option value="5a">Oefening 5a</option>');
    expect(markup).toContain('<option value="5">Oefening 5</option>');
    expect(markup).toContain('<option value="6">Oefening 6</option>');
    expect(markup).toContain("Alternatieve uitwerking");
    expect(shouldShowErrorReportVariant("final_solutions", alternativeExercise)).toBe(true);
    expect(shouldShowErrorReportVariant("final_solutions", standardExercise)).toBe(false);
    expect(shouldShowErrorReportVariant("assignment", alternativeExercise)).toBe(false);
    expect(shouldShowErrorReportVariant("hints", alternativeExercise)).toBe(false);
  });

  it("keeps the free input available when the index has no exercise suggestions", () => {
    const markup = renderToStaticMarkup(<PortfolioErrorReportForm portfolioId="portfolio-1" documents={["assignment"]} exercises={[]} initiallyOpen />);

    expect(markup).toContain('name="exerciseCode"');
    expect(markup).toContain("Melding versturen");
  });
});
