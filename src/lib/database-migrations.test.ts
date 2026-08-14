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

describe("Google Drive LearningSpace migration", () => {
  it("upgrades an existing version 013 database without losing OneDrive or unrelated metadata", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-migration-013-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 13)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-08-14T10:00:00.000Z"] },
      ], "write");
    }
    await legacy.execute({
      sql: "UPDATE learning_spaces SET storage_provider = 'onedrive', onedrive_drive_id = ?, onedrive_folder_id = ?, onedrive_folder_path = ? WHERE id = 'space-6'",
      args: ["drive-existing", "folder-existing", "Wiskunde/6"],
    });
    await legacy.execute({
      sql: "INSERT INTO themes (id, learning_space_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: ["theme-preserved", "space-6", "Integralen", 1, "2026-08-14T10:00:00.000Z", "2026-08-14T10:00:00.000Z"],
    });
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    const space = (await upgraded.execute("SELECT * FROM learning_spaces WHERE id = 'space-6'")).rows[0];
    expect(space).toMatchObject({
      archived_at: null,
      is_active: 1,
      source_type: "onedrive",
      storage_provider: "onedrive",
      onedrive_drive_id: "drive-existing",
      onedrive_folder_id: "folder-existing",
      onedrive_folder_path: "Wiskunde/6",
      google_drive_folder_id: null,
      google_drive_folder_label: null,
    });
    expect((await upgraded.execute("SELECT name FROM themes WHERE id = 'theme-preserved'")).rows[0]?.name).toBe("Integralen");
  });

  it("creates canonical local sources and Google columns in a fresh database", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-migration-fresh-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const database = await getDatabase();
    const spaces = await database.execute("SELECT source_type, google_drive_folder_id, google_drive_folder_label, is_active, archived_at FROM learning_spaces ORDER BY id");
    expect(spaces.rows).toHaveLength(2);
    expect(spaces.rows.every((row) => row.source_type === "local" && row.google_drive_folder_id === null && row.google_drive_folder_label === null && row.is_active === 1 && row.archived_at === null)).toBe(true);
  });

  it("migrates previously inactive LearningSpaces to archived while active spaces stay active", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-migration-014-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 14)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-08-14T10:00:00.000Z"] },
      ], "write");
    }
    await legacy.execute("UPDATE learning_spaces SET is_active = 0, updated_at = '2026-07-01T08:00:00.000Z' WHERE id = 'space-5'");
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    const spaces = await upgraded.execute("SELECT id, is_active, archived_at FROM learning_spaces ORDER BY id");
    expect(spaces.rows.find((row) => row.id === "space-6")).toMatchObject({ is_active: 1, archived_at: null });
    expect(spaces.rows.find((row) => row.id === "space-5")).toMatchObject({ is_active: 0, archived_at: "2026-07-01T08:00:00.000Z" });
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
