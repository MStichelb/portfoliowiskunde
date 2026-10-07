import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDatabase, resetDatabaseForTests } from "./database";
import { createUser } from "./identity";
import { archiveLearningSpace, createLearningSpaceForOwner, getActiveLearningSpaceSource, permanentlyDeleteLearningSpace, persistIndex } from "./repositories";
import { getActiveSourceProfileForLearningSpace } from "./source-profiles";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, INITIAL_SOURCE_PROFILE_TEMPLATE_ID } from "./source-profile-config";
import { indexSource } from "./storage/portfolio-indexer";
import { LocalFilesystemProvider } from "./storage/local-filesystem-provider";

// Existing development databases applied 035 with RESTRICT before its SQL changed.
const schema = vi.hoisted(() => ({ legacyManagementForeignKey: false }));
vi.mock("./database-migrations", async (original) => {
  const migrationModule = await original<typeof import("./database-migrations")>();
  return { ...migrationModule, get migrations() {
    return migrationModule.migrations.map((migration) => migration.version === "035_source_profile_management_context" && schema.legacyManagementForeignKey
      ? { ...migration, statements: migration.statements.map((sql) => sql.replace("ON DELETE SET NULL", "ON DELETE RESTRICT")) }
      : migration);
  } };
});

let directory: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  schema.legacyManagementForeignKey = false;
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (directory) {
    try { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
    catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "EBUSY") throw error; }
  }
  directory = undefined;
});

describe("permanent LearningSpace deletion ownership", () => {
  it.each([
    ["simple", false], ["owned-profile", false], ["shared-profile", false],
    ["owned-profile", true], ["shared-profile", true],
  ] as const)("removes owned data and preserves user-wide data (%s, legacy RESTRICT=%s)", async (shape, legacyManagementForeignKey) => {
    schema.legacyManagementForeignKey = legacyManagementForeignKey;
    directory = await mkdtemp(path.join(os.tmpdir(), "learning-space-delete-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(directory, "metadata.db");
    resetDatabaseForTests();
    const database = await getDatabase();
    const managementForeignKey = (await database.execute('PRAGMA foreign_key_list("source_profiles")')).rows.find((row) => row.from === "management_learning_space_id");
    expect(managementForeignKey?.on_delete).toBe(legacyManagementForeignKey ? "RESTRICT" : "SET NULL");
    const owner = await createUser({ displayName: "Owner", role: "teacher" });
    const editor = await createUser({ displayName: "Editor", role: "teacher" });
    const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    config.scanner.portfolio.themeMode = "folder";
    const input = { subjectId: "subject-wiskunde", name: "Delete A", slug: "delete-a", shortLabel: "A", sourceType: "local" as const, localSourcePath: null };
    const a = await createLearningSpaceForOwner({ ...input, creationProfileChoice: shape === "simple" ? { mode: "later" } : { mode: "template", id: INITIAL_SOURCE_PROFILE_TEMPLATE_ID, config } }, owner.id);
    const profile = await getActiveSourceProfileForLearningSpace(a.id);
    const b = await createLearningSpaceForOwner({ ...input, name: "Keep B", slug: "keep-b", shortLabel: "B", creationProfileChoice: shape === "shared-profile" ? { mode: "link", id: profile!.id } : { mode: "later" } }, owner.id);
    const bProfile = await getActiveSourceProfileForLearningSpace(b.id);
    const bProfileBefore = bProfile ? (await database.execute({ sql: "SELECT * FROM source_profiles WHERE id = ?", args: [bProfile.id] })).rows[0] : null;
    const templatesBefore = (await database.execute("SELECT * FROM source_profile_templates ORDER BY id")).rows;
    const now = "2026-10-07T12:00:00.000Z";
    for (const space of [a, b]) {
      await database.execute({ sql: "INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at) VALUES (?, ?, 'editor', ?, ?)", args: [space.id, editor.id, now, now] });
      await database.execute({ sql: "INSERT INTO individual_learning_space_access (learning_space_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)", args: [space.id, editor.id, now, now] });
      await database.execute({ sql: "INSERT INTO user_learning_space_preferences (learning_space_id, user_id, sort_order) VALUES (?, ?, 10)", args: [space.id, owner.id] });
      await database.execute({ sql: "INSERT INTO learning_space_group_mappings (id, learning_space_id, provider, external_group_id, created_at, updated_at) VALUES (?, ?, 'smartschool', ?, ?, ?)", args: [`group-${space.id}`, space.id, `group-${space.id}`, now, now] });
    }
    await database.execute({ sql: "INSERT INTO storage_connections (id, owner_user_id, provider, display_name, created_at, updated_at) VALUES ('kept-connection', ?, 'onedrive', 'User connection', ?, ?)", args: [owner.id, now, now] });
    if (shape !== "simple") {
      const sourcePath = path.join(directory, "source");
      const files = ["Analyse/Portfolio 1 Stelsels/1 Inleiding/Oef1.png", "Analyse/Portfolio 1 Stelsels/Oef3.png", "Analyse/Portfolio 1 Stelsels/portfolio.pdf", "header.png"];
      for (const file of files) {
        await mkdir(path.dirname(path.join(sourcePath, file)), { recursive: true });
        await writeFile(path.join(sourcePath, file), "");
      }
      const indexed = await indexSource(new LocalFilesystemProvider(sourcePath), config);
      for (const space of [a, b]) {
        const source = await getActiveLearningSpaceSource(space.id);
        await persistIndex(indexed, "local", space.id, { sourceId: source!.id });
        await database.execute({ sql: "UPDATE learning_space_sources SET storage_connection_id = 'kept-connection' WHERE learning_space_id = ?", args: [space.id] });
        await database.execute({ sql: "INSERT INTO learning_space_header_assets (id, learning_space_id, learning_space_source_id, source_id, relative_path, file_name, extension, indexed_at) VALUES (?, ?, ?, ?, 'header.png', 'header.png', 'png', ?)", args: [`header-${space.id}`, space.id, source!.id, `header-source-${space.id}`, now] });
        const portfolio = (await database.execute({ sql: "SELECT id FROM portfolios WHERE learning_space_id = ?", args: [space.id] })).rows[0];
        const exercise = (await database.execute({ sql: "SELECT id, section_id FROM exercises WHERE portfolio_id = ? AND section_id IS NOT NULL LIMIT 1", args: [String(portfolio.id)] })).rows[0];
        await database.execute({ sql: "UPDATE exercises SET custom_note = 'Keep metadata', level_override_mode = 'level', level_override = 'verdieping', visibility_mode = 'visible' WHERE id = ?", args: [String(exercise.id)] });
        await database.execute({ sql: "INSERT INTO error_report_threads (id, learning_space_id, portfolio_id, exercise_id, exercise_code, created_at, updated_at) VALUES (?, ?, ?, ?, '1', ?, ?)", args: [`thread-${space.id}`, space.id, String(portfolio.id), String(exercise.id), now, now] });
        await database.execute({ sql: "INSERT INTO error_report_issues (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '1', 'exercise_solution', ?, ?)", args: [`issue-${space.id}`, `thread-${space.id}`, space.id, String(portfolio.id), String(exercise.id), now, now] });
        await database.execute({ sql: "INSERT INTO error_reports (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, message, created_at, updated_at, issue_id, reporter_user_id) VALUES (?, ?, ?, ?, 'standard', '[]', 'Delete regression', ?, ?, ?, ?)", args: [`report-${space.id}`, String(portfolio.id), String(exercise.section_id), String(exercise.id), now, now, `issue-${space.id}`, owner.id] });
        await database.execute({ sql: "INSERT INTO portfolio_external_links (portfolio_id, resource_id, url, updated_at) VALUES (?, 'video', 'https://example.com', ?)", args: [String(portfolio.id), now] });
      }
      expect((await database.execute({ sql: "SELECT id FROM themes WHERE learning_space_id = ? AND source_scope IS NOT NULL", args: [a.id] })).rows).toHaveLength(1);
      expect((await database.execute({ sql: "SELECT id FROM source_resource_assets WHERE learning_space_id = ?", args: [a.id] })).rows.length).toBeGreaterThan(0);
    }
    // Inspect the current migrated schema, including space-owned config and access tables.
    const tables = (await database.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows;
    const ownedTables: string[] = [];
    const foreignKeys: string[] = [];
    for (const row of tables) {
      const table = String(row.name).replaceAll('"', '""');
      for (const fk of (await database.execute(`PRAGMA foreign_key_list("${table}")`)).rows) {
        foreignKeys.push(`${table}.${fk.from}->${fk.table}.${fk.to}`);
      }
      const columns = (await database.execute(`PRAGMA table_info("${table}")`)).rows;
      if (columns.some((column) => column.name === "learning_space_id")) ownedTables.push(table);
    }
    // Fail when a migration adds a relationship without revisiting deletion coverage.
    expect(foreignKeys.sort()).toEqual([
      "admin_sessions.user_id->users.id",
      "error_report_issues.exercise_id->exercises.id",
      "error_report_issues.learning_space_id->learning_spaces.id",
      "error_report_issues.portfolio_id->portfolios.id",
      "error_report_issues.thread_id->error_report_threads.id",
      "error_report_threads.exercise_id->exercises.id",
      "error_report_threads.learning_space_id->learning_spaces.id",
      "error_report_threads.portfolio_id->portfolios.id",
      "error_reports.exercise_id->exercises.id",
      "error_reports.issue_id->error_report_issues.id",
      "error_reports.portfolio_id->portfolios.id",
      "error_reports.reporter_user_id->users.id",
      "error_reports.section_id->sections.id",
      "exercises.portfolio_id->portfolios.id",
      "exercises.section_id->sections.id",
      "external_identities.user_id->users.id",
      "external_identity_groups.identity_id->external_identities.id",
      "individual_learning_space_access.learning_space_id->learning_spaces.id",
      "individual_learning_space_access.user_id->users.id",
      "learning_space_group_mappings.learning_space_id->learning_spaces.id",
      "learning_space_header_assets.learning_space_id->learning_spaces.id",
      "learning_space_header_assets.learning_space_source_id->learning_space_sources.id",
      "learning_space_level_presentations.learning_space_id->learning_spaces.id",
      "learning_space_members.learning_space_id->learning_spaces.id",
      "learning_space_members.user_id->users.id",
      "learning_space_source_profiles.learning_space_id->learning_spaces.id",
      "learning_space_source_profiles.source_profile_id->source_profiles.id",
      "learning_space_sources.learning_space_id->learning_spaces.id",
      "learning_space_sources.storage_connection_id->storage_connections.id",
      "learning_spaces.subject_id->subjects.id",
      "portfolio_external_links.portfolio_id->portfolios.id",
      "portfolios.learning_space_id->learning_spaces.id",
      "sections.portfolio_id->portfolios.id",
      "solution_assets.variant_id->solution_variants.id",
      "solution_variants.exercise_id->exercises.id",
      "source_profile_template_defaults.default_template_id->source_profile_templates.id",
      "source_profiles.management_learning_space_id->learning_spaces.id",
      "source_profiles.owner_user_id->users.id",
      "source_resource_assets.exercise_id->exercises.id",
      "source_resource_assets.learning_space_id->learning_spaces.id",
      "source_resource_assets.portfolio_id->portfolios.id",
      "storage_connections.owner_user_id->users.id",
      "sync_leases.learning_space_id->learning_spaces.id",
      "sync_runs.learning_space_id->learning_spaces.id",
      "sync_runs.source_id->learning_space_sources.id",
      "sync_warnings.sync_run_id->sync_runs.id",
      "themes.learning_space_id->learning_spaces.id",
      "user_learning_space_preferences.learning_space_id->learning_spaces.id",
      "user_learning_space_preferences.user_id->users.id",
    ]);
    const bPortfolios = "SELECT id FROM portfolios WHERE learning_space_id = ?";
    const bExercises = "SELECT id FROM exercises WHERE portfolio_id IN (" + bPortfolios + ")";
    const indirectScopes = [
      ["sections", `portfolio_id IN (${bPortfolios})`],
      ["exercises", `portfolio_id IN (${bPortfolios})`],
      ["solution_variants", `exercise_id IN (${bExercises})`],
      ["solution_assets", `variant_id IN (SELECT id FROM solution_variants WHERE exercise_id IN (${bExercises}))`],
      ["error_reports", `portfolio_id IN (${bPortfolios})`],
      ["portfolio_external_links", `portfolio_id IN (${bPortfolios})`],
      ["sync_warnings", "sync_run_id IN (SELECT id FROM sync_runs WHERE learning_space_id = ?)"],
    ];
    const bIndirectBefore = new Map<string, unknown>();
    for (const [table, scope] of indirectScopes) bIndirectBefore.set(table, (await database.execute({ sql: `SELECT * FROM ${table} WHERE ${scope} ORDER BY 1`, args: [b.id] })).rows);
    const bBefore = new Map<string, unknown>();
    for (const table of ownedTables) bBefore.set(table, (await database.execute({ sql: `SELECT * FROM "${table}" WHERE learning_space_id = ? ORDER BY 1`, args: [b.id] })).rows);
    const profileBefore = profile ? (await database.execute({ sql: "SELECT * FROM source_profiles WHERE id = ?", args: [profile.id] })).rows[0] : null;
    const connectionBefore = (await database.execute("SELECT * FROM storage_connections WHERE id = 'kept-connection'")).rows;
    await archiveLearningSpace(a.id);
    const snapshot = async () => {
      const rows = new Map<string, string[]>();
      for (const row of tables) {
        const table = String(row.name).replaceAll('"', '""');
        rows.set(table, (await database.execute(`SELECT * FROM "${table}"`)).rows.map((record) => JSON.stringify(record)).sort());
      }
      return rows;
    };
    const beforeRollback = await snapshot();
    const originalBatch = database.batch.bind(database);
    const batch = vi.spyOn(database, "batch");
    if (legacyManagementForeignKey) {
      // Execute the real pre-fix batch against the historical FK, without detaching.
      batch.mockImplementationOnce((statements) => originalBatch(statements.filter((statement) => !statement.sql.startsWith("UPDATE source_profiles SET management_learning_space_id = NULL"))));
      await expect(permanentlyDeleteLearningSpace(a.id)).rejects.toMatchObject({ code: "SQLITE_CONSTRAINT", statementIndex: 15 });
      expect(await snapshot()).toEqual(beforeRollback);
    }
    if (shape !== "simple") {
      // The earlier thread cleanup is independently necessary before exercise deletion.
      batch.mockImplementationOnce((statements) => originalBatch(statements.filter((statement) => !statement.sql.startsWith("DELETE FROM error_report_threads"))));
      await expect(permanentlyDeleteLearningSpace(a.id)).rejects.toMatchObject({ code: "SQLITE_CONSTRAINT", statementIndex: 4 });
      expect(await snapshot()).toEqual(beforeRollback);
    }
    batch.mockRestore();
    await database.execute("CREATE TABLE delete_rollback_probe (space_id TEXT REFERENCES learning_spaces(id))");
    await database.execute({ sql: "INSERT INTO delete_rollback_probe (space_id) VALUES (?)", args: [a.id] });
    await expect(permanentlyDeleteLearningSpace(a.id)).rejects.toThrow(/FOREIGN KEY/i);
    expect(await snapshot()).toEqual(beforeRollback);
    await database.execute("DROP TABLE delete_rollback_probe");
    expect(await permanentlyDeleteLearningSpace(a.id)).toBe(true);
    expect((await database.execute({ sql: "SELECT id FROM learning_spaces WHERE id = ?", args: [a.id] })).rows).toEqual([]);
    for (const table of ownedTables) {
      expect((await database.execute({ sql: `SELECT * FROM "${table}" WHERE learning_space_id = ?`, args: [a.id] })).rows, table).toEqual([]);
      expect((await database.execute({ sql: `SELECT * FROM "${table}" WHERE learning_space_id = ? ORDER BY 1`, args: [b.id] })).rows, table).toEqual(bBefore.get(table));
    }
    for (const [table, scope] of indirectScopes) {
      expect((await database.execute({ sql: `SELECT * FROM ${table} WHERE ${scope}`, args: [a.id] })).rows, table).toEqual([]);
      expect((await database.execute({ sql: `SELECT * FROM ${table} WHERE ${scope} ORDER BY 1`, args: [b.id] })).rows, table).toEqual(bIndirectBefore.get(table));
    }
    if (profileBefore) expect((await database.execute({ sql: "SELECT * FROM source_profiles WHERE id = ?", args: [profile!.id] })).rows[0]).toEqual({ ...profileBefore, management_learning_space_id: null });
    if (bProfileBefore && bProfile?.id !== profile?.id) expect((await database.execute({ sql: "SELECT * FROM source_profiles WHERE id = ?", args: [bProfile!.id] })).rows[0]).toEqual(bProfileBefore);
    if (shape === "shared-profile") expect((await getActiveSourceProfileForLearningSpace(b.id))?.id).toBe(profile!.id);
    expect((await database.execute("SELECT * FROM source_profile_templates ORDER BY id")).rows).toEqual(templatesBefore);
    expect((await database.execute("SELECT * FROM storage_connections WHERE id = 'kept-connection'")).rows).toEqual(connectionBefore);
    expect((await database.execute({ sql: "SELECT id FROM users WHERE id IN (?, ?)", args: [owner.id, editor.id] })).rows).toHaveLength(2);
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });
});
