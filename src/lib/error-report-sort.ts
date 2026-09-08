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

interface SortableErrorReportLocation {
  portfolioId: string;
  portfolioCode: string;
  portfolioTitle: string;
  status: "TODO" | "DONE";
  pinned: boolean;
}

interface SortableErrorReport extends SortableErrorReportLocation {
  createdAt: string;
}

export interface SortableGroupedErrorReportIssue extends SortableErrorReportLocation {
  exerciseId: string | null;
  latestReportAt: string | null;
  updatedAt: string;
}

export type SortableGroupedErrorReportThread = SortableGroupedErrorReportIssue;

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
  return sortErrorReportItems(reports, sort, (report) => report.createdAt);
}

export function sortGroupedErrorReportIssues<T extends SortableGroupedErrorReportIssue>(issues: readonly T[], sort: ErrorReportSort): T[] {
  return sortErrorReportItems(issues, sort, groupedIssueActivityDate);
}

export function filterGroupedErrorReportIssues<T extends SortableGroupedErrorReportIssue>(issues: readonly T[], selectedPortfolio: string | null): T[] {
  return issues.filter((issue) => !selectedPortfolio || issue.portfolioId === selectedPortfolio);
}

export function openGroupedErrorReportIssueGroups<T extends SortableGroupedErrorReportIssue>(issues: readonly T[], sort: ErrorReportSort, selectedPortfolio: string | null) {
  const visible = filterGroupedErrorReportIssues(issues, selectedPortfolio).filter((issue) => issue.status === "TODO");
  return {
    pinned: sortGroupedErrorReportIssues(visible.filter((issue) => issue.pinned), sort),
    todo: sortGroupedErrorReportIssues(visible.filter((issue) => !issue.pinned), sort),
  };
}

export function groupedErrorReportPortfolioFilterOptions(issues: readonly SortableGroupedErrorReportIssue[]): PortfolioFilterOption[] {
  return portfolioFilterOptions(issues);
}

export function sortGroupedErrorReportThreads<T extends SortableGroupedErrorReportThread>(threads: readonly T[], sort: ErrorReportSort): T[] {
  return sortErrorReportItems(threads, sort, groupedIssueActivityDate);
}

export function filterGroupedErrorReportThreads<T extends SortableGroupedErrorReportThread>(threads: readonly T[], selectedPortfolio: string | null): T[] {
  return threads.filter((thread) => !selectedPortfolio || thread.portfolioId === selectedPortfolio);
}

export function openGroupedErrorReportThreadGroups<T extends SortableGroupedErrorReportThread>(threads: readonly T[], sort: ErrorReportSort, selectedPortfolio: string | null) {
  const visible = filterGroupedErrorReportThreads(threads, selectedPortfolio).filter((thread) => thread.status === "TODO");
  return {
    pinned: sortGroupedErrorReportThreads(visible.filter((thread) => thread.pinned), sort),
    todo: sortGroupedErrorReportThreads(visible.filter((thread) => !thread.pinned), sort),
  };
}

export function groupedErrorReportThreadPortfolioFilterOptions(threads: readonly SortableGroupedErrorReportThread[]): PortfolioFilterOption[] {
  return portfolioFilterOptions(threads);
}

function sortErrorReportItems<T extends SortableErrorReportLocation>(items: readonly T[], sort: ErrorReportSort, activityDate: (item: T) => string): T[] {
  return [...items].sort((left, right) => {
    if (sort === "portfolio") {
      const leftHasValidCode = isValidPortfolioId(left.portfolioCode);
      const rightHasValidCode = isValidPortfolioId(right.portfolioCode);
      if (leftHasValidCode !== rightHasValidCode) return leftHasValidCode ? -1 : 1;
      if (leftHasValidCode) {
        const portfolioOrder = comparePortfolioIds(left.portfolioCode, right.portfolioCode);
        if (portfolioOrder !== 0) return portfolioOrder;
      }
    }
    return compareDateDescending(activityDate(left), activityDate(right));
  });
}

export function openErrorReportGroups<T extends SortableErrorReport>(reports: readonly T[], sort: ErrorReportSort, selectedPortfolio: string | null) {
  const visible = reports.filter((report) => report.status === "TODO" && (!selectedPortfolio || report.portfolioId === selectedPortfolio));
  return {
    pinned: sortErrorReports(visible.filter((report) => report.pinned), sort),
    todo: sortErrorReports(visible.filter((report) => !report.pinned), sort),
  };
}

export function portfolioFilterOptions(reports: readonly SortableErrorReportLocation[]): PortfolioFilterOption[] {
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

// Grouped recency follows the latest report, falling back to the issue mutation time when no report date exists.
function groupedIssueActivityDate(issue: SortableGroupedErrorReportIssue): string {
  return issue.latestReportAt ?? issue.updatedAt;
}

function compareDateDescending(left: string, right: string): number {
  const leftTimestamp = timestampOrOldest(left);
  const rightTimestamp = timestampOrOldest(right);
  if (leftTimestamp === rightTimestamp) return 0;
  return rightTimestamp - leftTimestamp;
}

function timestampOrOldest(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}
