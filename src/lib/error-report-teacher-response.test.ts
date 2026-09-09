import { describe, expect, it } from "vitest";

import { ERROR_REPORT_TEACHER_RESPONSE_MAX_LENGTH, errorReportTeacherResponseSchema } from "./error-report-teacher-response";

describe("errorReportTeacherResponseSchema", () => {
  it("trims outer whitespace while preserving multiline plain text", () => {
    expect(errorReportTeacherResponseSchema.parse("  Eerste regel\n  Tweede regel  ")).toBe("Eerste regel\n  Tweede regel");
  });

  it("normalizes whitespace-only input to null", () => {
    expect(errorReportTeacherResponseSchema.parse(" \n\t ")).toBeNull();
  });

  it("accepts 500 trimmed characters and rejects longer content", () => {
    expect(errorReportTeacherResponseSchema.parse(`  ${"A".repeat(ERROR_REPORT_TEACHER_RESPONSE_MAX_LENGTH)}  `)).toHaveLength(500);
    expect(errorReportTeacherResponseSchema.safeParse("A".repeat(ERROR_REPORT_TEACHER_RESPONSE_MAX_LENGTH + 1)).success).toBe(false);
  });

  it("rejects HTML and common Markdown formatting", () => {
    expect(errorReportTeacherResponseSchema.safeParse("<strong>Bedankt</strong>").success).toBe(false);
    expect(errorReportTeacherResponseSchema.safeParse("**Bedankt**").success).toBe(false);
    expect(errorReportTeacherResponseSchema.safeParse("[Bekijk stap 2](https://example.com)").success).toBe(false);
  });
});

