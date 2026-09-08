import { describe, expect, it } from "vitest";

import { errorReportNoteViewReducer } from "./error-report-note-form";

describe("error report note view state", () => {
  it("opens the editor from the compact state", () => {
    expect(errorReportNoteViewReducer(false, { type: "edit" })).toBe(true);
  });

  it("returns to the compact state after closing or saving", () => {
    expect(errorReportNoteViewReducer(true, { type: "close" })).toBe(false);
  });
});
