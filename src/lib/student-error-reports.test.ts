import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAuthenticatedUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAuthenticatedUser: mocks.requireAuthenticatedUser }));

import { getDatabase, resetDatabaseForTests, type DatabaseClient } from "./database";
import type { AppUser } from "./identity";
import {
  dismissPendingHandledReportNotificationsForCurrentUser,
  getMyErrorReports,
  isStudentErrorReportVisible,
  listPendingHandledReportNotificationsForCurrentUser,
  studentErrorReportEffectiveHandledAt,
  studentErrorReportStatus,
} from "./student-error-reports";

const now = new Date("2026-09-22T12:00:00.000Z");
const studentA = user("student-a", "Ada Leerling");
let temporaryDirectory: string | undefined;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-my-error-reports-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  mocks.requireAuthenticatedUser.mockReset();
  mocks.requireAuthenticatedUser.mockResolvedValue(studentA);
  await seedMyReportsFixture(await getDatabase());
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("student error report visibility", () => {
  it("prefers individual handling and otherwise derives effective completion from a DONE thread", () => {
    expect(studentErrorReportEffectiveHandledAt({ handledAt: "2026-09-20T10:00:00.000Z", threadStatus: "DONE", threadCompletedAt: "2026-09-21T10:00:00.000Z" })).toBe("2026-09-20T10:00:00.000Z");
    expect(studentErrorReportEffectiveHandledAt({ handledAt: null, threadStatus: "DONE", threadCompletedAt: "2026-09-21T10:00:00.000Z" })).toBe("2026-09-21T10:00:00.000Z");
    expect(studentErrorReportEffectiveHandledAt({ handledAt: null, threadStatus: "TODO", threadCompletedAt: "2026-09-21T10:00:00.000Z" })).toBeNull();
    expect(studentErrorReportStatus({ handledAt: null, threadStatus: "TODO" })).toBe("IN_PROGRESS");
    expect(studentErrorReportStatus({ handledAt: null, threadStatus: "DONE" })).toBe("HANDLED");
    expect(studentErrorReportStatus({ handledAt: "2026-09-20T10:00:00.000Z", threadStatus: "TODO" })).toBe("HANDLED");
  });

  it("keeps open reports regardless of age and includes handled reports through the exact fourteen-day boundary", () => {
    expect(isStudentErrorReportVisible({ status: "IN_PROGRESS", effectiveHandledAt: null }, new Date("2030-01-01T00:00:00.000Z"))).toBe(true);
    expect(isStudentErrorReportVisible({ status: "HANDLED", effectiveHandledAt: "2026-09-08T12:00:00.000Z" }, now)).toBe(true);
    expect(isStudentErrorReportVisible({ status: "HANDLED", effectiveHandledAt: "2026-09-08T11:59:59.999Z" }, now)).toBe(false);
    expect(isStudentErrorReportVisible({ status: "HANDLED", effectiveHandledAt: null }, now)).toBe(false);
  });
});

describe("getMyErrorReports", () => {
  it("returns every distinct submission from the same student and issue", async () => {
    const database = await getDatabase();
    await database.execute(`INSERT INTO error_reports (
      id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, source_last_modified_at,
      message, status, pinned, admin_note, created_at, completed_at, updated_at, reporter_name,
      issue_id, reporter_user_id, handled_at, student_dismissed_at, teacher_response
    ) SELECT
      'open-second', portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, source_last_modified_at,
      'Tweede afzonderlijke melding', 'TODO', pinned, admin_note, '2026-09-21T13:00:00.000Z', NULL,
      '2026-09-21T13:00:00.000Z', reporter_name, issue_id, reporter_user_id, NULL, NULL, NULL
    FROM error_reports WHERE id = 'open-new'`);

    const reports = await getMyErrorReports(now);
    expect(reports?.filter((report) => report.reportId === "open-new" || report.reportId === "open-second")).toHaveLength(2);
    expect(reports?.find((report) => report.reportId === "open-second")).toMatchObject({
      message: "Tweede afzonderlijke melding",
      status: "IN_PROGRESS",
    });
  });

  it("uses the authenticated student, excludes other users and supports matched and unmatched exercise context", async () => {
    const reports = await getMyErrorReports(now);

    expect(mocks.requireAuthenticatedUser).toHaveBeenCalledWith();
    expect(reports?.some((report) => report.reportId === "other-user-report")).toBe(false);
    expect(reports?.find((report) => report.reportId === "open-new")).toMatchObject({
      status: "IN_PROGRESS",
      exerciseCode: "2a",
      isMatchedExercise: true,
      portfolioCode: "1",
      portfolioTitle: "Veeltermfuncties",
      learningSpaceName: "5de jaar",
      locationLabel: "Uitwerking",
    });
    expect(reports?.find((report) => report.reportId === "unmatched-report")).toMatchObject({
      exerciseCode: "17b",
      isMatchedExercise: false,
      locationLabel: "Opgaven",
    });
  });

  it("prevents IDOR, excludes inaccessible spaces and stops showing reports after access is revoked", async () => {
    const reports = await getMyErrorReports(now);
    expect(reports?.some((report) => report.reportId === "denied-space-report")).toBe(false);
    expect(reports?.every((report) => report.reportId !== "other-user-report")).toBe(true);

    await (await getDatabase()).execute("DELETE FROM individual_learning_space_access WHERE user_id = 'student-a' AND learning_space_id = 'space-5'");
    expect(await getMyErrorReports(now)).toEqual([]);
  });

  it("stops showing reports when the portfolio is no longer currently available", async () => {
    await (await getDatabase()).execute("UPDATE portfolios SET visible = 0 WHERE id = 'my-portfolio-5'");
    expect(await getMyErrorReports(now)).toEqual([]);
  });

  it("keeps only recent handled reports, keeps old open reports and sorts open then handled by relevance", async () => {
    const reports = await getMyErrorReports(now);
    const ids = reports?.map((report) => report.reportId);

    expect(ids).toContain("handled-boundary");
    expect(ids).not.toContain("handled-expired");
    expect(ids).toContain("open-old");
    expect(ids?.slice(0, 2)).toEqual(["open-new", "unmatched-report"]);
    expect(ids?.indexOf("handled-recent")).toBeLessThan(ids?.indexOf("handled-boundary") ?? -1);
  });

  it("uses thread completion only while an individually open report belongs to a DONE thread", async () => {
    const database = await getDatabase();
    await database.execute("UPDATE error_reports SET handled_at = NULL WHERE id = 'handled-recent'");

    let report = (await getMyErrorReports(now))?.find((item) => item.reportId === "handled-recent");
    expect(report).toMatchObject({ status: "HANDLED", handledAt: null, effectiveHandledAt: "2026-09-20T10:00:00.000Z" });

    await database.execute("UPDATE error_report_threads SET status = 'TODO', completed_at = NULL WHERE id = 'thread-handled-recent'");
    report = (await getMyErrorReports(now))?.find((item) => item.reportId === "handled-recent");
    expect(report).toMatchObject({ status: "IN_PROGRESS", handledAt: null, effectiveHandledAt: null });
  });

  it("keeps an individually handled report completed when its thread reopens", async () => {
    await (await getDatabase()).execute("UPDATE error_report_threads SET status = 'TODO', completed_at = NULL WHERE id = 'thread-handled-recent'");
    expect((await getMyErrorReports(now))?.find((item) => item.reportId === "handled-recent")).toMatchObject({
      status: "HANDLED",
      handledAt: "2026-09-20T10:00:00.000Z",
      effectiveHandledAt: "2026-09-20T10:00:00.000Z",
    });
  });

  it("returns teacher responses only from the current user's reports with a fixed query count", async () => {
    const database = await getDatabase();
    const execute = vi.spyOn(database, "execute");

    const reports = await getMyErrorReports(now);

    expect(reports?.find((report) => report.reportId === "handled-recent")?.teacherResponse).toBe("Eerste regel\nTweede regel");
    expect(reports?.some((report) => report.teacherResponse === "Reactie voor andere leerling")).toBe(false);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("rejects non-student contexts", async () => {
    mocks.requireAuthenticatedUser.mockResolvedValue({ ...studentA, role: "teacher" });
    expect(await getMyErrorReports(now)).toBeNull();
  });
});

describe("handled report notifications", () => {
  it("returns no notification when the student's reports are all open", async () => {
    await (await getDatabase()).execute("UPDATE error_reports SET handled_at = NULL WHERE reporter_user_id = 'student-a'");
    expect(await listPendingHandledReportNotificationsForCurrentUser(now)).toBeNull();
  });

  it("lists only recent handled, undismissed reports in one fixed-query aggregate", async () => {
    const database = await getDatabase();
    const execute = vi.spyOn(database, "execute");

    const notification = await listPendingHandledReportNotificationsForCurrentUser(now);

    expect(notification).toMatchObject({ count: 2, reportIds: ["handled-recent", "handled-boundary"], exerciseCode: null, singleLearningSpaceId: "space-5" });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("returns no notification for open, dismissed or expired reports", async () => {
    const database = await getDatabase();
    await database.execute("UPDATE error_reports SET student_dismissed_at = '2026-09-21T12:00:00.000Z' WHERE handled_at IS NOT NULL AND reporter_user_id = 'student-a'");
    expect(await listPendingHandledReportNotificationsForCurrentUser(now)).toBeNull();

    await database.execute("UPDATE error_reports SET student_dismissed_at = NULL, handled_at = '2026-09-01T12:00:00.000Z' WHERE handled_at IS NOT NULL AND reporter_user_id = 'student-a'");
    expect(await listPendingHandledReportNotificationsForCurrentUser(now)).toBeNull();
  });

  it("uses a safe singular fallback for an unmatched exercise", async () => {
    const database = await getDatabase();
    await database.execute("UPDATE error_reports SET student_dismissed_at = '2026-09-21T12:00:00.000Z' WHERE handled_at IS NOT NULL AND reporter_user_id = 'student-a'");
    await database.execute("UPDATE error_reports SET handled_at = '2026-09-21T12:00:00.000Z' WHERE id = 'unmatched-report'");

    expect(await listPendingHandledReportNotificationsForCurrentUser(now)).toMatchObject({
      count: 1,
      reportIds: ["unmatched-report"],
      exerciseCode: null,
    });
  });

  it("dismisses one report without changing its handling or teacher response and keeps it in Mijn meldingen", async () => {
    expect(await dismissPendingHandledReportNotificationsForCurrentUser(["handled-recent"], now)).toBe(1);
    const report = (await (await getDatabase()).execute("SELECT handled_at, student_dismissed_at, teacher_response FROM error_reports WHERE id = 'handled-recent'")).rows[0];

    expect(report).toEqual({
      handled_at: "2026-09-20T10:00:00.000Z",
      student_dismissed_at: now.toISOString(),
      teacher_response: "Eerste regel\nTweede regel",
    });
    expect((await getMyErrorReports(now))?.some((item) => item.reportId === "handled-recent")).toBe(true);
  });

  it("dismisses only submitted reports that are currently pending and owned by the current user", async () => {
    const database = await getDatabase();
    await database.execute("UPDATE error_reports SET handled_at = '2026-09-21T12:00:00.000Z' WHERE id = 'other-user-report'");

    expect(await dismissPendingHandledReportNotificationsForCurrentUser([
      "handled-recent", "handled-boundary", "other-user-report", "open-new", "handled-expired",
    ], now)).toBe(2);

    const rows = (await database.execute("SELECT id, student_dismissed_at FROM error_reports WHERE id IN ('handled-recent', 'handled-boundary', 'other-user-report', 'open-new', 'handled-expired') ORDER BY id")).rows;
    expect(rows.filter((row) => row.student_dismissed_at !== null).map((row) => row.id)).toEqual(["handled-boundary", "handled-recent"]);
  });

  it("cannot dismiss after access is revoked", async () => {
    const database = await getDatabase();
    await database.execute("DELETE FROM individual_learning_space_access WHERE user_id = 'student-a' AND learning_space_id = 'space-5'");

    expect(await dismissPendingHandledReportNotificationsForCurrentUser(["handled-recent"], now)).toBe(0);
    expect((await database.execute("SELECT student_dismissed_at FROM error_reports WHERE id = 'handled-recent'")).rows[0]?.student_dismissed_at).toBeNull();
  });

  it("allows a newly handled resubmission cycle to notify again", async () => {
    const database = await getDatabase();
    await dismissPendingHandledReportNotificationsForCurrentUser(["handled-recent"], now);
    await database.execute("UPDATE error_reports SET handled_at = NULL, student_dismissed_at = NULL, teacher_response = NULL WHERE id = 'handled-recent'");
    expect((await listPendingHandledReportNotificationsForCurrentUser(now))?.reportIds).not.toContain("handled-recent");

    await database.execute("UPDATE error_reports SET handled_at = '2026-09-22T11:00:00.000Z' WHERE id = 'handled-recent'");
    expect((await listPendingHandledReportNotificationsForCurrentUser(now))?.reportIds).toContain("handled-recent");
  });
});

async function seedMyReportsFixture(database: DatabaseClient): Promise<void> {
  await database.batch([
    userStatement(studentA),
    userStatement(user("student-b", "Bram Leerling")),
    { sql: "INSERT INTO individual_learning_space_access (user_id, learning_space_id, created_at, updated_at) VALUES ('student-a', 'space-5', ?, ?)", args: [now.toISOString(), now.toISOString()] },
    portfolio("my-portfolio-5", "space-5", "1", "Veeltermfuncties"),
    portfolio("my-portfolio-6", "space-6", "2", "Integralen"),
    section("my-section-5", "my-portfolio-5"),
    section("my-section-6", "my-portfolio-6"),
    ...["1a", "2a", "3a", "4a", "5a", "7a"].map((code, index) => exercise(`exercise-${code}`, "my-portfolio-5", "my-section-5", code, index + 1)),
    exercise("exercise-6a", "my-portfolio-6", "my-section-6", "6a", 6),
    ...reportChain({ id: "open-old", userId: "student-a", portfolioId: "my-portfolio-5", spaceId: "space-5", exerciseId: "exercise-1a", exerciseCode: "1a", createdAt: "2020-01-01T10:00:00.000Z", handledAt: null }),
    ...reportChain({ id: "open-new", userId: "student-a", portfolioId: "my-portfolio-5", spaceId: "space-5", exerciseId: "exercise-2a", exerciseCode: "2a", createdAt: "2026-09-21T10:00:00.000Z", handledAt: null, teacherResponse: "Nog niet tonen" }),
    ...reportChain({ id: "handled-recent", userId: "student-a", portfolioId: "my-portfolio-5", spaceId: "space-5", exerciseId: "exercise-3a", exerciseCode: "3a", createdAt: "2026-09-10T10:00:00.000Z", handledAt: "2026-09-20T10:00:00.000Z", teacherResponse: "Eerste regel\nTweede regel" }),
    ...reportChain({ id: "handled-boundary", userId: "student-a", portfolioId: "my-portfolio-5", spaceId: "space-5", exerciseId: "exercise-4a", exerciseCode: "4a", createdAt: "2026-09-01T10:00:00.000Z", handledAt: "2026-09-08T12:00:00.000Z" }),
    ...reportChain({ id: "handled-expired", userId: "student-a", portfolioId: "my-portfolio-5", spaceId: "space-5", exerciseId: "exercise-5a", exerciseCode: "5a", createdAt: "2026-09-01T09:00:00.000Z", handledAt: "2026-09-08T11:59:59.999Z" }),
    ...reportChain({ id: "unmatched-report", userId: "student-a", portfolioId: "my-portfolio-5", spaceId: "space-5", exerciseId: null, exerciseCode: "17b", createdAt: "2026-09-20T09:00:00.000Z", handledAt: null, documentKind: "assignment" }),
    ...reportChain({ id: "other-user-report", userId: "student-b", portfolioId: "my-portfolio-5", spaceId: "space-5", exerciseId: "exercise-7a", exerciseCode: "7a", createdAt: "2026-09-22T10:00:00.000Z", handledAt: null, suffix: "other", teacherResponse: "Reactie voor andere leerling" }),
    ...reportChain({ id: "denied-space-report", userId: "student-a", portfolioId: "my-portfolio-6", spaceId: "space-6", exerciseId: "exercise-6a", exerciseCode: "6a", createdAt: "2026-09-22T11:00:00.000Z", handledAt: null }),
  ]);
}

function reportChain(input: {
  id: string;
  userId: string;
  portfolioId: string;
  spaceId: string;
  exerciseId: string | null;
  exerciseCode: string;
  createdAt: string;
  handledAt: string | null;
  teacherResponse?: string | null;
  documentKind?: "assignment" | "exercise_solution";
  suffix?: string;
}) {
  const suffix = input.suffix ?? input.id;
  const threadId = `thread-${suffix}`;
  const issueId = `issue-${suffix}`;
  const sectionId = input.spaceId === "space-5" ? "my-section-5" : "my-section-6";
  const documentKind = input.documentKind ?? "exercise_solution";
  return [
    { sql: `INSERT INTO error_report_threads
      (id, learning_space_id, portfolio_id, exercise_id, exercise_code, status, pinned, admin_note, created_at, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, '', ?, ?, ?)`, args: [threadId, input.spaceId, input.portfolioId, input.exerciseId, input.exerciseCode, input.handledAt ? "DONE" : "TODO", input.createdAt, input.handledAt, input.handledAt ?? input.createdAt] },
    { sql: `INSERT INTO error_report_issues
      (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, variant_kind,
        status, pinned, admin_note, created_at, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', ?, ?, ?)`, args: [issueId, threadId, input.spaceId, input.portfolioId, input.exerciseId, input.exerciseCode, documentKind, documentKind === "exercise_solution" ? "standard" : null, input.handledAt ? "DONE" : "TODO", input.createdAt, input.handledAt, input.handledAt ?? input.createdAt] },
    { sql: `INSERT INTO error_reports
      (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, message, status, created_at,
        completed_at, updated_at, issue_id, reporter_user_id, handled_at, teacher_response)
      VALUES (?, ?, ?, ?, 'standard', '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [input.id, input.portfolioId, input.exerciseId ? sectionId : null, input.exerciseId, `Melding ${input.id}`, input.handledAt ? "DONE" : "TODO", input.createdAt, input.handledAt, input.handledAt ?? input.createdAt, issueId, input.userId, input.handledAt, input.teacherResponse ?? null] },
  ];
}

function user(id: string, displayName: string): AppUser {
  return { id, displayName, firstName: displayName.split(" ")[0], lastName: null, email: null, role: "student", status: "active", classGroupOverrideId: null };
}

function userStatement(input: AppUser) {
  return { sql: "INSERT INTO users (id, display_name, first_name, role, status, created_at, updated_at) VALUES (?, ?, ?, 'student', 'active', ?, ?)", args: [input.id, input.displayName, input.firstName, now.toISOString(), now.toISOString()] };
}

function portfolio(id: string, learningSpaceId: string, code: string, title: string) {
  return { sql: `INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, visible, is_indexed, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`, args: [id, `${learningSpaceId}:${code}`, code, learningSpaceId, title, `Portfolio ${code} - ${title}`, now.toISOString()] };
}

function section(id: string, portfolioId: string) {
  return { sql: "INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path) VALUES (?, ?, 1, 'Deel 1', ?)", args: [id, portfolioId, `${portfolioId}/Uitwerkingen/1 - Deel 1`] };
}

function exercise(id: string, portfolioId: string, sectionId: string, code: string, number: number) {
  return { sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix)
    VALUES (?, ?, ?, ?, ?, '')`, args: [id, portfolioId, sectionId, code, number] };
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
