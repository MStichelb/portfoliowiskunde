import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PortfolioErrorReportForm, shouldShowErrorReportVariant } from "./portfolio-error-report-form";

const standardExercise = { id: "exercise-5", code: "5", hasAlternativeSolution: false };
const alternativeExercise = { id: "exercise-5a", code: "5a", hasAlternativeSolution: true };

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

  it("uses internal exercise IDs and shows variants only for eligible final solutions", () => {
    const markup = renderToStaticMarkup(<PortfolioErrorReportForm portfolioId="portfolio-1" documents={["final_solutions"]} exercises={[alternativeExercise, standardExercise]} initiallyOpen />);

    expect(markup).toContain('<option value="exercise-5a" selected="">Oefening 5a</option>');
    expect(markup).toContain('<option value="exercise-5">Oefening 5</option>');
    expect(markup).toContain("Alternatieve uitwerking");
    expect(shouldShowErrorReportVariant("final_solutions", alternativeExercise)).toBe(true);
    expect(shouldShowErrorReportVariant("final_solutions", standardExercise)).toBe(false);
    expect(shouldShowErrorReportVariant("assignment", alternativeExercise)).toBe(false);
    expect(shouldShowErrorReportVariant("hints", alternativeExercise)).toBe(false);
  });
});
