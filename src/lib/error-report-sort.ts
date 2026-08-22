import { comparePortfolioIds, isValidPortfolioId } from "@/lib/parser";

export type ErrorReportSort = "date" | "portfolio";

interface SortableErrorReport {
  portfolioCode: string;
  createdAt: string;
}

interface GroupableErrorReport extends SortableErrorReport {
  status: "TODO" | "DONE";
  pinned: boolean;
}

export function errorReportSortFromValue(value: string | undefined): ErrorReportSort {
  return value === "portfolio" ? "portfolio" : "date";
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

export function groupErrorReports<T extends GroupableErrorReport>(reports: readonly T[], sort: ErrorReportSort) {
  return {
    pinned: sortErrorReports(reports.filter((report) => report.status === "TODO" && report.pinned), sort),
    todo: sortErrorReports(reports.filter((report) => report.status === "TODO" && !report.pinned), sort),
    done: reports.filter((report) => report.status === "DONE"),
  };
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
