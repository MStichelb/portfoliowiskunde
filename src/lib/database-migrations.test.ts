import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import { maybeAutoSynchronize } from "./auto-sync";
import { synchronizeSource } from "./sync";
import { getStorageProviderWithType } from "./storage";
import type { StorageProvider } from "./storage/provider";

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
    expect((await upgraded.execute("SELECT learning_space_id, role, provider_type, is_active, onedrive_drive_id, onedrive_folder_id FROM learning_space_sources WHERE learning_space_id = 'space-6'")).rows).toEqual([
      expect.objectContaining({ learning_space_id: "space-6", role: "primary", provider_type: "onedrive", is_active: 1, onedrive_drive_id: "drive-existing", onedrive_folder_id: "folder-existing" }),
    ]);
    const configured = await getStorageProviderWithType("space-6");
    expect(configured).toMatchObject({
      type: "onedrive",
      provider: { id: "onedrive" },
      source: {
        role: "primary", isActive: true, providerType: "onedrive",
        oneDriveDriveId: "drive-existing", oneDriveFolderId: "folder-existing", oneDriveFolderPath: "Wiskunde/6",
      },
    });
    expect(configured.space.sources).toHaveLength(1);
    let autoSyncSourceRole: string | undefined;
    await maybeAutoSynchronize("space-6", {
      getLatestSyncSummary: async () => null,
      synchronize: async (learningSpaceId) => {
        autoSyncSourceRole = (await getStorageProviderWithType(learningSpaceId)).source.role;
      },
    });
    expect(autoSyncSourceRole).toBe("primary");
    const emptyProvider: StorageProvider = { id: "migration-runtime", async list() { return []; }, async readFile() { return Buffer.from(""); } };
    await expect(synchronizeSource("space-6", {
      getConfiguredProvider: async () => ({ ...configured, provider: emptyProvider }),
    })).resolves.toMatchObject({ portfolios: 0, skipped: false });
    expect((await upgraded.execute("SELECT source_id, status FROM sync_runs WHERE learning_space_id = 'space-6' ORDER BY started_at DESC LIMIT 1")).rows[0]).toMatchObject({
      source_id: "space-6:primary", status: "completed",
    });
  });

  it("repairs a database that already recorded migration 016 without the sync source reference", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-migration-016-repair-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 16)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-08-21T12:00:00.000Z"] },
      ], "write");
    }
    expect((await legacy.execute("PRAGMA table_info(sync_runs)")).rows.some((row) => row.name === "source_id")).toBe(false);
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const repaired = await getDatabase();
    expect((await repaired.execute("PRAGMA table_info(sync_runs)")).rows.some((row) => row.name === "source_id")).toBe(true);
    expect((await repaired.execute("SELECT role, is_active FROM learning_space_sources WHERE learning_space_id = 'space-5'")).rows).toEqual([
      expect.objectContaining({ role: "primary", is_active: 1 }),
    ]);
    expect((await repaired.execute("SELECT version FROM schema_migrations WHERE version = '017_sync_run_source_reference'")).rows).toHaveLength(1);
  });

  it("creates canonical local sources and Google columns in a fresh database", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-migration-fresh-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const database = await getDatabase();
    const spaces = await database.execute("SELECT source_type, google_drive_folder_id, google_drive_folder_label, is_active, archived_at FROM learning_spaces ORDER BY id");
    expect(spaces.rows).toHaveLength(2);
    expect(spaces.rows.every((row) => row.source_type === "local" && row.google_drive_folder_id === null && row.google_drive_folder_label === null && row.is_active === 1 && row.archived_at === null)).toBe(true);
    const sources = await database.execute("SELECT learning_space_id, role, provider_type, is_active FROM learning_space_sources ORDER BY learning_space_id");
    expect(sources.rows).toHaveLength(2);
    expect(sources.rows.every((row) => row.role === "primary" && row.provider_type === "local" && row.is_active === 1)).toBe(true);
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
