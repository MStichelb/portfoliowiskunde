import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ErrorReportSortControls } from "./error-report-sort-controls";

const portfolios = [
  { id: "portfolio-2", code: "2", label: "2 - Matrices" },
  { id: "portfolio-X", code: "X", label: "X - Kwadraten" },
];
const noop = () => undefined;

function renderControls(sort: "date" | "portfolio", selectedPortfolio: string | null = null) {
  return renderToStaticMarkup(<ErrorReportSortControls sort={sort} selectedPortfolio={selectedPortfolio} portfolios={portfolios} onSort={noop} onPortfolioChange={noop} onReset={noop} />);
}

describe("ErrorReportSortControls", () => {
  it("defaults visually to date and shows the unfiltered portfolio placeholder", () => {
    const markup = renderControls("date");
    expect(markup).toMatch(/<button(?=[^>]*type="button")(?=[^>]*aria-pressed="true")[^>]*>/);
    expect(markup).toContain('<option value="" selected="">Filter op portfolio</option>');
    expect(markup).toContain('<option value="portfolio-2">2 - Matrices</option>');
    expect(markup).toContain('<option value="portfolio-X">X - Kwadraten</option>');
    expect(markup).toContain("lucide-calendar-arrow-up");
    expect(markup).toContain("lucide-list-sort-ascending");
    expect(markup).toContain("lucide-funnel-x");
    expect(markup).toContain('aria-label="Portfoliofilter wissen"');
  });

  it("marks portfolio sorting active after switching", () => {
    const markup = renderControls("portfolio", "portfolio-X");
    expect(markup).toContain('aria-pressed="false" class="secondary-button"');
    expect(markup).toContain('aria-pressed="true" class="primary-button"');
    expect(markup).toContain('<option value="portfolio-X" selected="">X - Kwadraten</option>');
  });

  it("connects the FunnelX button to the filter reset", () => {
    const onReset = vi.fn();
    const toolbar = ErrorReportSortControls({ sort: "portfolio", selectedPortfolio: "portfolio-X", portfolios, onSort: noop, onPortfolioChange: noop, onReset });
    const resetButton = Children.toArray(toolbar.props.children).find((child) => isValidElement<{ "aria-label"?: string }>(child) && child.props["aria-label"] === "Portfoliofilter wissen");
    if (!isValidElement<{ onClick?: () => void }>(resetButton)) throw new Error("Resetknop ontbreekt.");
    resetButton.props.onClick?.();
    expect(onReset).toHaveBeenCalledOnce();
  });
});
