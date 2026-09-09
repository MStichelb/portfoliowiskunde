import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/actions", () => ({
  deleteErrorReportTeacherResponseAction: vi.fn(),
  saveErrorReportTeacherResponseAction: vi.fn(),
}));

import { ErrorReportResponseButton } from "./error-report-response-button";

describe("ErrorReportResponseButton", () => {
  it("renders only an accessible neutral icon in the closed report details", () => {
    const markup = renderToStaticMarkup(<ErrorReportResponseButton reportId="report-1" exerciseCode="12a" locationLabel="Hints" reporterLabel="Ada" teacherResponse={null} />);

    expect(markup).toContain('aria-label="Bericht aan leerling"');
    expect(markup).toContain("lucide-message-square");
    expect(markup).not.toContain("has-response");
    expect(markup).not.toContain('role="dialog"');
  });

  it("indicates an existing response without previewing its text on the report card", () => {
    const markup = renderToStaticMarkup(<ErrorReportResponseButton reportId="report-1" exerciseCode="12a" locationLabel="Hints" reporterLabel="Ada" teacherResponse="Verborgen reactie" />);

    expect(markup).toContain("report-response-trigger has-response");
    expect(markup).toContain('title="Bericht aan leerling toegevoegd"');
    expect(markup).toContain("lucide-message-square-text");
    expect(markup).not.toContain("Verborgen reactie");
  });

  it("opens a compact labelled editor with context and response removal", () => {
    const markup = renderToStaticMarkup(<ErrorReportResponseButton reportId="report-1" exerciseCode="12a" locationLabel="Hints" reporterLabel="Ada" teacherResponse={"Eerste regel\nTweede regel"} initiallyOpen />);

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Bericht aan leerling");
    expect(markup).toContain("Oefening 12a · Hints · Ada");
    expect(markup).toContain('name="teacherResponse"');
    expect(markup).toContain('maxLength="500"');
    expect(markup).toContain("Eerste regel\nTweede regel");
    expect(markup).toContain("Dit bericht wordt zichtbaar voor de leerling zodra de melding is afgewerkt.");
    expect(markup).toContain("Opslaan");
    expect(markup).toContain("Opslaan &amp; markeren als afgewerkt");
    expect(markup).toContain('name="markHandled"');
    expect(markup).toContain('value="true"');
    expect(markup).toContain("Bericht verwijderen");
  });
});
