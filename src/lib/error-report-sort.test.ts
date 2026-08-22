import { describe, expect, it } from "vitest";

import { errorReportSortFromValue, groupErrorReports, sortErrorReports } from "./error-report-sort";

type Report = {
  id: string;
  portfolioCode: string;
  createdAt: string;
  status: "TODO" | "DONE";
  pinned: boolean;
};

function report(id: string, portfolioCode: string, day: number, options: Partial<Pick<Report, "status" | "pinned">> = {}): Report {
  return {
    id,
    portfolioCode,
    createdAt: `2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    status: options.status ?? "TODO",
    pinned: options.pinned ?? false,
  };
}

describe("error report sorting", () => {
  it("uses date sorting by default and orders newest first", () => {
    expect(errorReportSortFromValue(undefined)).toBe("date");
    expect(errorReportSortFromValue("unexpected")).toBe("date");
    expect(sortErrorReports([report("old", "1", 1), report("new", "2", 3), report("middle", "3", 2)], "date").map(({ id }) => id)).toEqual(["new", "middle", "old"]);
  });

  it("sorts naturally by the central portfolio ID rules", () => {
    const reports = ["12", "2B", "X", "10", "2", "A", "2A"].map((code, index) => report(code, code, index + 1));
    expect(sortErrorReports(reports, "portfolio").map(({ portfolioCode }) => portfolioCode)).toEqual(["2", "2A", "2B", "10", "12", "A", "X"]);
  });

  it("orders reports from the same portfolio newest first", () => {
    expect(sortErrorReports([report("old", "2A", 2), report("new", "2A", 8)], "portfolio").map(({ id }) => id)).toEqual(["new", "old"]);
  });

  it("keeps PINNED and TO DO separate while leaving DONE in its existing order", () => {
    const grouped = groupErrorReports([
      report("todo-old", "1", 1),
      report("pinned-new", "2", 4, { pinned: true }),
      report("done-first", "3", 2, { status: "DONE" }),
      report("todo-new", "4", 3),
      report("pinned-old", "5", 2, { pinned: true }),
      report("done-second", "6", 1, { status: "DONE" }),
    ], "date");
    expect(grouped.pinned.map(({ id }) => id)).toEqual(["pinned-new", "pinned-old"]);
    expect(grouped.todo.map(({ id }) => id)).toEqual(["todo-new", "todo-old"]);
    expect(grouped.done.map(({ id }) => id)).toEqual(["done-first", "done-second"]);
  });

  it("places invalid portfolio IDs last and uses date as their fallback", () => {
    const sorted = sortErrorReports([
      report("invalid-old", "geen-id", 2),
      report("valid", "X", 1),
      report("invalid-new", "?", 9),
    ], "portfolio");
    expect(sorted.map(({ id }) => id)).toEqual(["valid", "invalid-new", "invalid-old"]);
  });
});
