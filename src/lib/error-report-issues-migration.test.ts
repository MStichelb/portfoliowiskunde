import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import { getAdminErrorReports, getErrorReportIssue, getOpenErrorReportCount } from "./repositories";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("grouped error report issue migration", () => {
  it("creates the additive issue schema in a fresh database", async () => {
    const database = await createFreshDatabase("portfolio-error-issues-fresh-");

    expect((await database.execute("SELECT version FROM schema_migrations WHERE version = '029_error_report_threads'")).rows).toHaveLength(1);
    const threadColumns = (await database.execute("PRAGMA table_info(error_report_threads)")).rows;
    expect(threadColumns.map((row) => row.name)).toEqual(expect.arrayContaining([
      "id", "learning_space_id", "portfolio_id", "exercise_id", "exercise_code", "status", "pinned",
      "admin_note", "created_at", "completed_at", "updated_at",
    ]));
    const issueColumns = (await database.execute("PRAGMA table_info(error_report_issues)")).rows;
    expect(issueColumns.map((row) => row.name)).toEqual(expect.arrayContaining([
      "id", "thread_id", "learning_space_id", "portfolio_id", "exercise_id", "exercise_code", "document_kind", "variant_kind",
      "status", "pinned", "admin_note", "created_at", "completed_at", "updated_at",
    ]));
    expect(issueColumns.find((row) => row.name === "exercise_id")?.notnull).toBe(0);
    expect((await database.execute("PRAGMA table_info(error_reports)")).rows.map((row) => row.name)).toEqual(expect.arrayContaining([
      "issue_id", "reporter_user_id", "reporter_name", "status", "pinned", "admin_note",
    ]));
  });

  it("groups legacy solution reports by their complete logical location without losing report data", async () => {
    const database = await upgradeLegacyFixture();
    const issues = (await database.execute(`SELECT * FROM error_report_issues
      ORDER BY portfolio_id, exercise_id, variant_kind`)).rows;
    const threads = (await database.execute("SELECT * FROM error_report_threads ORDER BY portfolio_id, exercise_id")).rows;
    const reports = (await database.execute("SELECT * FROM error_reports ORDER BY id")).rows;

    expect(issues).toHaveLength(4);
    expect(threads).toHaveLength(3);
    expect(issues.every((issue) => typeof issue.thread_id === "string" && issue.thread_id.length > 0)).toBe(true);
    expect(reports).toHaveLength(13);
    expect(reports.every((report) => typeof report.issue_id === "string" && report.issue_id.length > 0)).toBe(true);
    expect(reports.every((report) => report.reporter_user_id === null)).toBe(true);
    expect(reports.find((report) => report.id === "report-00")?.reporter_name).toBe("Noor Janssens");
    expect(reports.filter((report) => /^report-\d{2}$/.test(String(report.id))).map((report) => report.message)).toHaveLength(10);

    const standardIssue = issues.find((issue) => issue.portfolio_id === "issue-portfolio-1" && issue.exercise_id === "issue-exercise-1" && issue.variant_kind === "standard");
    expect(standardIssue).toMatchObject({
      exercise_code: "1",
      document_kind: "final_solutions",
      status: "TODO",
      pinned: 1,
      admin_note: "",
      created_at: "2026-08-01T10:00:00.000Z",
      completed_at: null,
      updated_at: "2026-08-10T10:00:00.000Z",
    });
    expect(reports.filter((report) => report.issue_id === standardIssue?.id)).toHaveLength(10);
    expect((await database.execute({
      sql: `SELECT admin_note FROM error_reports
        WHERE issue_id = ? AND TRIM(admin_note) <> '' ORDER BY admin_note`,
      args: [String(standardIssue?.id)],
    })).rows.map((row) => row.admin_note)).toEqual([
      "Eerste analyse",
      "Tweede analyse",
    ]);

    const alternativeIssue = issues.find((issue) => issue.exercise_id === "issue-exercise-1" && issue.variant_kind === "alternative");
    const secondExerciseIssue = issues.find((issue) => issue.exercise_id === "issue-exercise-2");
    const secondPortfolioIssue = issues.find((issue) => issue.portfolio_id === "issue-portfolio-2");
    expect(alternativeIssue?.id).not.toBe(standardIssue?.id);
    expect(secondExerciseIssue?.id).not.toBe(standardIssue?.id);
    expect(secondPortfolioIssue?.id).not.toBe(standardIssue?.id);
    expect(alternativeIssue).toMatchObject({ status: "DONE", completed_at: "2026-08-12T10:00:00.000Z" });
    expect(secondPortfolioIssue).toMatchObject({ admin_note: "Enige portfolionotitie" });
    expect(alternativeIssue?.thread_id).toBe(standardIssue?.thread_id);
    expect(threads.find((thread) => thread.id === standardIssue?.thread_id)).toMatchObject({
      status: "TODO",
      pinned: 1,
      created_at: "2026-08-01T10:00:00.000Z",
      updated_at: "2026-08-12T10:00:00.000Z",
      completed_at: null,
    });

    const loaded = await getErrorReportIssue(String(secondPortfolioIssue?.id));
    expect(loaded).toMatchObject({
      learningSpaceId: "space-5",
      portfolioId: "issue-portfolio-2",
      exerciseId: "issue-exercise-3",
      documentKind: "final_solutions",
      variantKind: "standard",
      status: "DONE",
      adminNote: "Enige portfolionotitie",
    });
  });

  it("consolidates issue workflow conservatively without losing distinct notes", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-error-threads-legacy-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 28)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-08T10:00:00.000Z"] },
      ], "write");
    }
    await legacy.batch([
      { sql: `INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, is_indexed, indexed_at)
        VALUES ('thread-portfolio', 'space-5:thread', '9', 'space-5', 'Threadtest', 'Portfolio 9 - Threadtest', 1, '2026-09-08T10:00:00.000Z')`, args: [] },
      { sql: `INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path)
        VALUES ('thread-section', 'thread-portfolio', 1, 'Deel', 'Portfolio 9 - Threadtest/Uitwerkingen/1 - Deel')`, args: [] },
      { sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix)
        VALUES ('thread-exercise', 'thread-portfolio', 'thread-section', '12i', 12, 'i')`, args: [] },
      { sql: `INSERT INTO error_report_issues
        (id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, variant_kind,
          status, pinned, admin_note, created_at, completed_at, updated_at)
        VALUES ('thread-assignment-issue', 'space-5', 'thread-portfolio', 'thread-exercise', '12i', 'assignment', NULL,
          'DONE', 0, 'Notitie opgaven', '2026-09-01T10:00:00.000Z', '2026-09-02T10:00:00.000Z', '2026-09-02T10:00:00.000Z')`, args: [] },
      { sql: `INSERT INTO error_report_issues
        (id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, variant_kind,
          status, pinned, admin_note, created_at, completed_at, updated_at)
        VALUES ('thread-hints-issue', 'space-5', 'thread-portfolio', 'thread-exercise', '12i', 'hints', NULL,
          'TODO', 1, 'Notitie hints', '2026-09-03T10:00:00.000Z', NULL, '2026-09-04T10:00:00.000Z')`, args: [] },
    ], "write");
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    const thread = (await upgraded.execute("SELECT * FROM error_report_threads WHERE portfolio_id = 'thread-portfolio'")).rows[0];
    const issues = (await upgraded.execute("SELECT thread_id, admin_note FROM error_report_issues WHERE portfolio_id = 'thread-portfolio' ORDER BY id")).rows;

    expect(thread).toMatchObject({
      status: "TODO",
      pinned: 1,
      admin_note: "",
      created_at: "2026-09-01T10:00:00.000Z",
      completed_at: null,
      updated_at: "2026-09-04T10:00:00.000Z",
    });
    expect(issues.map((issue) => issue.admin_note)).toEqual(["Notitie opgaven", "Notitie hints"]);
    expect(new Set(issues.map((issue) => issue.thread_id)).size).toBe(1);
  });

  it("enforces null-safe issue identity while allowing distinct authenticated reports", async () => {
    const database = await upgradeLegacyFixture();
    const now = "2026-09-08T10:00:00.000Z";
    const matchedThreadId = String((await database.execute("SELECT thread_id FROM error_report_issues WHERE exercise_id = 'issue-exercise-1' LIMIT 1")).rows[0]?.thread_id);
    const issueArgs = [matchedThreadId, "space-5", "issue-portfolio-1", "issue-exercise-1", "1", now, now];

    await database.execute({
      sql: `INSERT INTO error_report_issues
        (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, variant_kind, status, pinned, admin_note, created_at, updated_at)
        VALUES ('assignment-issue', ?, ?, ?, ?, ?, 'assignment', NULL, 'TODO', 0, '', ?, ?)`,
      args: issueArgs,
    });
    await expect(database.execute({
      sql: `INSERT INTO error_report_issues
        (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, variant_kind, status, pinned, admin_note, created_at, updated_at)
        VALUES ('assignment-duplicate', ?, ?, ?, ?, ?, 'assignment', NULL, 'TODO', 0, '', ?, ?)`,
      args: issueArgs,
    })).rejects.toThrow();
    await database.execute({
      sql: `INSERT INTO error_report_issues
        (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, variant_kind, status, pinned, admin_note, created_at, updated_at)
        VALUES ('hints-issue', ?, ?, ?, ?, ?, 'hints', NULL, 'TODO', 0, '', ?, ?)`,
      args: issueArgs,
    });
    await database.execute({
      sql: `INSERT INTO error_report_issues
        (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, variant_kind, status, pinned, admin_note, created_at, updated_at)
        VALUES ('exercise-solution-issue', ?, ?, ?, ?, ?, 'exercise_solution', 'standard', 'TODO', 0, '', ?, ?)`,
      args: issueArgs,
    });

    await insertReport(database, "authenticated-report", "assignment-issue", "user-legacy-superadmin", now);
    await insertReport(database, "authenticated-duplicate", "assignment-issue", "user-legacy-superadmin", now);
    await insertReport(database, "anonymous-a", "assignment-issue", null, now);
    await insertReport(database, "anonymous-b", "assignment-issue", null, now);
    expect((await database.execute("SELECT id FROM error_reports WHERE issue_id = 'assignment-issue'")).rows).toHaveLength(4);

    await database.execute({
      sql: `INSERT INTO error_report_threads
        (id, learning_space_id, portfolio_id, exercise_id, exercise_code, status, pinned, admin_note, created_at, updated_at)
        VALUES ('unmatched-thread', 'space-5', 'issue-portfolio-1', NULL, '11', 'TODO', 0, '', ?, ?)`,
      args: [now, now],
    });
    const unmatchedArgs = ["unmatched-thread", "space-5", "issue-portfolio-1", "11", now, now];
    await database.execute({
      sql: `INSERT INTO error_report_issues
        (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, variant_kind, status, pinned, admin_note, created_at, updated_at)
        VALUES ('unmatched-issue', ?, ?, ?, NULL, ?, 'assignment', NULL, 'TODO', 0, '', ?, ?)`,
      args: unmatchedArgs,
    });
    await expect(database.execute({
      sql: `INSERT INTO error_report_issues
        (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, variant_kind, status, pinned, admin_note, created_at, updated_at)
        VALUES ('unmatched-duplicate', ?, ?, ?, NULL, ?, 'assignment', NULL, 'TODO', 0, '', ?, ?)`,
      args: unmatchedArgs,
    })).rejects.toThrow();
  });

  it("keeps the existing report-level reads working before the grouped D2 read model", async () => {
    await upgradeLegacyFixture();

    const reports = await getAdminErrorReports("space-5");
    expect(reports).toHaveLength(13);
    expect(reports.find((report) => report.id === "report-00")).toMatchObject({
      reporterName: "Noor Janssens",
      status: "TODO",
      pinned: false,
      adminNote: "Eerste analyse",
    });
    expect(await getOpenErrorReportCount("space-5")).toBe(1);
  });
});

async function createFreshDatabase(prefix: string) {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  return getDatabase();
}

async function upgradeLegacyFixture() {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-error-issues-legacy-"));
  const databasePath = path.join(temporaryDirectory, "metadata.db");
  const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
  await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 26)) {
    await legacy.batch([
      ...migration.statements.map((sql) => ({ sql, args: [] })),
      { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-07T10:00:00.000Z"] },
    ], "write");
  }
  await insertLegacyLocations(legacy);
  await insertLegacyReports(legacy);
  legacy.close();

  process.env.PORTFOLIO_DATABASE_PATH = databasePath;
  resetDatabaseForTests();
  return getDatabase();
}

async function insertLegacyLocations(database: Client) {
  await database.batch([
    { sql: `INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, is_indexed, indexed_at)
      VALUES ('issue-portfolio-1', 'space-5:1', '1', 'space-5', 'Eerste portfolio', 'Portfolio 1 - Eerste', 1, '2026-08-01T10:00:00.000Z')`, args: [] },
    { sql: `INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, is_indexed, indexed_at)
      VALUES ('issue-portfolio-2', 'space-5:2', '2', 'space-5', 'Tweede portfolio', 'Portfolio 2 - Tweede', 1, '2026-08-01T10:00:00.000Z')`, args: [] },
    { sql: `INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path)
      VALUES ('issue-section-1', 'issue-portfolio-1', 1, 'Eerste deel', 'Portfolio 1 - Eerste/Uitwerkingen/1 - Eerste')`, args: [] },
    { sql: `INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path)
      VALUES ('issue-section-2', 'issue-portfolio-2', 1, 'Tweede deel', 'Portfolio 2 - Tweede/Uitwerkingen/1 - Tweede')`, args: [] },
    { sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix)
      VALUES ('issue-exercise-1', 'issue-portfolio-1', 'issue-section-1', '1', 1, '')`, args: [] },
    { sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix)
      VALUES ('issue-exercise-2', 'issue-portfolio-1', 'issue-section-1', '2', 2, '')`, args: [] },
    { sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix)
      VALUES ('issue-exercise-3', 'issue-portfolio-2', 'issue-section-2', '1', 1, '')`, args: [] },
  ], "write");
}

async function insertLegacyReports(database: Client) {
  const reports = Array.from({ length: 10 }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return {
      sql: `INSERT INTO error_reports
        (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, message, reporter_name, status, pinned, admin_note, created_at, completed_at, updated_at)
        VALUES (?, 'issue-portfolio-1', 'issue-section-1', 'issue-exercise-1', 'standard', '[]', ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        `report-${String(index).padStart(2, "0")}`,
        `Melding ${index + 1}`,
        index === 0 ? "Noor Janssens" : null,
        index === 0 ? "TODO" : "DONE",
        index === 4 ? 1 : 0,
        index === 0 ? "Eerste analyse" : index === 1 ? "Tweede analyse" : "",
        `2026-08-${day}T10:00:00.000Z`,
        index === 0 ? null : `2026-08-${day}T11:00:00.000Z`,
        `2026-08-${day}T10:00:00.000Z`,
      ],
    };
  });
  await database.batch([
    ...reports,
    legacyReport("report-alternative", "issue-portfolio-1", "issue-section-1", "issue-exercise-1", "alternative", "Alternatieve melding", "Alternatief nagekeken", "2026-08-12T10:00:00.000Z"),
    legacyReport("report-exercise-2", "issue-portfolio-1", "issue-section-1", "issue-exercise-2", "standard", "Andere oefening", "", "2026-08-13T10:00:00.000Z"),
    legacyReport("report-portfolio-2", "issue-portfolio-2", "issue-section-2", "issue-exercise-3", "standard", "Andere portfolio", "Enige portfolionotitie", "2026-08-14T10:00:00.000Z"),
  ], "write");
}

function legacyReport(id: string, portfolioId: string, sectionId: string, exerciseId: string, variant: string, message: string, note: string, timestamp: string) {
  return {
    sql: `INSERT INTO error_reports
      (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, message, status, pinned, admin_note, created_at, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, '[]', ?, 'DONE', 0, ?, ?, ?, ?)`,
    args: [id, portfolioId, sectionId, exerciseId, variant, message, note, timestamp, timestamp, timestamp],
  };
}

async function insertReport(database: Awaited<ReturnType<typeof getDatabase>>, id: string, issueId: string, reporterUserId: string | null, timestamp: string) {
  await database.execute({
    sql: `INSERT INTO error_reports
      (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, message, status, pinned, admin_note, created_at, updated_at, issue_id, reporter_user_id)
      VALUES (?, 'issue-portfolio-1', 'issue-section-1', 'issue-exercise-1', 'standard', '[]', 'Nieuwe melding', 'TODO', 0, '', ?, ?, ?, ?)`,
    args: [id, timestamp, timestamp, issueId, reporterUserId],
  });
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
