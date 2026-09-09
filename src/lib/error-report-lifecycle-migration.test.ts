import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("error report student lifecycle migration", () => {
  it("creates migration 032 and nullable lifecycle columns in a fresh database", async () => {
    const database = await createFreshDatabase("portfolio-report-lifecycle-fresh-");

    expect((await database.execute("SELECT version FROM schema_migrations WHERE version = '032_error_report_student_lifecycle'")).rows).toHaveLength(1);
    const columns = (await database.execute("PRAGMA table_info(error_reports)")).rows;
    for (const name of ["handled_at", "student_dismissed_at", "teacher_response"]) {
      expect(columns.find((column) => column.name === name)).toMatchObject({ notnull: 0, dflt_value: null });
    }
  });

  it("upgrades an existing database without backfilling historical DONE reports", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-report-lifecycle-upgrade-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 31)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-09T08:00:00.000Z"] },
      ], "write");
    }
    await legacy.execute("PRAGMA foreign_keys = OFF");
    await legacy.execute({
      sql: `INSERT INTO error_reports
        (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, message, status,
          created_at, completed_at, updated_at)
        VALUES ('historical-done-report', 'portfolio', 'section', 'exercise', 'standard', '[]',
          'Historische melding', 'DONE', ?, ?, ?)`,
      args: ["2026-09-01T08:00:00.000Z", "2026-09-02T08:00:00.000Z", "2026-09-02T08:00:00.000Z"],
    });
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    expect((await upgraded.execute("SELECT version FROM schema_migrations WHERE version = '032_error_report_student_lifecycle'")).rows).toHaveLength(1);
    expect((await upgraded.execute("SELECT status, completed_at, handled_at, student_dismissed_at, teacher_response FROM error_reports WHERE id = 'historical-done-report'")).rows[0]).toMatchObject({
      status: "DONE",
      completed_at: "2026-09-02T08:00:00.000Z",
      handled_at: null,
      student_dismissed_at: null,
      teacher_response: null,
    });
  });
});

async function createFreshDatabase(prefix: string) {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  return getDatabase();
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
