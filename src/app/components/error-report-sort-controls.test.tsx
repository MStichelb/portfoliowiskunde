import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorReportSortControls } from "./error-report-sort-controls";

describe("ErrorReportSortControls", () => {
  it("defaults visually to date and exposes both keyboard-accessible sort actions", () => {
    const markup = renderToStaticMarkup(<ErrorReportSortControls sort="date" />);
    expect(markup).toMatch(/<button(?=[^>]*name="sort")(?=[^>]*value="date")(?=[^>]*aria-pressed="true")[^>]*>/);
    expect(markup).toMatch(/<button(?=[^>]*name="sort")(?=[^>]*value="portfolio")(?=[^>]*aria-pressed="false")[^>]*>/);
    expect(markup).toContain("lucide-calendar-days");
    expect(markup).toContain("lucide-notebook");
  });

  it("marks portfolio sorting active after switching", () => {
    const markup = renderToStaticMarkup(<ErrorReportSortControls sort="portfolio" />);
    expect(markup).toMatch(/<button(?=[^>]*name="sort")(?=[^>]*value="date")(?=[^>]*aria-pressed="false")[^>]*>/);
    expect(markup).toMatch(/<button(?=[^>]*name="sort")(?=[^>]*value="portfolio")(?=[^>]*aria-pressed="true")[^>]*>/);
  });
});
