import { describe, expect, it } from "vitest";

import { errorReportViewReducer, initialErrorReportViewState, openErrorReportGroups, portfolioFilterOptions, sortErrorReports } from "./error-report-sort";

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
