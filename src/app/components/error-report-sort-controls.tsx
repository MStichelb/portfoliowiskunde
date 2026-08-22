"use client";

import { CalendarArrowUp, FunnelX, ListSortAscending } from "lucide-react";

import type { ErrorReportSort, PortfolioFilterOption } from "@/lib/error-report-sort";

export function ErrorReportSortControls({ sort, selectedPortfolio, portfolios, onSort, onPortfolioChange, onReset }: {
  sort: ErrorReportSort;
  selectedPortfolio: string | null;
  portfolios: PortfolioFilterOption[];
  onSort: (sort: ErrorReportSort) => void;
  onPortfolioChange: (portfolioId: string | null) => void;
  onReset: () => void;
}) {
  return <div className="report-sort" role="group" aria-label="Meldingen sorteren en filteren">
    <button type="button" onClick={() => onSort("date")} aria-pressed={sort === "date"} className={sort === "date" ? "primary-button" : "secondary-button"}>
      <CalendarArrowUp size={17} aria-hidden />Sorteer op datum
    </button>
    <button type="button" onClick={() => onSort("portfolio")} aria-pressed={sort === "portfolio"} className={sort === "portfolio" ? "primary-button" : "secondary-button"}>
      <ListSortAscending size={17} aria-hidden />Sorteer op portfolio
    </button>
    <label className="sr-only" htmlFor="error-report-portfolio-filter">Portfoliofilter</label>
    <select id="error-report-portfolio-filter" value={selectedPortfolio ?? ""} onChange={(event) => onPortfolioChange(event.target.value || null)}>
      <option value="">Filter op portfolio</option>
      {portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.label}</option>)}
    </select>
    <button type="button" className="icon-button" onClick={onReset} aria-label="Portfoliofilter wissen" title="Portfoliofilter wissen">
      <FunnelX size={17} aria-hidden />
    </button>
  </div>;
}
