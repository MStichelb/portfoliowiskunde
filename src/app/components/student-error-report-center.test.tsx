import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StudentErrorReport } from "@/lib/student-error-reports";

import { StudentErrorReportCenter } from "./student-error-report-center";

describe("StudentErrorReportCenter", () => {
  it("renders a calm empty state", () => {
    expect(renderToStaticMarkup(<StudentErrorReportCenter reports={[]} />)).toContain("Je hebt momenteel geen openstaande of recent afgewerkte meldingen.");
  });

  it("shows matched and unmatched exercise context without technical or admin data", () => {
    const markup = renderToStaticMarkup(<StudentErrorReportCenter reports={[
      report({ reportId: "technical-report-id", exerciseCode: "12a", isMatchedExercise: true }),
      report({ reportId: "unmatched-id", exerciseCode: "17b", isMatchedExercise: false, locationLabel: "Opgaven" }),
    ]} />);

    expect(markup).toContain("Oefening 12a · Uitwerking");
    expect(markup).toContain("Oefening 17b · Opgaven");
    expect(markup).not.toContain("technical-report-id");
    expect(markup).not.toContain("unmatched-id");
    expect(markup).not.toContain("adminnotitie");
    expect(markup).not.toContain("thread-");
    expect(markup).not.toContain("href=");
  });

  it("derives clear report status and hides a response until the report is handled", () => {
    const markup = renderToStaticMarkup(<StudentErrorReportCenter reports={[
      report({ reportId: "open", status: "IN_PROGRESS", handledAt: null, teacherResponse: "Nog verborgen", createdAt: "2026-09-09T08:42:00.000Z" }),
      report({ reportId: "done", status: "HANDLED", handledAt: "2026-09-10T08:42:00.000Z", teacherResponse: "Eerste regel\nTweede regel" }),
    ]} />);

    expect(markup).toContain("In behandeling");
    expect(markup).toContain("Gemeld: 9 sep 2026, 10:42");
    expect(markup).toContain("Afgewerkt");
    expect(markup).toContain("10 sep 2026, 10:42");
    expect(markup).toContain("Reactie van je leraar");
    expect(markup).toContain("Eerste regel\nTweede regel");
    expect(markup).not.toContain("Nog verborgen");
  });
});

function report(overrides: Partial<StudentErrorReport> = {}): StudentErrorReport {
  return {
    reportId: "report-1",
    createdAt: "2026-09-09T08:42:00.000Z",
    handledAt: null,
    teacherResponse: null,
    message: "Volgens mij ontbreekt hier een minteken.",
    status: "IN_PROGRESS",
    exerciseCode: "12a",
    isMatchedExercise: true,
    portfolioCode: "1",
    portfolioTitle: "Veeltermfuncties",
    learningSpaceName: "6de jaar",
    locationLabel: "Uitwerking",
    ...overrides,
  };
}
