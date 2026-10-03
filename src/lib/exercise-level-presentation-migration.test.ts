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

describe("learning space level presentation migration", () => {
  it("backfills defaults and enforces symbol and count constraints", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-level-presentation-migration-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 52)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-27T08:00:00.000Z"] },
      ], "write");
    }
    await legacy.execute("UPDATE learning_space_level_presentations SET color = '#123456' WHERE learning_space_id = 'space-6' AND level = 'basis'");
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    const rows = (await upgraded.execute("SELECT level, display_name, symbol_id, symbol_count, color, show_public_background FROM learning_space_level_presentations WHERE learning_space_id = 'space-5' ORDER BY level")).rows;
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: "opwarmer", display_name: "Opwarmer", symbol_id: "star", symbol_count: 1, color: "#00B050" }),
      expect.objectContaining({ level: "basis", display_name: "Basis", symbol_id: "star", symbol_count: 2, color: "#BF8F00" }),
      expect.objectContaining({ level: "uitdaging", display_name: "Uitdaging", symbol_id: "star", symbol_count: 3, color: "#C00000" }),
      expect.objectContaining({ level: "verdieping", display_name: "Verdieping", symbol_id: "diamond", symbol_count: 1, color: "#2E74B5" }),
    ]));
    expect(rows).toHaveLength(4);
    expect((await upgraded.execute("SELECT version FROM schema_migrations WHERE version = '049_learning_space_level_presentation'")).rows).toHaveLength(1);
    expect((await upgraded.execute("SELECT version FROM schema_migrations WHERE version = '050_learning_space_level_presentation_labels_colors'")).rows).toHaveLength(1);
    expect((await upgraded.execute("SELECT version FROM schema_migrations WHERE version = '051_learning_space_level_accent_colors'")).rows).toHaveLength(1);
    expect((await upgraded.execute("SELECT version FROM schema_migrations WHERE version = '052_learning_space_level_symbols_colors'")).rows).toHaveLength(1);
    expect((await upgraded.execute("SELECT version FROM schema_migrations WHERE version = '053_learning_space_level_public_background'")).rows).toHaveLength(1);
    expect(rows.every((row) => row.show_public_background === 0)).toBe(true);
    expect((await upgraded.execute("SELECT color FROM learning_space_level_presentations WHERE learning_space_id = 'space-6' AND level = 'basis'")).rows[0]?.color).toBe("#123456");

    await expect(upgraded.execute("UPDATE learning_space_level_presentations SET symbol_id = 'large_circle' WHERE learning_space_id = 'space-5' AND level = 'basis'"))
      .resolves.toBeDefined();

    await expect(upgraded.execute("UPDATE learning_space_level_presentations SET symbol_id = 'heart' WHERE learning_space_id = 'space-5' AND level = 'basis'"))
      .rejects.toThrow();
    await expect(upgraded.execute("UPDATE learning_space_level_presentations SET symbol_count = 0 WHERE learning_space_id = 'space-5' AND level = 'basis'"))
      .rejects.toThrow();
    await expect(upgraded.execute("UPDATE learning_space_level_presentations SET symbol_count = 5 WHERE learning_space_id = 'space-5' AND level = 'basis'"))
      .rejects.toThrow();
    await expect(upgraded.execute("UPDATE learning_space_level_presentations SET display_name = '' WHERE learning_space_id = 'space-5' AND level = 'basis'"))
      .rejects.toThrow();
    await expect(upgraded.execute("UPDATE learning_space_level_presentations SET color = 'yellow' WHERE learning_space_id = 'space-5' AND level = 'basis'"))
      .rejects.toThrow();
    await expect(upgraded.execute("UPDATE learning_space_level_presentations SET show_public_background = 2 WHERE learning_space_id = 'space-5' AND level = 'basis'"))
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
