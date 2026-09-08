import { describe, expect, it } from "vitest";

import {
  errorReportViewReducer,
  filterGroupedErrorReportIssues,
  groupedErrorReportPortfolioFilterOptions,
  groupedErrorReportThreadPortfolioFilterOptions,
  initialErrorReportViewState,
  openErrorReportGroups,
  openGroupedErrorReportIssueGroups,
  openGroupedErrorReportThreadGroups,
  portfolioFilterOptions,
  sortErrorReports,
  sortGroupedErrorReportIssues,
  sortGroupedErrorReportThreads,
  filterGroupedErrorReportThreads,
  type SortableGroupedErrorReportIssue,
} from "./error-report-sort";

type Report = {
  id: string;
  portfolioId: string;
  portfolioCode: string;
  portfolioTitle: string;
  createdAt: string;
  status: "TODO" | "DONE";
  pinned: boolean;
};

function report(id: string, portfolioCode: string, day: number, options: Partial<Pick<Report, "portfolioId" | "portfolioTitle" | "status" | "pinned">> = {}): Report {
  return {
    id,
    portfolioId: options.portfolioId ?? `portfolio-${portfolioCode}`,
    portfolioCode,
    portfolioTitle: options.portfolioTitle ?? `Titel ${portfolioCode}`,
    createdAt: `2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    status: options.status ?? "TODO",
    pinned: options.pinned ?? false,
  };
}

type Issue = SortableGroupedErrorReportIssue & { id: string; exerciseCode: string };

function issue(id: string, portfolioCode: string, updatedDay: number, options: Partial<Pick<Issue, "portfolioId" | "portfolioTitle" | "status" | "pinned" | "exerciseId" | "latestReportAt">> = {}): Issue {
  return {
    id,
    portfolioId: options.portfolioId ?? `portfolio-${portfolioCode}`,
    portfolioCode,
    portfolioTitle: options.portfolioTitle ?? `Titel ${portfolioCode}`,
    exerciseId: options.exerciseId === undefined ? `exercise-${id}` : options.exerciseId,
    exerciseCode: "11",
    latestReportAt: options.latestReportAt ?? null,
    updatedAt: `2026-08-${String(updatedDay).padStart(2, "0")}T12:00:00.000Z`,
    status: options.status ?? "TODO",
    pinned: options.pinned ?? false,
  };
}

describe("error report sorting", () => {
  it("uses date sorting by default and orders newest first", () => {
    expect(initialErrorReportViewState).toEqual({ sortMode: "date", selectedPortfolio: null });
    expect(sortErrorReports([report("old", "1", 1), report("new", "2", 3), report("middle", "3", 2)], "date").map(({ id }) => id)).toEqual(["new", "middle", "old"]);
  });

  it("sorts naturally by the central portfolio ID rules", () => {
    const reports = ["12", "2B", "X", "10", "2", "A", "2A"].map((code, index) => report(code, code, index + 1));
    expect(sortErrorReports(reports, "portfolio").map(({ portfolioCode }) => portfolioCode)).toEqual(["2", "2A", "2B", "10", "12", "A", "X"]);
  });

  it("orders reports from the same portfolio newest first", () => {
    expect(sortErrorReports([report("old", "2A", 2), report("new", "2A", 8)], "portfolio").map(({ id }) => id)).toEqual(["new", "old"]);
  });

  it("keeps PINNED and TO DO separate", () => {
    const grouped = openErrorReportGroups([
      report("todo-old", "1", 1),
      report("pinned-new", "2", 4, { pinned: true }),
      report("done-first", "3", 2, { status: "DONE" }),
      report("todo-new", "4", 3),
      report("pinned-old", "5", 2, { pinned: true }),
    ], "date", null);
    expect(grouped.pinned.map(({ id }) => id)).toEqual(["pinned-new", "pinned-old"]);
    expect(grouped.todo.map(({ id }) => id)).toEqual(["todo-new", "todo-old"]);
  });

  it("places invalid portfolio IDs last and uses date as their fallback", () => {
    const sorted = sortErrorReports([
      report("invalid-old", "geen-id", 2),
      report("valid", "X", 1),
      report("invalid-new", "?", 9),
    ], "portfolio");
    expect(sorted.map(({ id }) => id)).toEqual(["valid", "invalid-new", "invalid-old"]);
  });

  it("builds unique, naturally sorted portfolio options and skips unusable portfolios", () => {
    const options = portfolioFilterOptions([
      report("twelve", "12", 1, { portfolioTitle: "Een heel lange portfoliotitel" }),
      report("two", "2", 2),
      report("two-again", "2", 3),
      report("two-a", "2A", 4),
      report("invalid", "geen-id", 5),
      report("missing-title", "X", 6, { portfolioTitle: "" }),
    ]);
    expect(options.map(({ code }) => code)).toEqual(["2", "2A", "12"]);
    expect(options).toHaveLength(3);
    expect(options.at(-1)?.label).toBe("12 - Een heel lange portf...");
  });

  it("filters TO DO and PINNED independently before applying date sorting", () => {
    const reports = [
      report("five-todo-old", "5", 1),
      report("six-todo", "6", 9),
      report("five-pinned-new", "5", 8, { pinned: true }),
      report("five-todo-new", "5", 7),
      report("six-pinned", "6", 6, { pinned: true }),
    ];
    const grouped = openErrorReportGroups(reports, "date", "portfolio-5");
    expect(grouped.todo.map(({ id }) => id)).toEqual(["five-todo-new", "five-todo-old"]);
    expect(grouped.pinned.map(({ id }) => id)).toEqual(["five-pinned-new"]);
  });

  it("keeps the active portfolio sorting after filtering", () => {
    const reports = [report("old", "X", 1), report("other", "2", 9), report("new", "X", 8)];
    expect(openErrorReportGroups(reports, "portfolio", "portfolio-X").todo.map(({ id }) => id)).toEqual(["new", "old"]);
  });

  it("shows every report without a filter, including reports with invalid portfolio metadata", () => {
    const reports = [report("valid", "5", 1), report("invalid", "geen-id", 2, { portfolioId: "", portfolioTitle: "" })];
    expect(openErrorReportGroups(reports, "date", null).todo.map(({ id }) => id)).toEqual(["invalid", "valid"]);
  });

  it("resets only the portfolio filter and preserves sort mode", () => {
    const filtered = errorReportViewReducer(initialErrorReportViewState, { type: "filter", portfolioId: "portfolio-5" });
    const sorted = errorReportViewReducer(filtered, { type: "sort", sortMode: "portfolio" });
    expect(errorReportViewReducer(sorted, { type: "reset-filter" })).toEqual({ sortMode: "portfolio", selectedPortfolio: null });
  });
});

describe("grouped error report issue sorting", () => {
  it("sorts by latest report date and falls back to updatedAt", () => {
    const issues = [
      issue("updated-new", "1", 9),
      issue("report-newest", "2", 1, { latestReportAt: "2026-08-12T12:00:00.000Z" }),
      issue("report-middle", "3", 2, { latestReportAt: "2026-08-10T12:00:00.000Z" }),
    ];

    expect(sortGroupedErrorReportIssues(issues, "date").map(({ id }) => id)).toEqual(["report-newest", "report-middle", "updated-new"]);
  });

  it("uses the existing natural portfolio order for grouped issues", () => {
    const issues = ["12", "2B", "X", "10", "2", "A", "2A"].map((code, index) => issue(code, code, index + 1));
    expect(sortGroupedErrorReportIssues(issues, "portfolio").map(({ portfolioCode }) => portfolioCode)).toEqual(["2", "2A", "2B", "10", "12", "A", "X"]);
  });

  it("filters by portfolio and keeps unmatched exercises", () => {
    const unmatched = issue("unmatched", "5", 4, { exerciseId: null });
    const issues = [unmatched, issue("other", "6", 5)];

    expect(filterGroupedErrorReportIssues(issues, "portfolio-5")).toEqual([unmatched]);
    expect(sortGroupedErrorReportIssues([unmatched], "date")).toEqual([unmatched]);
  });

  it("splits pinned and unpinned TODO issues and excludes DONE", () => {
    const groups = openGroupedErrorReportIssueGroups([
      issue("todo", "1", 2),
      issue("pinned", "1", 3, { pinned: true }),
      issue("done", "1", 4, { status: "DONE", pinned: true }),
      issue("other-portfolio", "2", 5),
    ], "date", "portfolio-1");

    expect(groups.pinned.map(({ id }) => id)).toEqual(["pinned"]);
    expect(groups.todo.map(({ id }) => id)).toEqual(["todo"]);
  });

  it("builds one portfolio option per portfolio with the existing ordering", () => {
    const options = groupedErrorReportPortfolioFilterOptions([
      issue("two-old", "2", 1),
      issue("two-new", "2", 2),
      issue("twelve", "12", 3),
      issue("x", "X", 4),
    ]);

    expect(options.map(({ code }) => code)).toEqual(["2", "12", "X"]);
    expect(options).toHaveLength(3);
  });
});

describe("grouped error report thread sorting", () => {
  it("uses latest report recency with updatedAt fallback", () => {
    const threads = [
      issue("fallback", "1", 9),
      issue("latest", "2", 1, { latestReportAt: "2026-08-12T12:00:00.000Z" }),
    ];
    expect(sortGroupedErrorReportThreads(threads, "date").map(({ id }) => id)).toEqual(["latest", "fallback"]);
  });

  it("filters, groups and builds portfolio options at thread level", () => {
    const threads = [
      issue("todo", "2", 2),
      issue("pinned", "2", 3, { pinned: true }),
      issue("done", "2", 4, { status: "DONE" }),
      issue("other", "12", 5),
    ];
    expect(filterGroupedErrorReportThreads(threads, "portfolio-2")).toHaveLength(3);
    const groups = openGroupedErrorReportThreadGroups(threads, "date", "portfolio-2");
    expect(groups.pinned.map(({ id }) => id)).toEqual(["pinned"]);
    expect(groups.todo.map(({ id }) => id)).toEqual(["todo"]);
    expect(groupedErrorReportThreadPortfolioFilterOptions(threads).map(({ code }) => code)).toEqual(["2", "12"]);
  });
});
