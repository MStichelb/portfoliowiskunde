import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import { exerciseLevelMetadata } from "./exercise-level";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("exercise level migration", () => {
  it("adds constrained defaults without replacing existing exercises", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-migration-exercise-level-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 47)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-27T08:00:00.000Z"] },
      ], "write");
    }
    await legacy.batch([
      { sql: `INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, is_indexed, indexed_at)
          VALUES ('level-portfolio', 'space-5:91', '91', 'space-5', 'Bestaand', 'Portfolio 91 - Bestaand', 1, '2026-09-27T08:00:00.000Z')`, args: [] },
      { sql: `INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path)
          VALUES ('level-section', 'level-portfolio', 1, 'Bestaand', 'Portfolio 91 - Bestaand/Uitwerkingen/1 - Bestaand')`, args: [] },
      { sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix)
          VALUES ('level-exercise', 'level-portfolio', 'level-section', '1', 1, '')`, args: [] },
    ], "write");
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    const migratedExercise = (await upgraded.execute("SELECT id, level_source, level_override_mode, level_override FROM exercises WHERE id = 'level-exercise'")).rows[0];
    expect(migratedExercise).toMatchObject({ id: "level-exercise", level_source: null, level_override_mode: "inherit", level_override: null });
    expect(exerciseLevelMetadata({
      levelSource: migratedExercise.level_source,
      levelOverrideMode: migratedExercise.level_override_mode,
      levelOverride: migratedExercise.level_override,
    }).effectiveLevel).toBeNull();
    expect((await upgraded.execute("SELECT version FROM schema_migrations WHERE version = '048_exercise_levels'")).rows).toHaveLength(1);

    for (const level of ["opwarmer", "basis", "uitdaging", "verdieping"]) {
      await expect(upgraded.execute({
        sql: "UPDATE exercises SET level_source = ?, level_override_mode = 'level', level_override = ? WHERE id = 'level-exercise'",
        args: [level, level],
      })).resolves.toBeDefined();
    }
    await expect(upgraded.execute("UPDATE exercises SET level_source = 'expert' WHERE id = 'level-exercise'"))
      .rejects.toThrow();
    await expect(upgraded.execute("UPDATE exercises SET level_override_mode = 'automatic' WHERE id = 'level-exercise'"))
      .rejects.toThrow();
    await expect(upgraded.execute("UPDATE exercises SET level_override = 'expert' WHERE id = 'level-exercise'"))
      .rejects.toThrow();
    await upgraded.execute("UPDATE exercises SET level_override_mode = 'inherit', level_override = NULL WHERE id = 'level-exercise'");
    await expect(upgraded.execute("UPDATE exercises SET level_override_mode = 'level' WHERE id = 'level-exercise'"))
      .rejects.toThrow();
  });
});

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
