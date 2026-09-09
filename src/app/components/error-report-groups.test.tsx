import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ErrorReportIssueDetail, ErrorReportThreadIssueDetail, GroupedErrorReportThread } from "@/lib/repositories";

vi.mock("@/app/admin/actions", () => ({
  deleteErrorReportAction: vi.fn(),
  deleteOldDoneErrorThreadsAction: vi.fn(),
  deleteExerciseNoteAction: vi.fn(),
  deleteErrorReportTeacherResponseAction: vi.fn(),
  errorReportStatusAction: vi.fn(),
  errorReportThreadNoteAction: vi.fn(),
  errorReportThreadPinAction: vi.fn(),
  errorReportThreadStatusAction: vi.fn(),
  saveErrorReportTeacherResponseAction: vi.fn(),
  saveExerciseNoteAction: vi.fn(),
  toggleReportedExerciseVisibilityAction: vi.fn(),
}));

import {
  errorReportDeleteConfirmText,
  errorReportDocumentLabel,
  errorReportLocationLabel,
  GroupedErrorReportThreadCards,
  GroupedErrorReportThreadInbox,
  isErrorReportTreated,
} from "./error-report-groups";

describe("grouped error report thread inbox", () => {
  it("renders one card with total and per-location report counts", () => {
    const current = thread({ reportCount: 6 });
    const issues = [
      issue({ issueId: "assignment", documentKind: "assignment", variant: null, reportCount: 2 }),
      issue({ issueId: "final", documentKind: "final_solutions", variant: "standard", reportCount: 1 }),
      issue({ issueId: "solution", documentKind: "exercise_solution", variant: "standard", reportCount: 3 }),
    ];
    const markup = renderToStaticMarkup(<GroupedErrorReportThreadInbox threads={[current]} issuesByThread={{ "thread-main": issues }} learningSpaceId="space-5" oldDoneCount={0} spaceSlug="5wis" />);

    expect(markup.match(/class="report-card"/g)).toHaveLength(1);
    expect(markup).toContain("6 meldingen");
    expect(markup).toContain("Opgaven · 2");
    expect(markup).toContain("Eindoplossingen · 1");
    expect(markup).toContain("Uitwerking · 3");
    expect(markup).toMatch(/TO DO[\s\S]*?<span>1<\/span>/);
  });

  it("uses understandable document and variant labels", () => {
    expect(errorReportDocumentLabel("assignment")).toBe("Opgaven");
    expect(errorReportDocumentLabel("final_solutions")).toBe("Eindoplossingen");
    expect(errorReportDocumentLabel("exercise_solution")).toBe("Uitwerking");
    expect(errorReportDocumentLabel("hints")).toBe("Hints");
    expect(errorReportLocationLabel(issue({ documentKind: "exercise_solution", variant: "alternative" }))).toBe("Alternatieve uitwerking");
    expect(errorReportLocationLabel(issue({ documentKind: "final_solutions", variant: "alternative" }))).toBe("Eindoplossingen - Alternatieve uitwerking");
  });

  it("renders compact disclosure metadata and groups report cards per location newest-first", () => {
    const assignment = issue({
      issueId: "assignment",
      documentKind: "assignment",
      variant: null,
      reportCount: 2,
      reports: [report("new", "Nieuwste melding", "2026-09-08T12:00:00.000Z"), report("old", "Oudere melding", "2026-09-08T10:00:00.000Z")],
    });
    const hints = issue({ issueId: "hints", documentKind: "hints", variant: null, reports: [{ ...report("hint", "Hintmelding", "2026-09-08T11:00:00.000Z"), reporterName: null }] });
    const markup = renderToStaticMarkup(<GroupedErrorReportThreadCards threads={[thread({ reportCount: 3 })]} issuesByThread={{ "thread-main": [assignment, hints] }} spaceSlug="5wis" />);

    expect(markup.match(/<details class="issue-report-details">/g)).toHaveLength(1);
    expect(markup).toContain("3 meldingen • laatste: 8 sep 2026, 13:00");
    expect(markup).not.toContain("Bekijk 3 meldingen");
    expect(markup).toMatch(/<h3>Opgaven<\/h3>[\s\S]*Nieuwste melding[\s\S]*Oudere melding/);
    expect(markup).toMatch(/<h3>Hints<\/h3>[\s\S]*Hintmelding/);
    expect(markup.match(/class="issue-report-item is-unhandled"/g)).toHaveLength(3);
    expect(markup.indexOf("Nieuwste melding")).toBeLessThan(markup.indexOf("Oudere melding"));
    expect(markup).toContain("Leerling · 8 sep 2026, 14:00");
    expect(markup).toContain("Onbekende melder · 8 sep 2026, 13:00");
    expect(markup).not.toContain("Gemeld door:");
    expect(markup).not.toContain("Gemeld op");
  });

  it("keeps thread controls separate and adds an individual report completion control", () => {
    const markup = renderToStaticMarkup(<GroupedErrorReportThreadCards threads={[thread()]} issuesByThread={{ "thread-main": [issue()] }} spaceSlug="5wis" />);

    expect(markup).toContain('name="threadId" value="thread-main"');
    expect(markup).toContain("Notitie:");
    expect(markup).toContain("Threadnotitie");
    expect(markup).toContain("Bewerken");
    expect(markup).toContain("report-note-compact report-note-accent");
    expect(markup).not.toContain("textarea");
    expect(markup).not.toContain('name="issueId"');
    expect(markup).not.toContain("Status: TO DO");
    expect(markup).toContain("Zichtbaarheid wisselen");
    expect(markup).toContain('aria-label="Notitie voor oefening 5b toevoegen"');
    expect(markup).toContain('class="visibility-toggle exercise-note-trigger"');
    expect(markup.indexOf('aria-label="Notitie voor oefening 5b toevoegen"')).toBeGreaterThan(markup.indexOf("Zichtbaarheid wisselen"));
    expect(markup.indexOf('aria-label="Notitie voor oefening 5b toevoegen"')).toBeLessThan(markup.indexOf("Melding pinnen"));
    expect(markup).toContain('name="exerciseId" value="exercise-5b"');
    expect(markup).toContain('name="visible" value="false"');
    expect(markup).toContain("Melding pinnen");
    expect(markup).toContain("Markeren als afgewerkt");
    expect(markup).not.toContain("Foutmelding verwijderen");
    expect(markup).toContain('aria-label="Melding verwijderen"');
    expect(markup).toContain('aria-label="Bericht aan leerling"');
    expect(markup).toContain('name="id" value="report-main"');
    expect(markup).toContain('name="status" value="DONE"');
    expect(markup).toContain('aria-label="Markeer als afgewerkt"');
    expect(markup.indexOf('aria-label="Bericht aan leerling"')).toBeGreaterThan(markup.indexOf('<details class="issue-report-details">'));
    expect(markup).toContain("report-delete-button");
    expect(markup.match(/report-item-action/g)).toHaveLength(3);
    expect(markup).not.toContain("Thread verwijderen");
  });

  it("warns when deleting the final report also removes a thread note", () => {
    expect(errorReportDeleteConfirmText(thread())).toContain("adminnotitie verdwijnen permanent");
    expect(errorReportDeleteConfirmText(thread({ adminNote: "" }))).toContain("verdwijnt ook de lege thread");
    expect(errorReportDeleteConfirmText(thread({ reportCount: 2 }))).toBe("Deze individuele melding wordt permanent verwijderd.");
  });

  it("shows a completion date without time for DONE threads", () => {
    const markup = renderToStaticMarkup(<GroupedErrorReportThreadCards
      threads={[thread({ status: "DONE", completedAt: "2026-09-22T14:35:00.000Z", reportCount: 2 })]}
      issuesByThread={{ "thread-main": [issue({ reportCount: 2 })] }}
      spaceSlug="5wis"
    />);

    expect(markup).toContain("2 meldingen • laatste: 8 sep 2026, 13:00 • afgewerkt: 22 sep 2026");
    expect(markup).not.toContain("afgewerkt: 22 sep 2026,");
    expect(markup).toContain('class="issue-report-item is-unhandled"');
  });

  it("distinguishes treated and new reports after automatic reopen", () => {
    const reopened = thread({ completedAt: "2026-09-08T11:00:00.000Z" });
    const oldReport = { ...report("old", "Eerder behandeld", "2026-09-08T10:00:00.000Z"), handledAt: "2026-09-08T11:00:00.000Z" };
    const newReport = report("new", "Nieuwe melding", "2026-09-08T12:00:00.000Z");
    const markup = renderToStaticMarkup(<GroupedErrorReportThreadCards
      threads={[reopened]}
      issuesByThread={{ "thread-main": [issue({ reports: [newReport, oldReport], reportCount: 2 })] }}
      spaceSlug="5wis"
    />);

    expect(markup).toMatch(/is-unhandled[^>]*aria-label="Onbehandelde melding"[\s\S]*Nieuwe melding/);
    expect(markup).toMatch(/is-treated[^>]*aria-label="Eerder afgehandelde melding"[\s\S]*Eerder behandeld/);
    expect(markup).toContain('name="status" value="OPEN"');
    expect(markup).toContain('aria-label="Heropen melding"');
    expect(markup).not.toContain("afgewerkt:");
  });

  it("derives the individual admin visual state only from report handledAt", () => {
    const openReport = report("open", "Open", "2026-09-08T10:00:00.000Z");
    const doneReport = { ...openReport, handledAt: "2026-09-08T11:00:00.000Z" };

    expect(isErrorReportTreated(openReport)).toBe(false);
    expect(isErrorReportTreated(doneReport)).toBe(true);
  });

  it("shows a compact add-note action when the thread note is empty", () => {
    const markup = renderToStaticMarkup(<GroupedErrorReportThreadCards threads={[thread({ adminNote: "" })]} issuesByThread={{ "thread-main": [issue()] }} spaceSlug="5wis" />);

    expect(markup).toContain("Notitie toevoegen");
    expect(markup).not.toContain("textarea");
  });

  it("omits a redundant location count for one location with one report", () => {
    const markup = renderToStaticMarkup(<GroupedErrorReportThreadCards threads={[thread()]} issuesByThread={{ "thread-main": [issue({ documentKind: "hints" })] }} spaceSlug="5wis" />);

    expect(markup).toContain('<span class="report-location-chip">Hints</span>');
    expect(markup).not.toContain("Hints · 1");
  });

  it("supports unmatched threads without preview and matched threads with preview", () => {
    const unmatched = thread({ id: "thread-unmatched", exerciseId: null, exerciseCode: "12", isMatchedExercise: false, sectionTitle: "Onbekende oefening" });
    const unmatchedMarkup = renderToStaticMarkup(<GroupedErrorReportThreadCards threads={[unmatched]} issuesByThread={{}} spaceSlug="5wis" />);
    expect(unmatchedMarkup).toContain("Oefening 12");
    expect(unmatchedMarkup).toContain('aria-label="Niet automatisch gekoppeld"');
    expect(unmatchedMarkup).toContain('title="Niet automatisch gekoppeld"');
    expect(unmatchedMarkup).not.toContain(">Niet automatisch gekoppeld<");
    expect(unmatchedMarkup).not.toContain("/oefening/");
    expect(unmatchedMarkup).not.toContain("Zichtbaarheid wisselen");
    expect(unmatchedMarkup).not.toContain("Notitie voor oefening");

    const matchedMarkup = renderToStaticMarkup(<GroupedErrorReportThreadCards threads={[thread()]} issuesByThread={{}} spaceSlug="5 wis" />);
    expect(matchedMarkup).toContain("/admin/5%20wis/oefening/exercise-5b");
    expect(matchedMarkup).toContain("Zichtbaarheid wisselen");
    expect(matchedMarkup).toContain('aria-label="Notitie voor oefening 5b toevoegen"');
  });

  it("uses the shared checked note state and existing editor fields for a matched exercise", () => {
    const markup = renderToStaticMarkup(<GroupedErrorReportThreadCards
      threads={[thread({ customNote: "Eerste regel\nTweede regel", noteLabel: "Hint", notePosition: "below_solution" })]}
      issuesByThread={{}}
      spaceSlug="5wis"
    />);

    expect(markup).toContain('class="visibility-toggle exercise-note-trigger has-note"');
    expect(markup).toContain('aria-label="Notitie voor oefening 5b bewerken"');
  });

  it("places pinned, TODO and DONE threads in thread-counted sections", () => {
    const markup = renderToStaticMarkup(<GroupedErrorReportThreadInbox
      threads={[
        thread({ id: "todo", portfolioTitle: "Todo portfolio" }),
        thread({ id: "pinned", portfolioTitle: "Pinned portfolio", pinned: true }),
        thread({ id: "done", portfolioTitle: "Done portfolio", status: "DONE" }),
      ]}
      issuesByThread={{}}
      learningSpaceId="space-5"
      oldDoneCount={0}
      spaceSlug="5wis"
    />);

    expect(markup).toMatch(/PINNED[\s\S]*?<span>1<\/span>[\s\S]*Pinned portfolio/);
    expect(markup).toMatch(/TO DO[\s\S]*?<span>1<\/span>[\s\S]*Todo portfolio/);
    expect(markup).toMatch(/DONE[\s\S]*?<span>1<\/span>[\s\S]*Done portfolio/);
  });

  it("shows thread-counted DONE cleanup behind confirmation", () => {
    const markup = renderToStaticMarkup(<GroupedErrorReportThreadInbox
      threads={[thread({ status: "DONE", completedAt: "2026-08-01T10:00:00.000Z" })]}
      issuesByThread={{}}
      learningSpaceId="space-5"
      oldDoneCount={3}
      spaceSlug="5wis"
    />);

    expect(markup).toContain("Verwijder DONE ouder dan 2 weken");
    expect(markup).toContain('aria-label="Afgewerkte meldingen verwijderen"');
    expect(markup).not.toContain("Verwijder thread");
  });
});

function thread(overrides: Partial<GroupedErrorReportThread> = {}): GroupedErrorReportThread {
  return {
    id: "thread-main",
    learningSpaceId: "space-5",
    portfolioId: "portfolio-1",
    portfolioCode: "1",
    portfolioTitle: "Veeltermfuncties",
    exerciseId: "exercise-5b",
    exerciseCode: "5b",
    sectionTitle: "Eerste deel",
    isMatchedExercise: true,
    status: "TODO",
    pinned: false,
    adminNote: "Threadnotitie",
    createdAt: "2026-09-08T10:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-09-08T11:00:00.000Z",
    issueCount: 1,
    reportCount: 1,
    latestReportAt: "2026-09-08T11:00:00.000Z",
    customNote: null,
    noteLabel: null,
    notePosition: "above_solution",
    solutionConfiguredVisible: true,
    solutionStatus: { configuredVisibility: "visible", state: "visible", reason: null, effectiveFrom: null, effectiveUntil: null },
    ...overrides,
  };
}

function issue(overrides: Partial<ErrorReportThreadIssueDetail> = {}): ErrorReportThreadIssueDetail {
  return {
    threadId: "thread-main",
    issueId: "issue-main",
    documentKind: "exercise_solution",
    variant: "standard",
    reportCount: 1,
    latestReportAt: "2026-09-08T11:00:00.000Z",
    reports: [report("report-main", "Melding", "2026-09-08T11:00:00.000Z")],
    ...overrides,
  };
}

function report(id: string, message: string, createdAt: string): ErrorReportIssueDetail {
  return {
    id,
    issueId: "issue-main",
    reporterUserId: null,
    reporterName: "Leerling",
    reporterDisplayName: null,
    message,
    createdAt,
    handledAt: null,
    studentDismissedAt: null,
    teacherResponse: null,
  };
}
