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
    const spaces = await database.execute("SELECT source_type, google_drive_folder_id, google_drive_folder_label, is_active, archived_at, editors_can_manage_access FROM learning_spaces ORDER BY id");
    expect(spaces.rows).toHaveLength(2);
    expect(spaces.rows.every((row) => row.source_type === "local" && row.google_drive_folder_id === null && row.google_drive_folder_label === null && row.is_active === 1 && row.archived_at === null && row.editors_can_manage_access === 0)).toBe(true);
    const sources = await database.execute("SELECT learning_space_id, role, provider_type, is_active FROM learning_space_sources ORDER BY learning_space_id");
    expect(sources.rows).toHaveLength(2);
    expect(sources.rows.every((row) => row.role === "primary" && row.provider_type === "local" && row.is_active === 1)).toBe(true);
    const portfolioColumns = (await database.execute("PRAGMA table_info(portfolios)")).rows.map((row) => row.name);
    expect(portfolioColumns).toEqual(expect.arrayContaining(["hints_document_path", "hints_document_source_id", "custom_text", "custom_text_position"]));
    const userColumns = (await database.execute("PRAGMA table_info(users)")).rows.map((row) => row.name);
    expect(userColumns).toEqual(expect.arrayContaining(["first_name", "last_name", "class_group_override_id"]));
    const exerciseColumns = (await database.execute("PRAGMA table_info(exercises)")).rows.map((row) => row.name);
    expect(exerciseColumns).toEqual(expect.arrayContaining(["custom_note", "note_position", "note_label"]));
    expect((await database.execute("PRAGMA table_info(individual_learning_space_access)")).rows.map((row) => row.name))
      .toEqual(expect.arrayContaining(["user_id", "learning_space_id", "created_at", "updated_at"]));
    expect((await database.execute("SELECT version FROM schema_migrations WHERE version = '021_multi_user_foundation'")).rows).toHaveLength(1);
    expect((await database.execute("SELECT version FROM schema_migrations WHERE version = '023_multi_user_access_management'")).rows).toHaveLength(1);
    expect((await database.execute("SELECT version FROM schema_migrations WHERE version = '024_legacy_learning_space_ownership'")).rows).toHaveLength(1);
    expect((await database.execute("SELECT version FROM schema_migrations WHERE version = '025_editor_student_access_delegation'")).rows).toHaveLength(1);
    expect((await database.execute("SELECT version FROM schema_migrations WHERE version = '026_portfolio_custom_message'")).rows).toHaveLength(1);
    expect((await database.execute("SELECT version FROM schema_migrations WHERE version = '030_exercise_notes'")).rows).toHaveLength(1);
    expect((await database.execute("SELECT version FROM schema_migrations WHERE version = '031_exercise_note_labels'")).rows).toHaveLength(1);
    expect((await database.execute("SELECT id, role, status FROM users WHERE id = 'user-legacy-superadmin'")).rows[0]).toMatchObject({
      role: "superadmin", status: "active",
    });
    expect((await database.execute("SELECT owner_user_id, provider, status FROM storage_connections")).rows).toEqual([
      expect.objectContaining({ owner_user_id: "user-legacy-superadmin", provider: "onedrive", status: "disconnected" }),
    ]);
  });

  it("adds custom message defaults without changing existing portfolio data", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-migration-custom-message-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 25)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-07T10:00:00.000Z"] },
      ], "write");
    }
    await legacy.execute({
      sql: `INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, is_indexed, indexed_at)
        VALUES ('legacy-message-portfolio', 'space-5:1', '1', 'space-5', 'Bestaande titel', 'Portfolio 1 - Bestaande titel', 1, '2026-09-07T10:00:00.000Z')`,
      args: [],
    });
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    expect((await upgraded.execute("SELECT title, custom_text, custom_text_position FROM portfolios WHERE id = 'legacy-message-portfolio'")).rows[0]).toMatchObject({
      title: "Bestaande titel",
      custom_text: null,
      custom_text_position: "above_documents",
    });
  });

  it("adds exercise note defaults without changing existing exercises", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-migration-exercise-note-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 29)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-08T10:00:00.000Z"] },
      ], "write");
    }
    await legacy.batch([
      { sql: `INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, is_indexed, indexed_at)
        VALUES ('note-portfolio', 'space-5:1', '1', 'space-5', 'Bestaand', 'Portfolio 1 - Bestaand', 1, '2026-09-08T10:00:00.000Z')`, args: [] },
      { sql: `INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path)
        VALUES ('note-section', 'note-portfolio', 1, 'Deel', 'Portfolio 1 - Bestaand/Uitwerkingen/1 - Deel')`, args: [] },
      { sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix)
        VALUES ('note-exercise', 'note-portfolio', 'note-section', '1', 1, '')`, args: [] },
    ], "write");
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    expect((await upgraded.execute("SELECT exercise_code, custom_note, note_position FROM exercises WHERE id = 'note-exercise'")).rows[0]).toMatchObject({
      exercise_code: "1",
      custom_note: null,
      note_position: "above_solution",
    });
  });

  it("adds a nullable label without changing existing exercise notes", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-migration-exercise-note-label-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 30)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-09T10:00:00.000Z"] },
      ], "write");
    }
    await legacy.batch([
      { sql: `INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, is_indexed, indexed_at)
        VALUES ('label-portfolio', 'space-5:1', '1', 'space-5', 'Bestaand', 'Portfolio 1 - Bestaand', 1, '2026-09-09T10:00:00.000Z')`, args: [] },
      { sql: `INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path)
        VALUES ('label-section', 'label-portfolio', 1, 'Deel', 'Portfolio 1 - Bestaand/Uitwerkingen/1 - Deel')`, args: [] },
      { sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, custom_note, note_position)
        VALUES ('label-exercise', 'label-portfolio', 'label-section', '1', 1, '', 'Bestaande notitie', 'below_solution')`, args: [] },
    ], "write");
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    expect((await upgraded.execute("SELECT custom_note, note_label, note_position FROM exercises WHERE id = 'label-exercise'")).rows[0]).toMatchObject({
      custom_note: "Bestaande notitie",
      note_label: null,
      note_position: "below_solution",
    });
  });

  it("migreert de bestaande versleutelde OneDrive-token en sessies naar de compatibility-superadmin", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-migration-users-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 20)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-08-28T10:00:00.000Z"] },
      ], "write");
    }
    await legacy.batch([
      { sql: "INSERT INTO app_settings (key, value, updated_at) VALUES ('onedrive_tokens', 'encrypted-existing-token', '2026-08-28T10:00:00.000Z')", args: [] },
      { sql: "INSERT INTO admin_sessions (id, expires_at, created_at) VALUES ('existing-session', '2099-01-01T00:00:00.000Z', '2026-08-28T10:00:00.000Z')", args: [] },
      { sql: "UPDATE learning_space_sources SET provider_type = 'onedrive' WHERE id = 'space-6:primary'", args: [] },
    ], "write");
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    expect((await upgraded.execute("SELECT user_id FROM admin_sessions WHERE id = 'existing-session'")).rows[0]?.user_id).toBe("user-legacy-superadmin");
    expect((await upgraded.execute("SELECT owner_user_id, encrypted_credentials, status FROM storage_connections WHERE id = 'connection-onedrive-user-legacy-superadmin'")).rows[0]).toMatchObject({
      owner_user_id: "user-legacy-superadmin", encrypted_credentials: "encrypted-existing-token", status: "active",
    });
    expect((await upgraded.execute("SELECT storage_connection_id FROM learning_space_sources WHERE id = 'space-6:primary'")).rows[0]?.storage_connection_id)
      .toBe("connection-onedrive-user-legacy-superadmin");
    expect((await upgraded.execute("SELECT value FROM app_settings WHERE key = 'onedrive_tokens'")).rows).toHaveLength(0);
  });

  it("koppelt alleen historische OneDrive-LearningSpaces duplicaatvrij aan de compatibility-superadmin", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-migration-ownership-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 23)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-05T10:00:00.000Z"] },
      ], "write");
    }
    await legacy.batch([
      {
        sql: `UPDATE learning_space_sources
          SET provider_type = 'onedrive', storage_connection_id = 'connection-onedrive-user-legacy-superadmin'
          WHERE id IN ('space-5:primary', 'space-6:primary')`,
        args: [],
      },
      {
        sql: `INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at)
          VALUES ('space-6', 'user-legacy-superadmin', 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        args: [],
      },
    ], "write");
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    const memberships = await upgraded.execute(
      "SELECT learning_space_id, user_id, role FROM learning_space_members ORDER BY learning_space_id",
    );
    expect(memberships.rows).toEqual([
      expect.objectContaining({ learning_space_id: "space-5", user_id: "user-legacy-superadmin", role: "owner" }),
      expect.objectContaining({ learning_space_id: "space-6", user_id: "user-legacy-superadmin", role: "owner" }),
    ]);
    expect((await upgraded.execute("SELECT version FROM schema_migrations WHERE version = '024_legacy_learning_space_ownership'")).rows).toHaveLength(1);
    expect((await upgraded.execute("SELECT editors_can_manage_access FROM learning_spaces")).rows.every((row) => row.editors_can_manage_access === 0)).toBe(true);
  });

  it("keeps existing anonymous reports valid when reporter names are added", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-migration-report-name-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 18)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-08-21T12:00:00.000Z"] },
      ], "write");
    }
    await legacy.batch([
      { sql: `INSERT INTO portfolios (id, code, title, relative_path, indexed_at, learning_space_id, portfolio_code)
        VALUES ('legacy-portfolio', 'space-6:3', 'Integralen', 'Portfolio 3 - Integralen', '2026-08-21T12:00:00.000Z', 'space-6', '3')`, args: [] },
      { sql: `INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path)
        VALUES ('legacy-section', 'legacy-portfolio', 1, 'Integralen', 'Portfolio 3 - Integralen/Uitwerkingen/1 - Integralen')`, args: [] },
      { sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix)
        VALUES ('legacy-exercise', 'legacy-portfolio', 'legacy-section', '1', 1, '')`, args: [] },
      { sql: `INSERT INTO error_reports (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, message, status, created_at, updated_at)
        VALUES ('legacy-report', 'legacy-portfolio', 'legacy-section', 'legacy-exercise', 'standard', '[]', 'Bestaande anonieme melding', 'TODO', '2026-08-21T12:00:00.000Z', '2026-08-21T12:00:00.000Z')`, args: [] },
    ], "write");
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    expect((await upgraded.execute("SELECT message, reporter_name FROM error_reports WHERE id = 'legacy-report'")).rows[0]).toMatchObject({
      message: "Bestaande anonieme melding",
      reporter_name: null,
    });
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
