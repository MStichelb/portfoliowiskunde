import { describe, expect, it } from "vitest";

import { errorReportNoteViewReducer, shouldCloseErrorReportNoteEditor } from "./error-report-note-form";

describe("error report note view state", () => {
  it("opens the editor from the compact state", () => {
    expect(errorReportNoteViewReducer(false, { type: "edit" })).toBe(true);
  });

  it("returns to the compact state after closing or saving", () => {
    expect(errorReportNoteViewReducer(true, { type: "close" })).toBe(false);
  });

  it("closes only after a newly confirmed successful save", () => {
    expect(shouldCloseErrorReportNoteEditor(0, 1)).toBe(true);
    expect(shouldCloseErrorReportNoteEditor(2, 3)).toBe(true);
    expect(shouldCloseErrorReportNoteEditor(2, 2)).toBe(false);
    expect(shouldCloseErrorReportNoteEditor(2, 1)).toBe(false);
  });
});
