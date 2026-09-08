import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorReportForm, SOLUTION_ERROR_REPORT_DOCUMENT_KIND } from "./error-report-form";

describe("ErrorReportForm", () => {
  it("starts as an accessible collapsed disclosure", () => {
    const markup = renderToStaticMarkup(<ErrorReportForm exerciseId="exercise-1" variants={["standard"]} />);

    expect(markup).toContain("Foutje gezien? Meld het.");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('name="reporterName"');
  });

  it("uses the authenticated v2 flow without asking for a reporter name", () => {
    const markup = renderToStaticMarkup(<ErrorReportForm exerciseId="exercise-1" variants={["standard"]} initiallyOpen />);

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).not.toContain('name="reporterName"');
    expect(markup).toContain('name="variant"');
    expect(markup).toContain("Wat heb je opgemerkt?");
    expect(SOLUTION_ERROR_REPORT_DOCUMENT_KIND).toBe("exercise_solution");
  });
});
