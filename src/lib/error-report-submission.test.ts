import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests, type DatabaseClient } from "./database";
import { normalizeErrorReportExerciseCode } from "./error-report-exercise-code";
import { createErrorReport } from "./repositories";

let temporaryDirectory: string | undefined;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-error-submission-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await seedSubmissionFixture(await getDatabase());
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("error report v2 submission", () => {
  it("normalizes simple exercise codes without fuzzy matching", () => {
    expect(normalizeErrorReportExerciseCode(" 11A ")).toBe("11a");
    expect(normalizeErrorReportExerciseCode("5")).toBe("5");
    expect(normalizeErrorReportExerciseCode("5 a")).toBeNull();
    expect(normalizeErrorReportExerciseCode("oef 5")).toBeNull();
  });

  it("matches a known code exactly within the current portfolio", async () => {
    const result = await createErrorReport(submission({ exerciseId: undefined, exerciseCode: " 5B ", rateLimitKey: "known-code" }));
    const issue = (await (await getDatabase()).execute({ sql: "SELECT exercise_id, exercise_code FROM error_report_issues WHERE id = ?", args: [result.issueId] })).rows[0];

    expect(issue).toMatchObject({ exercise_id: "submission-exercise", exercise_code: "5b" });
  });

  it("groups unknown codes by normalized code, document and portfolio", async () => {
    const first = await createErrorReport(submission({ exerciseId: undefined, exerciseCode: " 11A ", rateLimitKey: "unknown-first" }));
    const repeated = await createErrorReport(submission({ exerciseId: undefined, exerciseCode: "11a", reporterUserId: "report-user-2", rateLimitKey: "unknown-repeat" }));
    const otherDocument = await createErrorReport(submission({ exerciseId: undefined, exerciseCode: "11a", documentKind: "hints", rateLimitKey: "unknown-document" }));
    const otherPortfolio = await createErrorReport(submission({ exerciseId: undefined, exerciseCode: "11a", portfolioId: "other-portfolio", rateLimitKey: "unknown-portfolio" }));
    const database = await getDatabase();
    const issue = (await database.execute({ sql: "SELECT exercise_id, exercise_code, thread_id FROM error_report_issues WHERE id = ?", args: [first.issueId] })).rows[0];
    const otherDocumentIssue = (await database.execute({ sql: "SELECT thread_id FROM error_report_issues WHERE id = ?", args: [otherDocument.issueId] })).rows[0];
    const otherPortfolioIssue = (await database.execute({ sql: "SELECT thread_id FROM error_report_issues WHERE id = ?", args: [otherPortfolio.issueId] })).rows[0];

    expect(repeated.issueId).toBe(first.issueId);
    expect(otherDocument.issueId).not.toBe(first.issueId);
    expect(otherPortfolio.issueId).not.toBe(first.issueId);
    expect(issue).toMatchObject({ exercise_id: null, exercise_code: "11a" });
    expect(otherDocumentIssue?.thread_id).toBe(issue?.thread_id);
    expect(otherPortfolioIssue?.thread_id).not.toBe(issue?.thread_id);
  });

  it("allows unknown assignment and final-solution reports but never guesses an alternative", async () => {
    const assignment = await createErrorReport(submission({ exerciseId: undefined, exerciseCode: "11", documentKind: "assignment", rateLimitKey: "unknown-assignment" }));
    const solutions = await createErrorReport(submission({ exerciseId: undefined, exerciseCode: "12b", documentKind: "final_solutions", variant: "standard", rateLimitKey: "unknown-solutions" }));

    expect(assignment.issueId).toBeTruthy();
    expect(solutions.issueId).toBeTruthy();
    await expect(createErrorReport(submission({ exerciseId: undefined, exerciseCode: "13", documentKind: "final_solutions", variant: "alternative", rateLimitKey: "unknown-alternative" }))).rejects.toThrow("alleen de standaarduitwerking");
  });

  it("does not match an exercise from another portfolio or a merely similar code", async () => {
    const otherPortfolioCode = await createErrorReport(submission({ exerciseId: undefined, exerciseCode: "1", rateLimitKey: "other-portfolio-code" }));
    const similarCode = await createErrorReport(submission({ exerciseId: undefined, exerciseCode: "5", rateLimitKey: "similar-code" }));
    const database = await getDatabase();

    expect((await database.execute({ sql: "SELECT exercise_id FROM error_report_issues WHERE id = ?", args: [otherPortfolioCode.issueId] })).rows[0]?.exercise_id).toBeNull();
    expect((await database.execute({ sql: "SELECT exercise_id FROM error_report_issues WHERE id = ?", args: [similarCode.issueId] })).rows[0]?.exercise_id).toBeNull();
  });

  it.each([
    ["assignment", null],
    ["final_solutions", "standard"],
    ["hints", null],
  ] as const)("creates and links a %s issue for the authenticated reporter", async (documentKind, variant) => {
    const result = await createErrorReport(submission({ documentKind, variant, reporterUserId: "report-user-1", rateLimitKey: `kind-${documentKind}` }));
    const database = await getDatabase();
    const issue = (await database.execute({ sql: "SELECT * FROM error_report_issues WHERE id = ?", args: [result.issueId] })).rows[0];
    const report = (await database.execute({ sql: "SELECT * FROM error_reports WHERE issue_id = ?", args: [result.issueId] })).rows[0];

    expect(issue).toMatchObject({ document_kind: documentKind, variant_kind: variant, portfolio_id: "submission-portfolio" });
    expect(report).toMatchObject({ reporter_user_id: "report-user-1", reporter_name: null, issue_id: result.issueId });
  });

  it("validates portfolio ownership, document presence and alternative availability", async () => {
    await expect(createErrorReport(submission({ portfolioId: "other-portfolio", documentKind: "assignment", variant: null, rateLimitKey: "wrong-portfolio" }))).rejects.toThrow("hoort niet bij");
    await expect(createErrorReport(submission({ portfolioId: "other-portfolio", exerciseId: "other-exercise", documentKind: "hints", variant: null, rateLimitKey: "missing-document" }))).rejects.toThrow("niet beschikbaar");
    await expect(createErrorReport(submission({ exerciseId: "submission-exercise-no-alt", documentKind: "final_solutions", variant: "alternative", rateLimitKey: "missing-alternative" }))).rejects.toThrow("alternatieve uitwerking");

    const validAlternative = await createErrorReport(submission({ documentKind: "final_solutions", variant: "alternative", rateLimitKey: "valid-alternative" }));
    expect((await (await getDatabase()).execute({ sql: "SELECT variant_kind FROM error_report_issues WHERE id = ?", args: [validAlternative.issueId] })).rows[0]?.variant_kind).toBe("alternative");
  });

  it("updates the same user's report, shares the issue with other users and safely reopens DONE", async () => {
    const first = await createErrorReport(submission({ documentKind: "assignment", variant: null, reporterUserId: "report-user-1", message: "Eerste melding", rateLimitKey: "first" }));
    const database = await getDatabase();
    await database.execute({
      sql: "UPDATE error_report_issues SET status = 'DONE', completed_at = '2026-09-08T12:00:00.000Z', pinned = 1, admin_note = 'Behouden notitie' WHERE id = ?",
      args: [first.issueId],
    });
    await database.execute({
      sql: `UPDATE error_report_threads SET status = 'DONE', completed_at = '2026-09-08T12:00:00.000Z'
        WHERE id = (SELECT thread_id FROM error_report_issues WHERE id = ?)`,
      args: [first.issueId],
    });
    await database.execute({
      sql: `UPDATE error_reports SET handled_at = '2026-09-08T12:00:00.000Z',
        student_dismissed_at = '2026-09-08T13:00:00.000Z', teacher_response = 'Oude reactie'
        WHERE issue_id = ? AND reporter_user_id = 'report-user-1'`,
      args: [first.issueId],
    });

    const updated = await createErrorReport(submission({ documentKind: "assignment", variant: null, reporterUserId: "report-user-1", message: "Bijgewerkte melding", rateLimitKey: "second" }));
    const secondUser = await createErrorReport(submission({ documentKind: "assignment", variant: null, reporterUserId: "report-user-2", message: "Andere leerling", rateLimitKey: "third" }));
    const issue = (await database.execute({ sql: "SELECT * FROM error_report_issues WHERE id = ?", args: [first.issueId] })).rows[0];
    const thread = (await database.execute({ sql: "SELECT * FROM error_report_threads WHERE id = ?", args: [issue?.thread_id as string] })).rows[0];
    const reports = (await database.execute({
      sql: `SELECT reporter_user_id, message, handled_at, student_dismissed_at, teacher_response
        FROM error_reports WHERE issue_id = ? ORDER BY reporter_user_id`,
      args: [first.issueId],
    })).rows;

    expect(updated.issueId).toBe(first.issueId);
    expect(secondUser.issueId).toBe(first.issueId);
    expect(reports).toEqual([
      expect.objectContaining({ reporter_user_id: "report-user-1", message: "Bijgewerkte melding", handled_at: null, student_dismissed_at: null, teacher_response: null }),
      expect.objectContaining({ reporter_user_id: "report-user-2", message: "Andere leerling", handled_at: null, student_dismissed_at: null, teacher_response: null }),
    ]);
    expect(issue).toMatchObject({ status: "TODO", completed_at: null, pinned: 1, admin_note: "Behouden notitie" });
    expect(thread).toMatchObject({ status: "TODO", completed_at: "2026-09-08T12:00:00.000Z" });
  });

  it("automatically reopens the thread without changing existing reports and creates the new report open", async () => {
    const first = await createErrorReport(submission({ reporterUserId: "report-user-1", rateLimitKey: "auto-first" }));
    await createErrorReport(submission({ reporterUserId: "report-user-2", rateLimitKey: "auto-second" }));
    const database = await getDatabase();
    await database.execute("INSERT INTO users (id, display_name, role, status, created_at, updated_at) VALUES ('report-user-3', 'Derde leerling', 'student', 'active', '2026-09-08T10:00:00.000Z', '2026-09-08T10:00:00.000Z')");
    await database.execute({
      sql: `UPDATE error_reports SET handled_at = '2026-09-08T12:00:00.000Z',
        student_dismissed_at = '2026-09-08T13:00:00.000Z', teacher_response = 'Bestaande reactie'
        WHERE issue_id = ?`,
      args: [first.issueId],
    });
    await database.execute({
      sql: `UPDATE error_report_threads SET status = 'DONE', completed_at = '2026-09-08T12:00:00.000Z'
        WHERE id = (SELECT thread_id FROM error_report_issues WHERE id = ?)`,
      args: [first.issueId],
    });

    await createErrorReport(submission({ reporterUserId: "report-user-3", rateLimitKey: "auto-third" }));

    const reports = (await database.execute({
      sql: `SELECT reporter_user_id, handled_at, student_dismissed_at, teacher_response
        FROM error_reports WHERE issue_id = ? ORDER BY reporter_user_id`,
      args: [first.issueId],
    })).rows;
    expect(reports.slice(0, 2)).toEqual([
      expect.objectContaining({ reporter_user_id: "report-user-1", handled_at: "2026-09-08T12:00:00.000Z", student_dismissed_at: "2026-09-08T13:00:00.000Z", teacher_response: "Bestaande reactie" }),
      expect.objectContaining({ reporter_user_id: "report-user-2", handled_at: "2026-09-08T12:00:00.000Z", student_dismissed_at: "2026-09-08T13:00:00.000Z", teacher_response: "Bestaande reactie" }),
    ]);
    expect(reports[2]).toMatchObject({ reporter_user_id: "report-user-3", handled_at: null, student_dismissed_at: null, teacher_response: null });
    expect((await database.execute({ sql: "SELECT status, completed_at FROM error_report_threads WHERE id = (SELECT thread_id FROM error_report_issues WHERE id = ?)", args: [first.issueId] })).rows[0]).toMatchObject({
      status: "TODO",
      completed_at: "2026-09-08T12:00:00.000Z",
    });
  });

  it("groups document issues for one exercise into one race-safe thread", async () => {
    const [assignment, solutions] = await Promise.all([
      createErrorReport(submission({ documentKind: "assignment", variant: null, rateLimitKey: "thread-assignment" })),
      createErrorReport(submission({ documentKind: "final_solutions", variant: "standard", rateLimitKey: "thread-solutions" })),
    ]);
    const database = await getDatabase();
    const issues = (await database.execute({
      sql: "SELECT id, thread_id, document_kind FROM error_report_issues WHERE id IN (?, ?) ORDER BY document_kind",
      args: [assignment.issueId, solutions.issueId],
    })).rows;

    expect(issues).toHaveLength(2);
    expect(new Set(issues.map((issue) => issue.thread_id)).size).toBe(1);
    expect(issues.map((issue) => issue.document_kind)).toEqual(["assignment", "final_solutions"]);
    expect((await database.execute("SELECT id FROM error_report_threads WHERE portfolio_id = 'submission-portfolio' AND exercise_id = 'submission-exercise'")).rows).toHaveLength(1);
  });

  it("rejects hidden public content and retains the existing rate limit", async () => {
    const database = await getDatabase();
    await database.execute("UPDATE portfolios SET visible = 0 WHERE id = 'submission-portfolio'");
    await expect(createErrorReport(submission({ documentKind: "assignment", variant: null, rateLimitKey: "hidden" }))).rejects.toThrow("niet beschikbaar");
    expect((await database.execute("SELECT id FROM error_reports")).rows).toHaveLength(0);

    await database.execute("UPDATE portfolios SET visible = 1 WHERE id = 'submission-portfolio'");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await createErrorReport(submission({ documentKind: "assignment", variant: null, message: `Melding ${attempt}`, rateLimitKey: "limited" }));
    }
    await expect(createErrorReport(submission({ documentKind: "assignment", variant: null, message: "Zesde melding", rateLimitKey: "limited" }))).rejects.toThrow("Probeer later opnieuw");
  });

  it("stores solution-page submissions as exercise solutions on the shared write path", async () => {
    const result = await createErrorReport({
      exerciseId: "submission-exercise",
      learningSpaceId: "space-5",
      documentKind: "exercise_solution",
      variant: "standard",
      message: "Fout in de getoonde uitwerking",
      reporterUserId: "report-user-1",
      rateLimitKey: "legacy-solution",
    });
    const database = await getDatabase();
    expect((await database.execute({ sql: "SELECT document_kind, variant_kind FROM error_report_issues WHERE id = ?", args: [result.issueId] })).rows[0]).toMatchObject({
      document_kind: "exercise_solution",
      variant_kind: "standard",
    });
    expect((await database.execute({ sql: "SELECT issue_id, reporter_user_id FROM error_reports WHERE issue_id = ?", args: [result.issueId] })).rows[0]).toMatchObject({
      issue_id: result.issueId,
      reporter_user_id: "report-user-1",
    });
  });
});

function submission(overrides: Partial<Parameters<typeof createErrorReport>[0]> = {}): Parameters<typeof createErrorReport>[0] {
  return {
    exerciseId: "submission-exercise",
    learningSpaceId: "space-5",
    portfolioId: "submission-portfolio",
    documentKind: "assignment",
    variant: null,
    message: "Er staat een fout in dit document.",
    reporterUserId: "report-user-1",
    rateLimitKey: "submission",
    ...overrides,
  };
}

async function seedSubmissionFixture(database: DatabaseClient): Promise<void> {
  await database.batch([
    user("report-user-1", "Eerste leerling"),
    user("report-user-2", "Tweede leerling"),
    portfolio("submission-portfolio", "space-5", "1", true),
    portfolio("other-portfolio", "space-5", "2", false),
    section("submission-section", "submission-portfolio"),
    section("other-section", "other-portfolio"),
    exercise("submission-exercise", "submission-portfolio", "submission-section", "5b"),
    exercise("submission-exercise-no-alt", "submission-portfolio", "submission-section", "2"),
    exercise("other-exercise", "other-portfolio", "other-section", "1"),
    variant("submission-standard", "submission-exercise", "standard"),
    variant("submission-alternative", "submission-exercise", "alternative"),
    variant("submission-no-alt-standard", "submission-exercise-no-alt", "standard"),
    variant("other-standard", "other-exercise", "standard"),
    asset("submission-standard-asset", "submission-standard", "PF1-Oef1.png"),
    asset("submission-alternative-asset", "submission-alternative", "PF1-Oef1-alt.png"),
    asset("submission-no-alt-standard-asset", "submission-no-alt-standard", "PF1-Oef2.png"),
    asset("other-standard-asset", "other-standard", "PF2-Oef1.png"),
  ]);
}

function user(id: string, displayName: string) {
  return { sql: `INSERT INTO users (id, display_name, role, status, created_at, updated_at)
    VALUES (?, ?, 'student', 'active', '2026-09-08T10:00:00.000Z', '2026-09-08T10:00:00.000Z')`, args: [id, displayName] };
}

function portfolio(id: string, learningSpaceId: string, code: string, allDocuments: boolean) {
  return { sql: `INSERT INTO portfolios
    (id, code, portfolio_code, learning_space_id, title, relative_path, assignment_pdf_path, hints_document_path,
      final_solutions_pdf_path, visible, is_indexed, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, '2026-09-08T10:00:00.000Z')`, args: [
      id, `${learningSpaceId}:${code}`, code, learningSpaceId, `Portfolio ${code}`, `Portfolio ${code}`,
      `${id}/Portfolio ${code}.pdf`, allDocuments ? `${id}/Hints portfolio ${code}.pdf` : null,
      allDocuments ? `${id}/Eindoplossingen portfolio ${code}.pdf` : null,
    ] };
}

function section(id: string, portfolioId: string) {
  return { sql: `INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path, visibility_mode)
    VALUES (?, ?, 1, 'Deel 1', ?, 'visible')`, args: [id, portfolioId, `${portfolioId}/Uitwerkingen/1 - Deel`] };
}

function exercise(id: string, portfolioId: string, sectionId: string, code: string) {
  return { sql: `INSERT INTO exercises
    (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, visibility_mode, show_alternative_to_students)
    VALUES (?, ?, ?, ?, 1, '', 'visible', 1)`, args: [id, portfolioId, sectionId, code] };
}

function variant(id: string, exerciseId: string, kind: "standard" | "alternative") {
  return { sql: "INSERT INTO solution_variants (id, exercise_id, kind, label) VALUES (?, ?, ?, ?)", args: [id, exerciseId, kind, kind] };
}

function asset(id: string, variantId: string, fileName: string) {
  return { sql: `INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step)
    VALUES (?, ?, ?, ?, 'png', 1)`, args: [id, variantId, `Uitwerkingen/${fileName}`, fileName] };
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
