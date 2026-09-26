"use client";

import { CalendarArrowUp, FunnelX, ListSortAscending } from "lucide-react";

import { DEFAULT_COLLECTION_LABEL_SINGULAR } from "@/lib/collection-terminology";
import type { ErrorReportSort, PortfolioFilterOption } from "@/lib/error-report-sort";

export function ErrorReportSortControls({ sort, selectedPortfolio, portfolios, onSort, onPortfolioChange, onReset, collectionLabelSingular = DEFAULT_COLLECTION_LABEL_SINGULAR }: {
  sort: ErrorReportSort;
  selectedPortfolio: string | null;
  portfolios: PortfolioFilterOption[];
  onSort: (sort: ErrorReportSort) => void;
  onPortfolioChange: (portfolioId: string | null) => void;
  onReset: () => void;
  collectionLabelSingular?: string;
}) {
  return <div className="report-sort" role="group" aria-label="Meldingen sorteren en filteren">
    <button type="button" onClick={() => onSort("date")} aria-pressed={sort === "date"} className={sort === "date" ? "primary-button" : "secondary-button"}>
      <CalendarArrowUp size={17} aria-hidden />Sorteer op datum
    </button>
    <button type="button" onClick={() => onSort("portfolio")} aria-pressed={sort === "portfolio"} className={sort === "portfolio" ? "primary-button" : "secondary-button"}>
      <ListSortAscending size={17} aria-hidden />Sorteer op {collectionLabelSingular}
    </button>
    <label className="sr-only" htmlFor="error-report-portfolio-filter">{collectionLabelSingular}filter</label>
    <select id="error-report-portfolio-filter" value={selectedPortfolio ?? ""} onChange={(event) => onPortfolioChange(event.target.value || null)}>
      <option value="">Filter op {collectionLabelSingular}</option>
      {portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.label}</option>)}
    </select>
    <button type="button" className="icon-button" onClick={onReset} aria-label={`${collectionLabelSingular}filter wissen`} title={`${collectionLabelSingular}filter wissen`}>
      <FunnelX size={17} aria-hidden />
    </button>
  </div>;
}
