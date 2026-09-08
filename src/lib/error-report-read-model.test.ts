import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests, type DatabaseClient } from "./database";
import {
  getAdminErrorReports,
  getGroupedErrorReportIssues,
  getOpenErrorIssueCount,
  getOpenErrorReportCount,
  listErrorReportsForIssue,
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
      message: "Melding 10",
    });
    expect(await listErrorReportsForIssue("issue-main", "space-6")).toEqual([]);
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
      (id, learning_space_id, portfolio_id, exercise_id, document_kind, variant_kind, status, pinned, admin_note, created_at, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-09-01T10:00:00.000Z', ?, ?)`,
    args: [id, learningSpaceId, portfolioId, exerciseId, documentKind, variant, status, pinned, note, status === "DONE" ? updatedAt : null, updatedAt],
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
