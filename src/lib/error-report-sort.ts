import { comparePortfolioIds, isValidPortfolioId } from "@/lib/parser";

export type ErrorReportSort = "date" | "portfolio";

export interface ErrorReportViewState {
  sortMode: ErrorReportSort;
  selectedPortfolio: string | null;
}

export type ErrorReportViewAction =
  | { type: "sort"; sortMode: ErrorReportSort }
  | { type: "filter"; portfolioId: string | null }
  | { type: "reset-filter" };

export const initialErrorReportViewState: ErrorReportViewState = {
  sortMode: "date",
  selectedPortfolio: null,
};

interface SortableErrorReport {
  portfolioId: string;
  portfolioCode: string;
  portfolioTitle: string;
  createdAt: string;
  status: "TODO" | "DONE";
  pinned: boolean;
}

export interface PortfolioFilterOption {
  id: string;
  code: string;
  label: string;
}

export function errorReportViewReducer(state: ErrorReportViewState, action: ErrorReportViewAction): ErrorReportViewState {
  if (action.type === "sort") return { ...state, sortMode: action.sortMode };
  if (action.type === "filter") return { ...state, selectedPortfolio: action.portfolioId };
  return { ...state, selectedPortfolio: null };
}

export function sortErrorReports<T extends SortableErrorReport>(reports: readonly T[], sort: ErrorReportSort): T[] {
  return [...reports].sort((left, right) => {
    if (sort === "portfolio") {
      const leftHasValidCode = isValidPortfolioId(left.portfolioCode);
      const rightHasValidCode = isValidPortfolioId(right.portfolioCode);
      if (leftHasValidCode !== rightHasValidCode) return leftHasValidCode ? -1 : 1;
      if (leftHasValidCode) {
        const portfolioOrder = comparePortfolioIds(left.portfolioCode, right.portfolioCode);
        if (portfolioOrder !== 0) return portfolioOrder;
      }
    }
    return compareCreatedAtDescending(left.createdAt, right.createdAt);
  });
}

export function openErrorReportGroups<T extends SortableErrorReport>(reports: readonly T[], sort: ErrorReportSort, selectedPortfolio: string | null) {
  const visible = reports.filter((report) => report.status === "TODO" && (!selectedPortfolio || report.portfolioId === selectedPortfolio));
  return {
    pinned: sortErrorReports(visible.filter((report) => report.pinned), sort),
    todo: sortErrorReports(visible.filter((report) => !report.pinned), sort),
  };
}

export function portfolioFilterOptions(reports: readonly SortableErrorReport[]): PortfolioFilterOption[] {
  const portfolios = new Map<string, PortfolioFilterOption>();
  for (const report of reports) {
    if (!report.portfolioId || !isValidPortfolioId(report.portfolioCode) || !report.portfolioTitle.trim()) continue;
    if (!portfolios.has(report.portfolioId)) {
      portfolios.set(report.portfolioId, {
        id: report.portfolioId,
        code: report.portfolioCode,
        label: `${report.portfolioCode} - ${truncatePortfolioTitle(report.portfolioTitle)}`,
      });
    }
  }
  return [...portfolios.values()].sort((left, right) => {
    const codeOrder = comparePortfolioIds(left.code, right.code);
    return codeOrder !== 0 ? codeOrder : left.id.localeCompare(right.id);
  });
}

function truncatePortfolioTitle(title: string): string {
  const normalized = title.trim();
  return normalized.length > 23 ? `${normalized.slice(0, 20).trimEnd()}...` : normalized;
}

function compareCreatedAtDescending(left: string, right: string): number {
  const leftTimestamp = timestampOrOldest(left);
  const rightTimestamp = timestampOrOldest(right);
  if (leftTimestamp === rightTimestamp) return 0;
  return rightTimestamp - leftTimestamp;
}

function timestampOrOldest(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}
