import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ErrorReportIssueDetail, GroupedErrorReportIssue } from "@/lib/repositories";

vi.mock("@/app/admin/actions", () => ({
  errorReportIssueNoteAction: vi.fn(),
  errorReportIssuePinAction: vi.fn(),
  errorReportIssueStatusAction: vi.fn(),
  toggleReportedExerciseVisibilityAction: vi.fn(),
}));

import { errorReportDocumentLabel, GroupedErrorReportCards, GroupedErrorReportInbox } from "./error-report-groups";

describe("grouped error report inbox", () => {
  it("renders one issue card and issue counter for ten underlying reports", () => {
    const current = issue({ id: "issue-main", reportCount: 10, pinned: true });
    const reports = Array.from({ length: 10 }, (_, index) => report(index));
    const markup = renderToStaticMarkup(<GroupedErrorReportInbox issues={[current]} reportsByIssue={{ "issue-main": reports }} spaceSlug="5wis" />);

    expect(markup.match(/class="report-card"/g)).toHaveLength(1);
    expect(markup).toContain("10 meldingen");
    expect(markup).toMatch(/PINNED[\s\S]*?<span>1<\/span>/);
    expect(markup).toMatch(/TO DO[\s\S]*?<span>0<\/span>/);
  });

  it("renders document and alternative labels without technical enum values", () => {
    expect(errorReportDocumentLabel("assignment")).toBe("Opgaven");
    expect(errorReportDocumentLabel("final_solutions")).toBe("Eindoplossingen");
    expect(errorReportDocumentLabel("hints")).toBe("Hints");

    const markup = renderToStaticMarkup(<GroupedErrorReportCards
      issues={[
        issue({ id: "assignment", documentKind: "assignment", variant: null }),
        issue({ id: "hints", documentKind: "hints", variant: null }),
        issue({ id: "alternative", variant: "alternative" }),
      ]}
      reportsByIssue={{}}
      spaceSlug="5wis"
    />);
    expect(markup).toContain("Opgaven - Oefening 5b");
    expect(markup).toContain("Hints - Oefening 5b");
    expect(markup).toContain("Eindoplossingen - Oefening 5b - Alternatieve uitwerking");
    expect(markup).not.toContain("final_solutions");
  });

  it("keeps unmatched issues usable without preview or visibility controls", () => {
    const unmatched = issue({
      id: "issue-unmatched",
      exerciseId: null,
      exerciseCode: "11",
      isMatchedExercise: false,
      sectionTitle: "Onbekende oefening",
      solutionConfiguredVisible: null,
      solutionStatus: null,
    });
    const markup = renderToStaticMarkup(<GroupedErrorReportCards issues={[unmatched]} reportsByIssue={{}} spaceSlug="5wis" />);

    expect(markup).toContain("Oefening 11");
    expect(markup).toContain("Niet automatisch gekoppeld");
    expect(markup).not.toContain("/oefening/");
    expect(markup).not.toContain("Zichtbaarheid wisselen");
  });

  it("offers preview and visibility only for a matched final-solutions issue", () => {
    const matched = issue({ id: "issue-matched" });
    const assignment = issue({ id: "issue-assignment", documentKind: "assignment", variant: null });
    const markup = renderToStaticMarkup(<GroupedErrorReportCards issues={[matched, assignment]} reportsByIssue={{}} spaceSlug="5 wis" />);

    expect(markup).toContain("/admin/5%20wis/oefening/exercise-5b");
    expect(markup.match(/aria-label="Zichtbaarheid wisselen"/g)).toHaveLength(1);
  });

  it("uses issue-level actions and shows no report-level or delete controls", () => {
    const markup = renderToStaticMarkup(<GroupedErrorReportCards issues={[issue({ id: "issue-actions" })]} reportsByIssue={{}} spaceSlug="5wis" />);

    expect(markup).toContain('name="issueId" value="issue-actions"');
    expect(markup).toContain('id="report-note-issue-actions"');
    expect(markup).not.toContain('name="id" value="issue-actions"');
    expect(markup).not.toContain("Foutmelding verwijderen");
  });

  it("keeps details collapsed and renders reports newest-first with reporter identity", () => {
    const reports = [
      report(2, { message: "Nieuwste melding", reporterDisplayName: "Karel Leerling" }),
      report(1, { message: "Oudere melding", reporterName: "Legacy naam" }),
    ];
    const markup = renderToStaticMarkup(<GroupedErrorReportCards issues={[issue({ id: "issue-details", reportCount: 2 })]} reportsByIssue={{ "issue-details": reports }} spaceSlug="5wis" />);

    expect(markup).toContain("<details class=\"issue-report-details\">");
    expect(markup.indexOf("Nieuwste melding")).toBeLessThan(markup.indexOf("Oudere melding"));
    expect(markup).toContain("Gemeld door: Karel Leerling");
    expect(markup).toContain("Gemeld door: Legacy naam");
    expect(markup).not.toContain("Legacy reportnotitie");
  });

  it("places TODO, pinned and DONE issues in their issue-level sections", () => {
    const markup = renderToStaticMarkup(<GroupedErrorReportInbox
      issues={[
        issue({ id: "todo", portfolioTitle: "Todo portfolio" }),
        issue({ id: "pinned", portfolioTitle: "Pinned portfolio", pinned: true }),
        issue({ id: "done", portfolioTitle: "Done portfolio", status: "DONE" }),
      ]}
      reportsByIssue={{}}
      spaceSlug="5wis"
    />);

    expect(markup).toMatch(/PINNED[\s\S]*Pinned portfolio/);
    expect(markup).toMatch(/TO DO[\s\S]*Todo portfolio/);
    expect(markup).toMatch(/DONE[\s\S]*Done portfolio/);
  });
});

function issue(overrides: Partial<GroupedErrorReportIssue> = {}): GroupedErrorReportIssue {
  return {
    id: "issue-main",
    threadId: "thread-main",
    learningSpaceId: "space-5",
    portfolioId: "portfolio-1",
    portfolioCode: "1",
    portfolioTitle: "Veeltermfuncties",
    sectionTitle: "Eerste deel",
    exerciseId: "exercise-5b",
    exerciseCode: "5b",
    isMatchedExercise: true,
    documentKind: "final_solutions",
    variant: "standard",
    status: "TODO",
    pinned: false,
    adminNote: "Issue-notitie",
    createdAt: "2026-09-08T10:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-09-08T11:00:00.000Z",
    reportCount: 1,
    reporterCount: 1,
    latestReportAt: "2026-09-08T11:00:00.000Z",
    hasLegacyAnonymousReports: false,
    solutionConfiguredVisible: true,
    solutionStatus: { configuredVisibility: "visible", state: "visible", reason: null, effectiveFrom: null, effectiveUntil: null },
    ...overrides,
  };
}

function report(index: number, overrides: Partial<ErrorReportIssueDetail> = {}): ErrorReportIssueDetail {
  return {
    id: `report-${index}`,
    issueId: "issue-main",
    reporterUserId: null,
    reporterName: null,
    reporterDisplayName: null,
    message: `Melding ${index}`,
    createdAt: `2026-09-08T10:${String(index).padStart(2, "0")}:00.000Z`,
    ...overrides,
  };
}
