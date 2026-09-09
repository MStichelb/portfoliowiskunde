import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests, type DatabaseClient } from "./database";
import {
  deleteErrorReport,
  deleteOldDoneErrorThreads,
  getAdminErrorReports,
  getGroupedErrorReportIssues,
  getGroupedErrorReportThreads,
  getErrorReportLearningSpaceId,
  getErrorReportThreadLearningSpaceId,
  getOldDoneErrorThreadCount,
  getOpenErrorIssueCount,
  getOpenErrorReportCount,
  getOpenErrorThreadCount,
  listErrorReportIssuesForThreads,
  listErrorReportsForIssue,
  listErrorReportsForIssues,
  saveErrorReportThreadNote,
  setErrorReportTeacherResponse,
  setErrorReportThreadStatus,
  toggleErrorReportThreadPin,
} from "./repositories";

let temporaryDirectory: string | undefined;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-error-read-model-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await seedReadModelFixture(await getDatabase());
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("grouped error report read model", () => {
  it("returns one canonical issue with report and unique authenticated reporter counts", async () => {
    const issue = (await getGroupedErrorReportIssues("space-5")).find((item) => item.id === "issue-main");

    expect(issue).toMatchObject({
      learningSpaceId: "space-5",
      portfolioId: "read-portfolio-1",
      portfolioCode: "1",
      portfolioTitle: "Eerste portfolio",
      sectionTitle: "Eerste deel",
      exerciseId: "read-exercise-1",
      exerciseCode: "1",
      documentKind: "final_solutions",
      variant: "standard",
      status: "TODO",
      pinned: true,
      adminNote: "Canonieke issuenotitie",
      reportCount: 10,
      reporterCount: 2,
      latestReportAt: "2026-09-08T10:09:00.000Z",
      hasLegacyAnonymousReports: true,
    });
  });

  it("keeps variants, document kinds, exercises, portfolios and LearningSpaces separate", async () => {
    const fifthSpace = await getGroupedErrorReportIssues("space-5");
    const sixthSpace = await getGroupedErrorReportIssues("space-6");

    expect(fifthSpace.map((issue) => issue.id)).toEqual([
      "issue-main",
      "issue-alternative",
      "issue-hints",
      "issue-assignment",
      "issue-exercise-2",
      "issue-portfolio-2",
    ]);
    expect(fifthSpace.find((issue) => issue.id === "issue-alternative")).toMatchObject({ variant: "alternative", documentKind: "final_solutions" });
    expect(fifthSpace.find((issue) => issue.id === "issue-hints")).toMatchObject({ variant: null, documentKind: "hints" });
    expect(fifthSpace.find((issue) => issue.id === "issue-assignment")).toMatchObject({ variant: null, documentKind: "assignment" });
    expect(fifthSpace.find((issue) => issue.id === "issue-exercise-2")?.exerciseId).toBe("read-exercise-2");
    expect(fifthSpace.find((issue) => issue.id === "issue-portfolio-2")?.portfolioId).toBe("read-portfolio-2");
    expect(sixthSpace).toHaveLength(1);
    expect(sixthSpace[0]).toMatchObject({ id: "issue-space-6", learningSpaceId: "space-6", portfolioId: "read-portfolio-3" });
  });

  it("returns unmatched exercise issues with their stored code", async () => {
    const database = await getDatabase();
    await database.execute({
      sql: `INSERT INTO error_report_threads
        (id, learning_space_id, portfolio_id, exercise_id, exercise_code, status, pinned, admin_note, created_at, updated_at)
        VALUES ('thread-unmatched', 'space-5', 'read-portfolio-1', NULL, '11a', 'TODO', 0, '',
          '2026-09-08T12:00:00.000Z', '2026-09-08T12:00:00.000Z')`,
      args: [],
    });
    await database.execute({
      sql: `INSERT INTO error_report_issues
        (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, variant_kind,
          status, pinned, admin_note, created_at, updated_at)
        VALUES ('issue-unmatched', 'thread-unmatched', 'space-5', 'read-portfolio-1', NULL, '11a', 'assignment', NULL,
          'TODO', 0, '', '2026-09-08T12:00:00.000Z', '2026-09-08T12:00:00.000Z')`,
      args: [],
    });

    const issue = (await getGroupedErrorReportIssues("space-5")).find((item) => item.id === "issue-unmatched");
    expect(issue).toMatchObject({
      exerciseId: null,
      exerciseCode: "11a",
      isMatchedExercise: false,
      sectionTitle: "Onbekende oefening",
    });
    expect((await getGroupedErrorReportThreads("space-5")).find((item) => item.id === "thread-unmatched")).toMatchObject({
      exerciseId: null,
      solutionConfiguredVisible: null,
      solutionStatus: null,
    });
  });

  it("reads legacy report details newest-first and preserves reporter names", async () => {
    const details = await listErrorReportsForIssue("issue-main", "space-5");

    expect(details).toHaveLength(10);
    expect(details.map((report) => report.id)).toEqual([
      "main-report-09", "main-report-08", "main-report-07", "main-report-06", "main-report-05",
      "main-report-04", "main-report-03", "main-report-02", "main-report-01", "main-report-00",
    ]);
    expect(details.find((report) => report.id === "main-report-09")).toMatchObject({
      reporterUserId: null,
      reporterName: "Legacy leerling",
      reporterDisplayName: null,
      message: "Melding 10",
    });
    expect(details.find((report) => report.id === "main-report-00")?.reporterDisplayName).toBe("Reporter A");
    expect(await listErrorReportsForIssue("issue-main", "space-6")).toEqual([]);
  });

  it("loads details for multiple issues in one ordered bulk read", async () => {
    const details = await listErrorReportsForIssues(["issue-main", "issue-alternative"], "space-5");

    expect(details).toHaveLength(11);
    expect(details[0].id).toBe("main-report-09");
    expect(details.some((report) => report.issueId === "issue-alternative")).toBe(true);
    expect(await listErrorReportsForIssues([], "space-5")).toEqual([]);
  });

  it("exposes per-report student lifecycle fields through current report read models", async () => {
    const database = await getDatabase();
    await database.execute(`UPDATE error_reports
      SET handled_at = '2026-09-08T12:00:00.000Z', student_dismissed_at = '2026-09-08T13:00:00.000Z',
        teacher_response = 'Bedankt voor je melding.'
      WHERE id = 'main-report-09'`);

    const issueReport = (await listErrorReportsForIssue("issue-main", "space-5")).find((report) => report.id === "main-report-09");
    const threadReport = (await listErrorReportIssuesForThreads(["thread-exercise-1"], "space-5"))
      .flatMap((issue) => issue.reports)
      .find((report) => report.id === "main-report-09");
    const adminReport = (await getAdminErrorReports("space-5")).find((report) => report.id === "main-report-09");

    for (const report of [issueReport, threadReport, adminReport]) {
      expect(report).toMatchObject({
        handledAt: "2026-09-08T12:00:00.000Z",
        studentDismissedAt: "2026-09-08T13:00:00.000Z",
        teacherResponse: "Bedankt voor je melding.",
      });
    }
  });

  it("groups issues and reports by exercise thread with one bulk issue-detail read", async () => {
    const threads = await getGroupedErrorReportThreads("space-5");
    const firstExercise = threads.find((thread) => thread.exerciseId === "read-exercise-1");

    expect(firstExercise).toMatchObject({
      portfolioId: "read-portfolio-1",
      exerciseCode: "1",
      issueCount: 4,
      reportCount: 13,
      status: "TODO",
      pinned: true,
      isMatchedExercise: true,
      solutionConfiguredVisible: true,
      solutionStatus: { configuredVisibility: "visible", state: "will-remain-hidden", reason: "parent-hidden" },
    });
    const details = await listErrorReportIssuesForThreads(threads.map((thread) => thread.id), "space-5");
    expect(details.filter((detail) => detail.threadId === firstExercise?.id)).toHaveLength(4);
    expect(details.find((detail) => detail.issueId === "issue-hints")).toMatchObject({
      documentKind: "hints",
      reportCount: 1,
    });
    expect(details.find((detail) => detail.issueId === "issue-main")?.reports).toHaveLength(10);
    expect(details.find((detail) => detail.issueId === "issue-main")?.reports.map((report) => report.id).slice(0, 2)).toEqual(["main-report-09", "main-report-08"]);
    expect(await listErrorReportIssuesForThreads([], "space-5")).toEqual([]);
  });

  it("marks every unhandled report in a DONE thread once and preserves report compatibility fields", async () => {
    const database = await getDatabase();
    const issueBefore = (await database.execute("SELECT status, pinned, admin_note FROM error_report_issues WHERE id = 'issue-main'")).rows[0];
    const reportsBefore = (await database.execute("SELECT id, status, pinned, admin_note FROM error_reports WHERE issue_id = 'issue-main' ORDER BY id")).rows;
    const alreadyHandledAt = "2026-09-08T09:30:00.000Z";
    await database.execute({ sql: "UPDATE error_reports SET handled_at = ?, teacher_response = 'Goed gezien.' WHERE id = 'main-report-00'", args: [alreadyHandledAt] });

    await setErrorReportThreadStatus("thread-exercise-1", "DONE");
    await toggleErrorReportThreadPin("thread-exercise-1");
    await saveErrorReportThreadNote("thread-exercise-1", "T".repeat(4_001));
    let current = (await database.execute("SELECT * FROM error_report_threads WHERE id = 'thread-exercise-1'")).rows[0];
    expect(current?.status).toBe("DONE");
    expect(current?.completed_at).toBeTruthy();
    expect(current?.pinned).toBe(0);
    expect(String(current?.admin_note)).toHaveLength(4_000);
    const firstCompletedAt = String(current?.completed_at);
    const handledReports = (await database.execute({
      sql: `SELECT error_reports.id, error_reports.handled_at FROM error_reports
        INNER JOIN error_report_issues ON error_report_issues.id = error_reports.issue_id
        WHERE error_report_issues.thread_id = 'thread-exercise-1' ORDER BY error_reports.id`,
      args: [],
    })).rows;
    expect(handledReports).toHaveLength(13);
    expect(handledReports.find((report) => report.id === "main-report-00")?.handled_at).toBe(alreadyHandledAt);
    expect(handledReports.filter((report) => report.id !== "main-report-00").every((report) => report.handled_at === firstCompletedAt)).toBe(true);
    expect((await database.execute("SELECT teacher_response FROM error_reports WHERE id = 'main-report-00'")).rows[0]?.teacher_response).toBe("Goed gezien.");
    expect((await database.execute("SELECT handled_at FROM error_reports WHERE id = 'exercise-2-report'")).rows[0]?.handled_at).toBeNull();

    await setErrorReportThreadStatus("thread-exercise-1", "TODO");
    current = (await database.execute("SELECT * FROM error_report_threads WHERE id = 'thread-exercise-1'")).rows[0];
    expect(current).toMatchObject({ status: "TODO", completed_at: null });
    expect((await database.execute("SELECT handled_at FROM error_reports WHERE id = 'main-report-01'")).rows[0]?.handled_at).toBe(firstCompletedAt);

    await database.execute("UPDATE error_report_threads SET completed_at = '2000-01-01T00:00:00.000Z' WHERE id = 'thread-exercise-1'");
    await setErrorReportThreadStatus("thread-exercise-1", "DONE");
    current = (await database.execute("SELECT * FROM error_report_threads WHERE id = 'thread-exercise-1'")).rows[0];
    expect(current?.status).toBe("DONE");
    expect(current?.completed_at).not.toBe("2000-01-01T00:00:00.000Z");
    expect(current?.updated_at).toBe(current?.completed_at);
    expect((await database.execute("SELECT handled_at FROM error_reports WHERE id = 'main-report-01'")).rows[0]?.handled_at).toBe(firstCompletedAt);
    expect((await database.execute("SELECT status, pinned, admin_note FROM error_report_issues WHERE id = 'issue-main'")).rows[0]).toEqual(issueBefore);
    expect((await database.execute("SELECT id, status, pinned, admin_note FROM error_reports WHERE issue_id = 'issue-main' ORDER BY id")).rows).toEqual(reportsBefore);
  });

  it("updates and removes only the per-report teacher response without changing lifecycle or thread status", async () => {
    const database = await getDatabase();
    await database.execute(`UPDATE error_reports
      SET handled_at = '2026-09-08T12:00:00.000Z', student_dismissed_at = '2026-09-08T13:00:00.000Z'
      WHERE id = 'main-report-09'`);
    const reportBefore = (await database.execute("SELECT status, completed_at, updated_at, handled_at, student_dismissed_at FROM error_reports WHERE id = 'main-report-09'")).rows[0];
    const threadBefore = (await database.execute("SELECT status, completed_at, updated_at FROM error_report_threads WHERE id = 'thread-exercise-1'")).rows[0];

    await setErrorReportTeacherResponse("main-report-09", "Bedankt voor je melding.");
    expect((await database.execute("SELECT status, completed_at, updated_at, handled_at, student_dismissed_at, teacher_response FROM error_reports WHERE id = 'main-report-09'")).rows[0]).toEqual({
      ...reportBefore,
      teacher_response: "Bedankt voor je melding.",
    });
    expect((await database.execute("SELECT status, completed_at, updated_at FROM error_report_threads WHERE id = 'thread-exercise-1'")).rows[0]).toEqual(threadBefore);

    await setErrorReportTeacherResponse("main-report-09", null);
    expect((await database.execute("SELECT handled_at, student_dismissed_at, teacher_response FROM error_reports WHERE id = 'main-report-09'")).rows[0]).toMatchObject({
      handled_at: "2026-09-08T12:00:00.000Z",
      student_dismissed_at: "2026-09-08T13:00:00.000Z",
      teacher_response: null,
    });
  });

  it("rolls back the thread DONE transition when report handling fails", async () => {
    const database = await getDatabase();
    await database.execute(`CREATE TRIGGER reject_report_handling
      BEFORE UPDATE OF handled_at ON error_reports
      WHEN NEW.handled_at IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'forced report handling failure'); END`);

    await expect(setErrorReportThreadStatus("thread-exercise-1", "DONE")).rejects.toThrow("forced report handling failure");

    expect((await database.execute("SELECT status, completed_at FROM error_report_threads WHERE id = 'thread-exercise-1'")).rows[0]).toMatchObject({
      status: "TODO",
      completed_at: null,
    });
    expect((await database.execute("SELECT COUNT(*) AS count FROM error_reports WHERE handled_at IS NOT NULL")).rows[0]?.count).toBe(0);
  });

  it("counts and resolves threads, including an unmatched exercise", async () => {
    const database = await getDatabase();
    await database.execute({
      sql: `INSERT INTO error_report_threads
        (id, learning_space_id, portfolio_id, exercise_id, exercise_code, status, pinned, admin_note, created_at, updated_at)
        VALUES ('thread-unmatched-lookup', 'space-5', 'read-portfolio-1', NULL, '17b', 'TODO', 0, '',
          '2026-09-08T12:00:00.000Z', '2026-09-08T12:00:00.000Z')`,
      args: [],
    });

    expect(await getOpenErrorThreadCount("space-5")).toBe(2);
    expect(await getErrorReportThreadLearningSpaceId("thread-unmatched-lookup")).toBe("space-5");
    expect(await getErrorReportThreadLearningSpaceId("missing-thread")).toBeNull();
  });

  it("resolves report management through its canonical issue and thread instead of redundant report location fields", async () => {
    const database = await getDatabase();
    await database.execute("UPDATE error_reports SET portfolio_id = 'read-portfolio-3' WHERE id = 'main-report-00'");

    expect(await getErrorReportLearningSpaceId("main-report-00")).toBe("space-5");
    expect(await getErrorReportLearningSpaceId("missing-report")).toBeNull();
  });

  it("counts open issues instead of underlying reports while legacy reads remain available", async () => {
    expect(await getOpenErrorIssueCount("space-5")).toBe(1);
    expect(await getOpenErrorIssueCount("space-6")).toBe(1);
    expect(await getOpenErrorReportCount("space-5")).toBe(10);

    const legacyReports = await getAdminErrorReports("space-5");
    expect(legacyReports).toHaveLength(15);
    expect(legacyReports.find((report) => report.id === "main-report-09")).toMatchObject({
      reporterName: "Legacy leerling",
      message: "Melding 10",
    });
  });

  it("deletes one report without changing its surviving issue or thread lifecycle", async () => {
    const database = await getDatabase();
    await database.execute("UPDATE error_report_threads SET completed_at = '2026-09-01T09:00:00.000Z' WHERE id = 'thread-exercise-1'");
    const before = (await database.execute("SELECT status, completed_at, admin_note FROM error_report_threads WHERE id = 'thread-exercise-1'")).rows[0];

    await deleteErrorReport("main-report-09");

    expect((await database.execute("SELECT id FROM error_reports WHERE id = 'main-report-09'")).rows).toHaveLength(0);
    expect((await database.execute("SELECT id FROM error_report_issues WHERE id = 'issue-main'")).rows).toHaveLength(1);
    expect((await database.execute("SELECT status, completed_at, admin_note FROM error_report_threads WHERE id = 'thread-exercise-1'")).rows[0]).toEqual(before);
  });

  it("removes an empty issue while preserving a thread that still has other issues", async () => {
    const database = await getDatabase();

    await deleteErrorReport("hints-report");

    expect((await database.execute("SELECT id FROM error_reports WHERE id = 'hints-report'")).rows).toHaveLength(0);
    expect((await database.execute("SELECT id FROM error_report_issues WHERE id = 'issue-hints'")).rows).toHaveLength(0);
    expect((await database.execute("SELECT id FROM error_report_threads WHERE id = 'thread-exercise-1'")).rows).toHaveLength(1);
  });

  it("removes the empty thread and its admin note after its last report disappears", async () => {
    const database = await getDatabase();
    await database.execute("UPDATE error_report_threads SET admin_note = 'Verdwijnt met de thread' WHERE id = 'thread-exercise-2'");

    await deleteErrorReport("exercise-2-report");

    expect((await database.execute("SELECT id FROM error_reports WHERE id = 'exercise-2-report'")).rows).toHaveLength(0);
    expect((await database.execute("SELECT id FROM error_report_issues WHERE id = 'issue-exercise-2'")).rows).toHaveLength(0);
    expect((await database.execute("SELECT id FROM error_report_threads WHERE id = 'thread-exercise-2'")).rows).toHaveLength(0);
  });

  it("cleans up only DONE threads completed more than fourteen days ago", async () => {
    const database = await getDatabase();
    const now = new Date("2026-09-22T12:00:00.000Z");
    await database.batch([
      { sql: "UPDATE error_report_threads SET completed_at = ? WHERE id = 'thread-exercise-2'", args: ["2026-09-08T11:59:59.999Z"] },
      { sql: "UPDATE error_report_threads SET completed_at = ? WHERE id = 'thread-exercise-3'", args: ["2026-09-08T12:00:00.000Z"] },
      { sql: "UPDATE error_report_threads SET completed_at = ? WHERE id = 'thread-exercise-1'", args: ["2000-01-01T00:00:00.000Z"] },
    ]);

    expect(await getOldDoneErrorThreadCount(now, "space-5")).toBe(1);
    await deleteOldDoneErrorThreads(now, "space-5");

    expect((await database.execute("SELECT id FROM error_report_threads WHERE id = 'thread-exercise-2'")).rows).toHaveLength(0);
    expect((await database.execute("SELECT id FROM error_report_issues WHERE id = 'issue-exercise-2'")).rows).toHaveLength(0);
    expect((await database.execute("SELECT id FROM error_reports WHERE id = 'exercise-2-report'")).rows).toHaveLength(0);
    expect((await database.execute("SELECT id FROM error_report_threads WHERE id IN ('thread-exercise-1', 'thread-exercise-3') ORDER BY id")).rows.map((row) => row.id)).toEqual(["thread-exercise-1", "thread-exercise-3"]);
    expect((await database.execute("SELECT id FROM error_reports WHERE id = 'portfolio-2-report'")).rows).toHaveLength(1);
    expect(await getOldDoneErrorThreadCount(now, "space-5")).toBe(0);
  });
});

async function seedReadModelFixture(database: DatabaseClient): Promise<void> {
  await database.batch([
    { sql: `INSERT INTO users (id, display_name, role, status, created_at, updated_at)
      VALUES ('reporter-a', 'Reporter A', 'student', 'active', '2026-09-01T10:00:00.000Z', '2026-09-01T10:00:00.000Z')`, args: [] },
    { sql: `INSERT INTO users (id, display_name, role, status, created_at, updated_at)
      VALUES ('reporter-b', 'Reporter B', 'student', 'active', '2026-09-01T10:00:00.000Z', '2026-09-01T10:00:00.000Z')`, args: [] },
    portfolio("read-portfolio-1", "space-5", "1", "Eerste portfolio"),
    portfolio("read-portfolio-2", "space-5", "2", "Tweede portfolio"),
    portfolio("read-portfolio-3", "space-6", "3", "Derde portfolio"),
    section("read-section-1", "read-portfolio-1", "Eerste deel"),
    section("read-section-2", "read-portfolio-2", "Tweede deel"),
    section("read-section-3", "read-portfolio-3", "Derde deel"),
    exercise("read-exercise-1", "read-portfolio-1", "read-section-1", "1", 1),
    exercise("read-exercise-2", "read-portfolio-1", "read-section-1", "2", 2),
    exercise("read-exercise-3", "read-portfolio-2", "read-section-2", "1", 1),
    exercise("read-exercise-4", "read-portfolio-3", "read-section-3", "1", 1),
    thread("thread-exercise-1", "space-5", "read-portfolio-1", "read-exercise-1", "1", "TODO", 1, "Canonieke threadnotitie", "2026-09-08T11:00:00.000Z"),
    thread("thread-exercise-2", "space-5", "read-portfolio-1", "read-exercise-2", "2", "DONE", 0, "", "2026-09-08T10:20:00.000Z"),
    thread("thread-exercise-3", "space-5", "read-portfolio-2", "read-exercise-3", "1", "DONE", 0, "", "2026-09-08T10:10:00.000Z"),
    thread("thread-exercise-4", "space-6", "read-portfolio-3", "read-exercise-4", "1", "TODO", 0, "", "2026-09-08T10:00:00.000Z"),
    issue("issue-main", "space-5", "read-portfolio-1", "read-exercise-1", "final_solutions", "standard", "TODO", 1, "Canonieke issuenotitie", "2026-09-08T11:00:00.000Z"),
    issue("issue-alternative", "space-5", "read-portfolio-1", "read-exercise-1", "final_solutions", "alternative", "DONE", 0, "", "2026-09-08T10:50:00.000Z"),
    issue("issue-hints", "space-5", "read-portfolio-1", "read-exercise-1", "hints", null, "DONE", 0, "", "2026-09-08T10:40:00.000Z"),
    issue("issue-assignment", "space-5", "read-portfolio-1", "read-exercise-1", "assignment", null, "DONE", 0, "", "2026-09-08T10:30:00.000Z"),
    issue("issue-exercise-2", "space-5", "read-portfolio-1", "read-exercise-2", "final_solutions", "standard", "DONE", 0, "", "2026-09-08T10:20:00.000Z"),
    issue("issue-portfolio-2", "space-5", "read-portfolio-2", "read-exercise-3", "final_solutions", "standard", "DONE", 0, "", "2026-09-08T10:10:00.000Z"),
    issue("issue-space-6", "space-6", "read-portfolio-3", "read-exercise-4", "final_solutions", "standard", "TODO", 0, "", "2026-09-08T10:00:00.000Z"),
  ]);

  // The production partial index prevents this shape. Dropping it here simulates imported legacy/test data
  // and proves reporterCount remains a distinct-user count if duplicates nevertheless exist.
  await database.execute("DROP INDEX error_reports_issue_reporter_unique");
  const mainReports = Array.from({ length: 10 }, (_, index) => report({
    id: `main-report-${String(index).padStart(2, "0")}`,
    issueId: "issue-main",
    portfolioId: "read-portfolio-1",
    sectionId: "read-section-1",
    exerciseId: "read-exercise-1",
    variant: "standard",
    reporterUserId: index < 2 ? "reporter-a" : index === 2 ? "reporter-b" : null,
    reporterName: index === 9 ? "Legacy leerling" : null,
    message: `Melding ${index + 1}`,
    status: "TODO",
    createdAt: `2026-09-08T10:${String(index).padStart(2, "0")}:00.000Z`,
  }));
  await database.batch([
    ...mainReports,
    report({ id: "alternative-report", issueId: "issue-alternative", portfolioId: "read-portfolio-1", sectionId: "read-section-1", exerciseId: "read-exercise-1", variant: "alternative", message: "Alternatief", status: "DONE", createdAt: "2026-09-08T09:00:00.000Z" }),
    report({ id: "hints-report", issueId: "issue-hints", portfolioId: "read-portfolio-1", sectionId: "read-section-1", exerciseId: "read-exercise-1", variant: "standard", message: "Hints", status: "DONE", createdAt: "2026-09-08T08:00:00.000Z" }),
    report({ id: "assignment-report", issueId: "issue-assignment", portfolioId: "read-portfolio-1", sectionId: "read-section-1", exerciseId: "read-exercise-1", variant: "standard", message: "Opgaven", status: "DONE", createdAt: "2026-09-08T07:00:00.000Z" }),
    report({ id: "exercise-2-report", issueId: "issue-exercise-2", portfolioId: "read-portfolio-1", sectionId: "read-section-1", exerciseId: "read-exercise-2", variant: "standard", message: "Oefening 2", status: "DONE", createdAt: "2026-09-08T06:00:00.000Z" }),
    report({ id: "portfolio-2-report", issueId: "issue-portfolio-2", portfolioId: "read-portfolio-2", sectionId: "read-section-2", exerciseId: "read-exercise-3", variant: "standard", message: "Portfolio 2", status: "DONE", createdAt: "2026-09-08T05:00:00.000Z" }),
    report({ id: "space-6-report", issueId: "issue-space-6", portfolioId: "read-portfolio-3", sectionId: "read-section-3", exerciseId: "read-exercise-4", variant: "standard", message: "Space 6", status: "TODO", createdAt: "2026-09-08T04:00:00.000Z" }),
  ]);
}

function portfolio(id: string, learningSpaceId: string, code: string, title: string) {
  return {
    sql: `INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, is_indexed, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, '2026-09-01T10:00:00.000Z')`,
    args: [id, `${learningSpaceId}:${code}`, code, learningSpaceId, title, `Portfolio ${code} - ${title}`],
  };
}

function section(id: string, portfolioId: string, title: string) {
  return {
    sql: `INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path)
      VALUES (?, ?, 1, ?, ?)`,
    args: [id, portfolioId, title, `${portfolioId}/Uitwerkingen/1 - ${title}`],
  };
}

function exercise(id: string, portfolioId: string, sectionId: string, code: string, number: number) {
  return {
    sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix)
      VALUES (?, ?, ?, ?, ?, '')`,
    args: [id, portfolioId, sectionId, code, number],
  };
}

function issue(id: string, learningSpaceId: string, portfolioId: string, exerciseId: string, documentKind: string, variant: string | null, status: string, pinned: number, note: string, updatedAt: string) {
  return {
    sql: `INSERT INTO error_report_issues
      (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, variant_kind, status, pinned, admin_note, created_at, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, (SELECT exercise_code FROM exercises WHERE id = ?), ?, ?, ?, ?, ?, '2026-09-01T10:00:00.000Z', ?, ?)`,
    args: [id, `thread-${exerciseId.replace("read-", "")}`, learningSpaceId, portfolioId, exerciseId, exerciseId, documentKind, variant, status, pinned, note, status === "DONE" ? updatedAt : null, updatedAt],
  };
}

function thread(id: string, learningSpaceId: string, portfolioId: string, exerciseId: string, exerciseCode: string, status: string, pinned: number, note: string, updatedAt: string) {
  return {
    sql: `INSERT INTO error_report_threads
      (id, learning_space_id, portfolio_id, exercise_id, exercise_code, status, pinned, admin_note, created_at, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-09-01T10:00:00.000Z', ?, ?)`,
    args: [id, learningSpaceId, portfolioId, exerciseId, exerciseCode, status, pinned, note, status === "DONE" ? updatedAt : null, updatedAt],
  };
}

function report(input: {
  id: string;
  issueId: string;
  portfolioId: string;
  sectionId: string;
  exerciseId: string;
  variant: "standard" | "alternative";
  message: string;
  status: "TODO" | "DONE";
  createdAt: string;
  reporterUserId?: string | null;
  reporterName?: string | null;
}) {
  return {
    sql: `INSERT INTO error_reports
      (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, message, reporter_name,
        status, pinned, admin_note, created_at, completed_at, updated_at, issue_id, reporter_user_id)
      VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?, 0, 'Legacy reportnotitie', ?, ?, ?, ?, ?)`,
    args: [
      input.id, input.portfolioId, input.sectionId, input.exerciseId, input.variant, input.message,
      input.reporterName ?? null, input.status, input.createdAt, input.status === "DONE" ? input.createdAt : null,
      input.createdAt, input.issueId, input.reporterUserId ?? null,
    ],
  };
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
      if (attempt === 9) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
