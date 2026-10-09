import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import type { IndexedPortfolio } from "./domain";
import { createUser } from "./identity";
import { getLastSeenChangelogEntryId, markChangelogSeen } from "./changelog-read-state";
import { getChangelogForRole } from "./changelog";
import {
  createLearningSpaceForOwner,
  getLearningSpace,
  getActiveLearningSpaceSource,
  getLearningSpaceSource,
  getLearningSpaces,
  getSyncPublicationSnapshot,
  getSetting,
  releaseSyncLease,
  setSetting,
  tryAcquireSyncLease,
  updateLearningSpace,
  persistIndex,
  createTheme,
  getThemes,
  getAdminPortfolios,
  getIndexedSourceManifest,
  updateTheme,
  setPortfolioTheme,
  deleteTheme,
  archiveLearningSpace,
  permanentlyDeleteLearningSpace,
  moveTheme,
  setExerciseNote,
} from "./repositories";
import { uniqueSourceProfileName } from "./source-profile-name";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, INITIAL_SOURCE_PROFILE_TEMPLATE_ID } from "./source-profile-config";
import { createSourceProfileTemplate, updateSourceProfileTemplateMetadata } from "./source-profile-templates";
import { createSubject, renameSubject } from "./subjects";

import { getActiveSourceProfileForLearningSpace } from "./source-profiles";
import { getDefaultSourceProfileTemplate } from "./source-profile-templates";
import { getSourceEntityBindings } from "./source-bindings";
import { getSourceAssetBindings } from "./source-asset-bindings";
import { nativeBindingContext, sourceBindingFixture, sourceAssetBindingFixture, sourceAssetBindingInsert } from "@/test/source-binding-fixture";

const postgresUrl = process.env.POSTGRES_TEST_DATABASE_URL?.trim();
const describeWithPostgres = postgresUrl ? describe : describe.skip;
let originalDatabaseUrl: string | undefined;
let originalDatabasePath: string | undefined;

describeWithPostgres("PostgreSQL production compatibility", () => {
  beforeAll(() => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    originalDatabasePath = process.env.PORTFOLIO_DATABASE_PATH;
    process.env.DATABASE_URL = postgresUrl;
    delete process.env.PORTFOLIO_DATABASE_PATH;
    resetDatabaseForTests();
  });

  afterAll(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalDatabasePath === undefined) delete process.env.PORTFOLIO_DATABASE_PATH;
    else process.env.PORTFOLIO_DATABASE_PATH = originalDatabasePath;
    resetDatabaseForTests();
  });

  it("upgrades a populated checkpoint through 055-061 without losing data or references", async () => {
    const schema = `release_upgrade_${randomUUID().replaceAll("-", "")}`;
    const sql = postgres(postgresUrl!, { max: 1, prepare: false, onnotice: () => {} });
    const session = await sql.reserve();
    try {
      await session.unsafe(`CREATE SCHEMA ${schema}`);
      await session.unsafe(`SET search_path TO ${schema}`);
      await session.unsafe("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
      async function apply(version: number) {
        for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) === version)) {
          await session.unsafe("BEGIN");
          try {
            await session.unsafe((migration.postgresStatements ?? migration.statements).join(";\n"));
            await session.unsafe("INSERT INTO schema_migrations VALUES ($1, $2)", [migration.version, "2026-10-08T00:00:00.000Z"]);
            await session.unsafe("COMMIT");
          } catch (error) { await session.unsafe("ROLLBACK"); throw error; }
        }
      }
      for (let version = 1; version <= 54; version++) await apply(version);
      await session.unsafe(`
        INSERT INTO themes (id, learning_space_id, name, sort_order, created_at, updated_at) VALUES ('legacy-theme', 'space-6', 'Eigen groepering', 70, 'created', 'edited');
        INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, title_override, relative_path, indexed_at, theme_id, visible, publication_limited, publish_from)
          VALUES ('legacy-p', 'space-6:99', '99', 'space-6', 'Bron', 'Eigen titel', 'Bronmap', '2026-10-08', 'legacy-theme', 0, 1, '2099-01-01T12:00:00+02:00');
        INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path) VALUES ('legacy-s', 'legacy-p', 1, 'Basis', 'Bronmap/1');
        INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, custom_note, note_label, note_position, visibility_mode, level_source, level_override_mode, level_override)
          VALUES ('legacy-e', 'legacy-p', 'legacy-s', '1', 1, '', 'Eigen notitie', 'Tip', 'below_solution', 'hidden', 'basis', 'level', 'uitdaging');
        INSERT INTO solution_variants (id, exercise_id, kind, label) VALUES ('legacy-v', 'legacy-e', 'standard', 'Uitwerking');
        INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step) VALUES ('legacy-a', 'legacy-v', 'test.png', 'test.png', 'png', 1);
        INSERT INTO source_resource_assets (id, learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id, semantic_role, source_id, relative_path, file_name, extension, last_seen_at)
          VALUES ('legacy-generic', 'space-6', 'legacy-p', 'legacy-e', 'exercise', 'worked-solution', 'worked_solution', 'old-item', 'test.png', 'test.png', 'png', 'old');
        INSERT INTO error_reports (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, message, status, created_at, updated_at)
          VALUES ('legacy-report', 'legacy-p', 'legacy-s', 'legacy-e', 'standard', '[]', 'Bewaar melding', 'TODO', '2026-10-08', '2026-10-08');
      `);
      const tables = ["portfolios", "sections", "exercises", "solution_variants", "solution_assets", "error_reports", "themes", "learning_spaces", "users", "source_profiles", "learning_space_source_profiles", "learning_space_sources", "learning_space_members", "source_resource_assets"];
      const before = new Map<string, Record<string, unknown>[]>();
      for (const table of tables) before.set(table, [...await session.unsafe(`SELECT * FROM ${table}`)]);
      for (let version = 55; version <= 59; version++) await apply(version);
      const checkpoint059 = new Map<string, Record<string, unknown>[]>();
      for (const table of tables) checkpoint059.set(table, [...await session.unsafe(`SELECT * FROM ${table}`)]);
      await apply(60);
      for (const table of tables) expect([...await session.unsafe(`SELECT * FROM ${table}`)]).toEqual(checkpoint059.get(table));
      expect(await session.unsafe("SELECT * FROM source_entity_bindings")).toHaveLength(0);
      await apply(61);
      for (const table of tables) expect([...await session.unsafe(`SELECT * FROM ${table}`)]).toEqual(checkpoint059.get(table));
      expect(await session.unsafe("SELECT * FROM source_asset_bindings")).toHaveLength(0);
      for (const table of tables) {
        const after = await session.unsafe(`SELECT * FROM ${table}`);
        expect(after).toHaveLength(before.get(table)!.length);
        for (const row of before.get(table)!) expect(after).toContainEqual(expect.objectContaining(row));
      }
      expect((await session.unsafe("SELECT version FROM schema_migrations ORDER BY version")).map((row) => row.version)).toEqual(migrations.map((item) => item.version));
      expect((await session.unsafe("SELECT theme_label_singular, section_label_singular FROM learning_spaces WHERE id = 'space-6'"))[0]).toEqual({ theme_label_singular: "Thema", section_label_singular: "Onderdeel" });
      await session.unsafe("UPDATE exercises SET section_id = NULL WHERE id = 'legacy-e'");
      await expect(session.unsafe("INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix) VALUES ('duplicate-root', 'legacy-p', NULL, '1', 1, '')")).rejects.toMatchObject({ code: "23505" });
      await expect(session.unsafe("UPDATE themes SET source_scope = 'partial' WHERE id = 'legacy-theme'")).rejects.toMatchObject({ code: "23514" });
      await expect(session.unsafe("UPDATE exercises SET portfolio_id = 'missing' WHERE id = 'legacy-e'")).rejects.toMatchObject({ code: "23503" });
      expect((await session.unsafe("SELECT id, exercise_id FROM solution_variants WHERE id = 'legacy-v'"))[0]).toEqual({ id: "legacy-v", exercise_id: "legacy-e" });
    } finally {
      await session.unsafe("SET search_path TO public");
      await session.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      session.release();
      await sql.end({ timeout: 3 });
    }
  }, 120_000);

  it("stores scoped native bindings, enforces constraints and rolls back a failing publication", async () => {
    const suffix = randomUUID();
    const owner = await createUser({ displayName: `Binding owner ${suffix}`, role: "teacher" });
    const space = await createLearningSpaceForOwner({ subjectId: "subject-wiskunde", name: "Binding test", slug: `binding-${suffix}`,
      shortLabel: "B", sourceType: "local", localSourcePath: null }, owner.id);
    const database = await getDatabase();
    const source = (await getActiveLearningSpaceSource(space.id))!;
    await database.execute({ sql: "UPDATE learning_space_sources SET provider_type = 'onedrive' WHERE id = ?", args: [source.id] });
    await persistIndex([sourceBindingFixture()], "onedrive", space.id, { sourceId: source.id });
    const bindings = await getSourceEntityBindings(database, space.id);
    expect(bindings).toHaveLength(2);
    await persistIndex([sourceBindingFixture()], "onedrive", space.id, { sourceId: source.id });
    expect(await getSourceEntityBindings(database, space.id)).toEqual(bindings);
    const changedCode = sourceBindingFixture(); changedCode.code = "92";
    changedCode.relativePath = "Moved/Portfolio 92 Nieuw";
    await persistIndex([changedCode], "onedrive", space.id, { sourceId: source.id });
    const renamed = (await database.execute({ sql: "SELECT * FROM portfolios WHERE learning_space_id = ?", args: [space.id] })).rows;
    expect(renamed).toHaveLength(1);
    expect(renamed[0]).toMatchObject({ id: bindings.find((binding) => binding.entityType === "portfolio")!.entityId,
      portfolio_code: "92", relative_path: changedCode.relativePath });
    expect(await getSourceEntityBindings(database, space.id)).toEqual(bindings);
    const before = renamed;
    const recreated = structuredClone(changedCode); recreated.sourceId = "replacement-folder";
    await expect(persistIndex([recreated], "onedrive", space.id, { sourceId: source.id })).rejects.toThrow("bronidentiteit");
    expect((await database.execute({ sql: "SELECT * FROM portfolios WHERE learning_space_id = ?", args: [space.id] })).rows).toEqual(before);
    const portfolio = bindings.find((binding) => binding.entityType === "portfolio")!;
    const section = bindings.find((binding) => binding.entityType === "section")!;
    const insert = (id: string, sourceId: string, portfolioId: string, sectionId: string | null, nativeId: string, kind = "native") => ({
      sql: `INSERT INTO source_entity_bindings (id, learning_space_id, learning_space_source_id, provider_type, provider_namespace,
        identity_kind, entity_type, portfolio_id, section_id, native_item_id, created_at, updated_at)
        VALUES (?, ?, ?, 'onedrive', ?, ?, ?, ?, ?, ?, 'now', 'now')`,
      args: [id, space.id, sourceId, nativeBindingContext.providerNamespace, kind, sectionId ? "section" : "portfolio", portfolioId, sectionId, nativeId],
    });
    await expect(database.execute(insert(`native-${suffix}`, source.id, portfolio.entityId, section.entityId, portfolio.nativeItemId))).rejects.toThrow();
    await expect(database.execute(insert(`entity-${suffix}`, source.id, portfolio.entityId, null, "other-native"))).rejects.toThrow();
    await expect(database.execute(insert(`source-${suffix}`, "space-5:primary", portfolio.entityId, section.entityId, "other-native"))).rejects.toThrow();
    await expect(database.execute(insert(`parent-${suffix}`, source.id, "missing-portfolio", null, "other-native"))).rejects.toThrow();
    await expect(database.execute(insert(`kind-${suffix}`, source.id, portfolio.entityId, section.entityId, "other-native", "path"))).rejects.toThrow();
    await expect(database.batch([
      { sql: "UPDATE source_entity_bindings SET updated_at = 'must-rollback' WHERE learning_space_id = ?", args: [space.id] },
      insert(`rollback-${suffix}`, source.id, portfolio.entityId, null, "other-native"),
    ])).rejects.toThrow();
    expect((await database.execute({ sql: "SELECT updated_at FROM source_entity_bindings WHERE learning_space_id = ?", args: [space.id] })).rows)
      .not.toContainEqual({ updated_at: "must-rollback" });
    const newBinding = insert(`insert-rollback-${suffix}`, source.id, portfolio.entityId, null, "other-native");
    newBinding.args[3] = "rollback-namespace";
    await expect(database.batch([newBinding,
      { sql: "UPDATE portfolios SET title = NULL WHERE id = ?", args: [portfolio.entityId] },
    ])).rejects.toThrow();
    expect(await getSourceEntityBindings(database, space.id)).toEqual(bindings);
    // An invalid entity write also leaves the complete index and its bindings intact.
    const invalid = sourceBindingFixture("93"); invalid.title = null as unknown as string;
    await expect(persistIndex([invalid], "onedrive", space.id, { sourceId: source.id })).rejects.toThrow();
    expect(await getSourceEntityBindings(database, space.id)).toEqual(bindings);
    expect((await database.execute({ sql: "SELECT * FROM portfolios WHERE learning_space_id = ?", args: [space.id] })).rows).toEqual(before);
    await database.execute({ sql: "INSERT INTO learning_space_sources (id, learning_space_id, role, provider_type, is_active, created_at, updated_at) VALUES (?, ?, 'mirror', 'onedrive', 0, 'now', 'now')", args: [`mirror-${suffix}`, space.id] });
    await persistIndex([changedCode], "onedrive", space.id, { sourceId: `mirror-${suffix}` });
    expect(await getSourceEntityBindings(database, space.id)).toHaveLength(4);
  }, 120_000);

  it("reconciles native portfolio/theme moves and code changes with metadata, child IDs and atomic rejection", async () => {
    const suffix = randomUUID();
    const owner = await createUser({ displayName: `Reconciliation ${suffix}`, role: "teacher" });
    const space = await createLearningSpaceForOwner({ subjectId: "subject-wiskunde", name: "Reconciliation", slug: `reconcile-${suffix}`,
      shortLabel: "R", sourceType: "local", localSourcePath: null }, owner.id);
    const database = await getDatabase();
    const source = (await getActiveLearningSpaceSource(space.id))!;
    const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    config.scanner.portfolio.themeMode = "folder";
    await database.execute({ sql: "UPDATE learning_space_sources SET provider_type = 'onedrive' WHERE id = ?", args: [source.id] });
    await database.execute({ sql: "UPDATE source_profiles SET config_json = ? WHERE id IN (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = ?)", args: [JSON.stringify(config), space.id] });
    const indexed = sourceBindingFixture();
    indexed.sourceTheme = { sourceId: "theme-a", name: "Analyse", relativePath: "Analyse" };
    await persistIndex([indexed], "onedrive", space.id, { sourceId: source.id });
    const original = (await getAdminPortfolios(space.id))[0];
    const oldTheme = (await getThemes(space.id))[0];
    const sectionId = original.sections[0].id;
    const exerciseId = original.sections[0].exercises[0].id;
    await database.batch([
      { sql: "UPDATE portfolios SET title_override = 'Eigen titel', visible = 0, publication_limited = 1, publish_from = '2099-01-01', publish_until = '2099-12-31', card_color = '#abcdef', custom_text = 'Bewaren', custom_text_position = 'below_documents' WHERE id = ?", args: [original.id] },
      { sql: "UPDATE themes SET name = 'Eigen thema', sort_order = 80 WHERE id = ?", args: [oldTheme.id] },
      { sql: "UPDATE exercises SET custom_note = 'Bewaren', visibility_mode = 'hidden' WHERE id = ?", args: [exerciseId] },
      { sql: "INSERT INTO error_reports (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'standard', '[]', 'Bewaar', 'TODO', 'old', 'old')", args: [`report-${suffix}`, original.id, sectionId, exerciseId] },
    ]);
    indexed.sourceTheme = { sourceId: "theme-a", name: "Functies", relativePath: "Functies" };
    indexed.code = "92"; indexed.title = "Nieuwe bron"; indexed.relativePath = "Functies/Portfolio 92 Nieuw";
    indexed.sections[0].relativePath = `${indexed.relativePath}/1.1 Onderdeel`;
    await persistIndex([indexed], "onedrive", space.id, { sourceId: source.id });
    expect((await getThemes(space.id))[0]).toMatchObject({ id: oldTheme.id, name: "Eigen thema", sortOrder: 80,
      sourceTheme: { sourceId: "theme-a", name: "Functies", relativePath: "Functies" } });
    for (const theme of ["theme-b", null, "theme-a"]) {
      indexed.sourceTheme = theme ? { sourceId: theme, name: theme, relativePath: theme } : undefined;
      indexed.relativePath = `${theme ? `${theme}/` : ""}Portfolio 92 Nieuw`;
      await persistIndex([indexed], "onedrive", space.id, { sourceId: source.id });
      const current = (await getAdminPortfolios(space.id))[0];
      expect(current).toMatchObject({ id: original.id, title: "Eigen titel", visible: false, customText: "Bewaren", code: "92" });
      expect(current.sections[0].id).toBe(sectionId); expect(current.sections[0].exercises[0].id).toBe(exerciseId);
      expect(current.themeId).toBe(theme ? (await getThemes(space.id)).find((item) => item.sourceTheme?.sourceId === theme)!.id : null);
    }
    expect((await database.execute({ sql: "SELECT publication_limited, publish_from, publish_until, card_color, custom_text_position FROM portfolios WHERE id = ?", args: [original.id] })).rows[0])
      .toMatchObject({ publication_limited: 1, publish_from: "2099-01-01", publish_until: "2099-12-31", card_color: "#abcdef", custom_text_position: "below_documents" });
    expect((await database.execute({ sql: "SELECT id, custom_note, visibility_mode FROM exercises WHERE id = ?", args: [exerciseId] })).rows[0])
      .toMatchObject({ id: exerciseId, custom_note: "Bewaren", visibility_mode: "hidden" });
    expect((await database.execute({ sql: "SELECT portfolio_id, section_id, exercise_id FROM error_reports WHERE id = ?", args: [`report-${suffix}`] })).rows[0])
      .toEqual({ portfolio_id: original.id, section_id: sectionId, exercise_id: exerciseId });
    const snapshot = async () => Promise.all([
      ...["portfolios", "themes", "source_entity_bindings", "sync_runs", "sync_warnings", "error_report_threads", "error_report_issues"].map((table) => {
        const sql = table === "sync_warnings" ? "SELECT * FROM sync_warnings WHERE sync_run_id IN (SELECT id FROM sync_runs WHERE learning_space_id = ?) ORDER BY id"
          : `SELECT * FROM ${table} WHERE learning_space_id = ? ORDER BY id`;
        return database.execute({ sql, args: [space.id] }).then((result) => result.rows);
      }),
      ...["sections", "exercises", "error_reports"].map((table) => database.execute({ sql: `SELECT * FROM ${table} WHERE portfolio_id = ? ORDER BY id`, args: [original.id] }).then((result) => result.rows)),
    ]);
    const before = await snapshot();
    const replacement = structuredClone(indexed); replacement.sourceId = "replacement";
    await expect(persistIndex([replacement], "onedrive", space.id, { sourceId: source.id })).rejects.toThrow("bronidentiteit");
    const doubleClaim = structuredClone(indexed); doubleClaim.code = "93";
    await expect(persistIndex([indexed, doubleClaim], "onedrive", space.id, { sourceId: source.id })).rejects.toThrow("bronidentiteit");
    const conflictingTheme = sourceBindingFixture("94"); conflictingTheme.sourceTheme = { sourceId: "theme-a", name: "Contradiction", relativePath: "Elsewhere" };
    await expect(persistIndex([indexed, conflictingTheme], "onedrive", space.id, { sourceId: source.id })).rejects.toThrow("bronidentiteit");
    expect(await snapshot()).toEqual(before);
    // A valid rename and new theme are planned; the entity constraint fails during publication.
    const invalid = structuredClone(indexed); invalid.code = "93"; invalid.title = null as unknown as string;
    invalid.sourceTheme = { sourceId: "rollback-theme", name: "Nieuw", relativePath: "Nieuw" };
    await expect(persistIndex([invalid], "onedrive", space.id, { sourceId: source.id })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    expect(await getThemes(space.id)).toHaveLength(2);
  }, 120_000);

  it("stores asset source scopes with typed FKs, idempotency, namespace separation and full rollback", async () => {
    const suffix = randomUUID(); const database = await getDatabase();
    const owner = await createUser({ displayName: `Asset scope ${suffix}`, role: "teacher" });
    const space = await createLearningSpaceForOwner({ subjectId: "subject-wiskunde", name: "Asset scope", slug: `asset-${suffix}`, shortLabel: "A", sourceType: "local", localSourcePath: null }, owner.id);
    const source = (await getActiveLearningSpaceSource(space.id))!;
    await database.execute({ sql: "UPDATE learning_space_sources SET provider_type = 'onedrive' WHERE id = ?", args: [source.id] });
    const indexed = sourceAssetBindingFixture();
    await persistIndex([indexed], "onedrive", space.id, { sourceId: source.id });
    const bindings = await getSourceAssetBindings(database, space.id); expect(bindings).toHaveLength(2);
    const pair = bindings.find((binding) => binding.solutionAssetId)!;
    const document = bindings.find((binding) => binding.resourceScope === "portfolio")!;
    const snapshot = async () => Promise.all([
      ...["portfolios", "source_resource_assets", "source_asset_bindings", "source_entity_bindings", "sync_runs"].map((table) => database.execute({ sql: `SELECT * FROM ${table} WHERE learning_space_id = ? ORDER BY id`, args: [space.id] }).then((result) => result.rows)),
      database.execute({ sql: "SELECT * FROM solution_assets WHERE variant_id = ? ORDER BY id", args: [pair.variantId] }).then((result) => result.rows),
      database.execute({ sql: "SELECT * FROM exercises WHERE portfolio_id = ? ORDER BY id", args: [pair.portfolioId] }).then((result) => result.rows),
    ]);
    const scopedRows = (await database.execute({ sql: "SELECT * FROM source_asset_bindings WHERE learning_space_id = ? ORDER BY id", args: [space.id] })).rows;
    await persistIndex([indexed], "onedrive", space.id, { sourceId: source.id });
    expect((await database.execute({ sql: "SELECT * FROM source_asset_bindings WHERE learning_space_id = ? ORDER BY id", args: [space.id] })).rows).toEqual(scopedRows);
    expect(await getSourceAssetBindings(database, space.id)).toEqual(bindings);
    const mirrorId = `asset-mirror-${suffix}`;
    await database.execute({ sql: "INSERT INTO learning_space_sources (id, learning_space_id, role, provider_type, is_active, created_at, updated_at) VALUES (?, ?, 'mirror', 'onedrive', 0, 'old', 'old')", args: [mirrorId, space.id] });
    await persistIndex([indexed], "onedrive", space.id, { sourceId: mirrorId });
    await persistIndex([sourceAssetBindingFixture("91", { ...nativeBindingContext, providerNamespace: "another-root" })], "onedrive", space.id, { sourceId: mirrorId });
    expect(await getSourceAssetBindings(database, space.id)).toHaveLength(6);
    expect(new Set((await getSourceAssetBindings(database, space.id)).filter((binding) => binding.solutionAssetId).map((binding) => binding.solutionAssetId)).size).toBe(1);
    const other = sourceAssetBindingFixture("92");
    for (const asset of [...other.resourceAssets, ...other.sections[0].exercises[0].assets]) asset.sourceId += "-other";
    await persistIndex([indexed, other], "onedrive", space.id, { sourceId: source.id });
    const otherPair = (await getSourceAssetBindings(database, space.id)).find((binding) => binding.nativeItemId === "raw-solution-id-other")!;
    await database.execute(sourceAssetBindingInsert(`other-parent-${suffix}`, { ...otherPair,
      nativeItemId: pair.nativeItemId, providerNamespace: "isolated-other-parent" }));
    expect(otherPair.solutionAssetId).not.toBe(pair.solutionAssetId);
    const before = await snapshot();
    const invalid = [pair, { ...pair, configuredSourceId: "space-5:primary" }, { ...pair, learningSpaceId: "space-5" },
      { ...pair, portfolioId: "missing" }, { ...pair, exerciseId: "missing" }, { ...pair, resourceId: "other" },
      { ...pair, resourceAssetId: document.resourceAssetId }, { ...pair, solutionAssetId: "missing" }, { ...pair, variantId: "missing" },
      { ...pair, identityKind: "path" as const }, { ...pair, resourceAssetId: null, solutionAssetId: null, variantId: null }];
    for (const [index, binding] of invalid.entries()) await expect(database.execute(sourceAssetBindingInsert(`invalid-${suffix}-${index}`, binding))).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    await expect(database.batch([
      { sql: "UPDATE exercises SET custom_note = 'must-rollback' WHERE id = ?", args: [pair.exerciseId] },
      sourceAssetBindingInsert(`rollback-${suffix}`, { ...pair, providerNamespace: "rollback", solutionAssetId: "missing" }),
    ])).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    const conflicting = structuredClone(indexed); conflicting.sections[0].exercises[0].code = "2";
    await expect(persistIndex([conflicting], "onedrive", space.id, { sourceId: source.id })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    const invalidEntity = structuredClone(indexed); invalidEntity.title = null as unknown as string;
    await expect(persistIndex([invalidEntity], "onedrive", space.id, { sourceId: source.id })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  }, 120_000);

  it("creates wizard profile choices and skipped sources in the same owner transaction", async () => {
    const suffix = randomUUID();
    const teacher = await createUser({ displayName: `Wizard ${suffix}`, role: "teacher" });
    const template = await getDefaultSourceProfileTemplate();
    const input = { subjectId: "subject-wiskunde", name: "Wizard PostgreSQL", shortLabel: "PG", sourceType: "local" as const, localSourcePath: null, skipSourceOnCreation: true };
    const later = await createLearningSpaceForOwner({ ...input, slug: `pg-later-${suffix}`, creationProfileChoice: { mode: "later" } }, teacher.id);
    expect(await getActiveSourceProfileForLearningSpace(later.id)).toBeNull();
    expect(await getActiveLearningSpaceSource(later.id)).toBeNull();
    const original = await createLearningSpaceForOwner({ ...input, slug: `pg-template-${suffix}`, creationProfileChoice: { mode: "template", id: template.id } }, teacher.id);
    const profile = (await getActiveSourceProfileForLearningSpace(original.id))!;
    const linked = await createLearningSpaceForOwner({ ...input, slug: `pg-link-${suffix}`, creationProfileChoice: { mode: "link", id: profile.id } }, teacher.id);
    const draft = structuredClone(profile.config); draft.scanner.portfolio.marker = "Eigen bundel";
    const copied = await createLearningSpaceForOwner({ ...input, slug: `pg-copy-${suffix}`, creationProfileChoice: { mode: "copy", id: original.id, config: draft } }, teacher.id);
    expect((await getActiveSourceProfileForLearningSpace(linked.id))?.id).toBe(profile.id);
    const copy = (await getActiveSourceProfileForLearningSpace(copied.id))!;
    expect(copy.id).not.toBe(profile.id); expect(copy.config).toEqual(draft);
    expect((await getActiveSourceProfileForLearningSpace(original.id))?.config).toEqual(profile.config);
    const members = await (await getDatabase()).execute({ sql: "SELECT role FROM learning_space_members WHERE learning_space_id = ? AND user_id = ?", args: [copied.id, teacher.id] });
    expect(members.rows[0]?.role).toBe("owner");
  });

  it("retains mixed hierarchy metadata and access through sync, then atomically deletes one space with rollback", async () => {
    const database = await getDatabase();
    const suffix = randomUUID();
    const owner = await createUser({ displayName: `Release owner ${suffix}`, role: "teacher" });
    const student = await createUser({ displayName: `Release student ${suffix}`, role: "student" });
    const input = { subjectId: "subject-wiskunde", name: "Release fixture", shortLabel: "REL", sourceType: "local" as const, localSourcePath: null };
    const space = await createLearningSpaceForOwner({ ...input, slug: `release-target-${suffix}` }, owner.id);
    const profile = (await getActiveSourceProfileForLearningSpace(space.id))!;
    const other = await createLearningSpaceForOwner({ ...input, slug: `release-retained-${suffix}`, creationProfileChoice: { mode: "link", id: profile.id } }, owner.id);
    const config = structuredClone(profile.config);
    config.scanner.portfolio.themeMode = "folder";
    await database.execute({ sql: "UPDATE source_profiles SET config_json = ?, management_learning_space_id = ? WHERE id = ?", args: [JSON.stringify(config), space.id, profile.id] });
    const connection = `release-connection-${suffix}`;
    await database.execute({ sql: "INSERT INTO storage_connections (id, owner_user_id, provider, display_name, created_at, updated_at) VALUES (?, ?, 'onedrive', 'Release fixture', ?, ?)", args: [connection, owner.id, "2026-10-08", "2026-10-08"] });
    await database.execute({ sql: "UPDATE learning_space_sources SET storage_connection_id = ? WHERE learning_space_id = ?", args: [connection, space.id] });
    for (const id of [space.id, other.id]) {
      await database.execute({ sql: "INSERT INTO individual_learning_space_access (user_id, learning_space_id, created_at, updated_at) VALUES (?, ?, ?, ?)", args: [student.id, id, "2026-10-08", "2026-10-08"] });
      await database.execute({ sql: "INSERT INTO learning_space_group_mappings (id, learning_space_id, provider, external_group_id, created_at, updated_at) VALUES (?, ?, 'smartschool', ?, ?, ?)", args: [`group-${id}`, id, `external-${suffix}`, "2026-10-08", "2026-10-08"] });
    }
    const themed = postgresExerciseMoveFixture("1", 1, `asset-${suffix}`);
    themed.sourceTheme = { name: "Analyse", relativePath: "Analyse", sourceId: `theme-${suffix}` };
    themed.exercises = [{ code: "1", number: 1, suffix: "", assets: [] }];
    const root = postgresExerciseMoveFixture("2", 1, `root-${suffix}`);
    root.exercises = root.sections[0].exercises; root.sections = [];
    const fixtures = [themed, root];
    await persistIndex(fixtures, "local", space.id);
    await persistIndex([root], "local", other.id);
    const original = (await getAdminPortfolios(space.id)).find((item) => item.code === "1")!;
    const sourceTheme = (await getThemes(space.id))[0];
    await createTheme(space.id, "Handmatig", 80);
    await updateTheme(sourceTheme.id, space.id, "Eigen analyse");
    await moveTheme(sourceTheme.id, space.id, "down");
    await database.execute({ sql: "UPDATE portfolios SET title_override = 'Eigen titel', visible = 0, publication_limited = 1, publish_from = '2099-01-01T12:00:00+02:00', custom_text = 'Eigen uitleg' WHERE id = ?", args: [original.id] });
    const exercise = original.sections[0].exercises[0];
    await setExerciseNote(exercise.id, "Bewaar notitie", "Tip", "below_solution");
    await database.execute({ sql: "UPDATE exercises SET visibility_mode = 'hidden', level_override_mode = 'level', level_override = 'uitdaging' WHERE id = ?", args: [exercise.id] });
    const profileBefore = (await database.execute({ sql: "SELECT * FROM source_profiles WHERE id = ?", args: [profile.id] })).rows;
    const accessTables = ["learning_space_members", "individual_learning_space_access", "learning_space_group_mappings", "learning_space_sources", "learning_space_source_profiles"];
    const accessBefore = new Map<string, unknown>();
    for (const table of accessTables) accessBefore.set(table, (await database.execute({ sql: `SELECT * FROM ${table} WHERE learning_space_id = ?`, args: [space.id] })).rows);
    const themesBefore = await getThemes(space.id);
    const portfoliosBefore = await getAdminPortfolios(space.id);
    for (let repeat = 0; repeat < 2; repeat++) await persistIndex(fixtures, "local", space.id);
    expect(await getThemes(space.id)).toEqual(themesBefore);
    expect(await getAdminPortfolios(space.id)).toEqual(portfoliosBefore);
    expect((await getAdminPortfolios(space.id)).find((item) => item.code === "2")!.themeId).toBeNull();
    for (const table of accessTables) expect((await database.execute({ sql: `SELECT * FROM ${table} WHERE learning_space_id = ?`, args: [space.id] })).rows).toEqual(accessBefore.get(table));
    expect((await database.execute({ sql: "SELECT * FROM source_profiles WHERE id = ?", args: [profile.id] })).rows).toEqual(profileBefore);
    const moved = structuredClone(themed);
    moved.exercises!.push(...moved.sections[0].exercises); moved.sections = [];
    await persistIndex([moved, root], "local", space.id);
    expect((await database.execute({ sql: "SELECT id, section_id, custom_note, level_override, visibility_mode FROM exercises WHERE id = ?", args: [exercise.id] })).rows[0])
      .toMatchObject({ id: exercise.id, section_id: null, custom_note: "Bewaar notitie", level_override: "uitdaging", visibility_mode: "hidden" });
    await persistIndex(fixtures, "local", space.id);
    expect((await database.execute({ sql: "SELECT id, section_id, custom_note, level_override, visibility_mode FROM exercises WHERE id = ?", args: [exercise.id] })).rows[0])
      .toMatchObject({ id: exercise.id, section_id: original.sections[0].id, custom_note: "Bewaar notitie", level_override: "uitdaging", visibility_mode: "hidden" });
    const thread = `thread-${suffix}`, issue = `issue-${suffix}`, report = `report-${suffix}`;
    await database.execute({ sql: "INSERT INTO error_report_threads (id, learning_space_id, portfolio_id, exercise_id, exercise_code, created_at, updated_at) VALUES (?, ?, ?, ?, '20a', ?, ?)", args: [thread, space.id, original.id, exercise.id, "2026-10-08", "2026-10-08"] });
    await database.execute({ sql: "INSERT INTO error_report_issues (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '20a', 'exercise_solution', ?, ?)", args: [issue, thread, space.id, original.id, exercise.id, "2026-10-08", "2026-10-08"] });
    await database.execute({ sql: "INSERT INTO error_reports (id, portfolio_id, section_id, exercise_id, issue_id, variant_kind, asset_snapshot, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'standard', '[]', 'Release fixture', 'TODO', ?, ?)", args: [report, original.id, original.sections[0].id, exercise.id, issue, "2026-10-08", "2026-10-08"] });
    const retained = await getAdminPortfolios(other.id);
    const retainedSource = await getActiveLearningSpaceSource(other.id);
    expect(await permanentlyDeleteLearningSpace(space.id)).toBe(false);
    await archiveLearningSpace(space.id);
    const probe = `pg_delete_probe_${suffix.replaceAll("-", "")}`;
    await database.execute(`CREATE TABLE ${probe} (space_id TEXT REFERENCES learning_spaces(id))`);
    try {
      await database.execute({ sql: `INSERT INTO ${probe} VALUES (?)`, args: [space.id] });
      await expect(permanentlyDeleteLearningSpace(space.id)).rejects.toMatchObject({ code: "23503" });
      for (const [table, id] of [["error_reports", report], ["error_report_issues", issue], ["error_report_threads", thread]]) {
        expect((await database.execute({ sql: `SELECT id FROM ${table} WHERE id = ?`, args: [id] })).rows).toHaveLength(1);
      }
      expect(await getThemes(space.id)).toEqual(themesBefore);
      expect(await getAdminPortfolios(space.id)).toEqual(portfoliosBefore);
      expect((await database.execute({ sql: "SELECT management_learning_space_id FROM source_profiles WHERE id = ?", args: [profile.id] })).rows[0].management_learning_space_id).toBe(space.id);
      for (const table of accessTables) expect((await database.execute({ sql: `SELECT * FROM ${table} WHERE learning_space_id = ?`, args: [space.id] })).rows).toEqual(accessBefore.get(table));
    } finally { await database.execute(`DROP TABLE ${probe}`); }
    expect(await permanentlyDeleteLearningSpace(space.id)).toBe(true);
    expect(await getLearningSpace(space.id)).toBeNull();
    expect(await getAdminPortfolios(space.id)).toEqual([]);
    expect(await getThemes(space.id)).toEqual([]);
    for (const table of [...accessTables, "error_report_threads", "error_report_issues", "source_resource_assets", "sync_runs", "sync_leases"]) {
      expect((await database.execute({ sql: `SELECT learning_space_id FROM ${table} WHERE learning_space_id = ?`, args: [space.id] })).rows).toEqual([]);
    }
    for (const [table, id] of [["error_reports", report], ["exercises", exercise.id], ["sections", original.sections[0].id]]) {
      expect((await database.execute({ sql: `SELECT id FROM ${table} WHERE id = ?`, args: [id] })).rows).toEqual([]);
    }
    expect((await database.execute({ sql: "SELECT id FROM users WHERE id IN (?, ?)", args: [owner.id, student.id] })).rows).toHaveLength(2);
    expect((await database.execute({ sql: "SELECT id FROM storage_connections WHERE id = ?", args: [connection] })).rows).toHaveLength(1);
    expect((await database.execute({ sql: "SELECT id, management_learning_space_id FROM source_profiles WHERE id = ?", args: [profile.id] })).rows[0]).toMatchObject({ id: profile.id, management_learning_space_id: null });
    expect((await getActiveSourceProfileForLearningSpace(other.id))?.id).toBe(profile.id);
    expect(await getAdminPortfolios(other.id)).toEqual(retained);
    expect(await getActiveLearningSpaceSource(other.id)).toEqual(retainedSource);
  }, 120_000);

  it("applies every migration and exercises representative shared repository queries", async () => {
    const database = await getDatabase();
    const applied = await database.execute("SELECT version FROM schema_migrations ORDER BY version");
    expect(applied.rows.map((row) => String(row.version))).toEqual(migrations.map((migration) => migration.version));

    const suffix = randomUUID();
    const superadmin = await createUser({ displayName: `PostgreSQL ${suffix}`, role: "superadmin" });
    expect(await getLastSeenChangelogEntryId(superadmin.id)).toBeNull();
    await markChangelogSeen(superadmin);
    expect(await getLastSeenChangelogEntryId(superadmin.id)).toBe(getChangelogForRole(superadmin.role)[0]?.id);

    const initialSubject = await createSubject(superadmin, { name: `Initial compat ${suffix}` });
    const subject = await createSubject(superadmin, { name: `Compat ${suffix}` });
    await expect(renameSubject(superadmin, subject.id, ` COMPAT ${suffix.toUpperCase()} `)).resolves.toBeUndefined();

    const template = await createSourceProfileTemplate(superadmin, {
      name: `Compat template ${suffix}`,
      sourceTemplateId: INITIAL_SOURCE_PROFILE_TEMPLATE_ID,
    });
    await expect(updateSourceProfileTemplateMetadata(superadmin, template.id, {
      name: ` COMPAT TEMPLATE ${suffix.toUpperCase()} `,
    })).resolves.toBeUndefined();

    const now = new Date().toISOString();
    const profileId = `postgres-compat-profile-${suffix}`;
    const profileName = `Compat profile ${suffix}`;
    await database.execute({
      sql: `INSERT INTO source_profiles
        (id, type, name, description, config_version, config_json, created_at, updated_at, management_learning_space_id, owner_user_id, archived_at)
        VALUES (?, 'custom', ?, NULL, 1, ?, ?, ?, NULL, ?, NULL)`,
      args: [profileId, profileName, JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG), now, now, superadmin.id],
    });
    await expect(uniqueSourceProfileName(superadmin.id, ` ${profileName.toUpperCase()} `, profileId))
      .resolves.toBe(profileName.toUpperCase());

    const spaceSlug = `postgres-compat-${suffix}`;
    const space = await createLearningSpaceForOwner({
      subjectId: initialSubject.id,
      name: `PostgreSQL compatibility ${suffix}`,
      slug: spaceSlug,
      shortLabel: `PG ${suffix.slice(0, 8)}`,
      sourceType: "local",
      localSourcePath: null,
    }, superadmin.id);
    expect(space.description).toBe("Overzicht van de portfolio's met oefeningen.");
    expect(space).toMatchObject({ themeLabelSingular: "Thema", themeLabelPlural: "Thema's", sectionLabelSingular: "Onderdeel", sectionLabelPlural: "Onderdelen", exerciseLabelShort: "Oef." });
    await updateLearningSpace(space.id, {
      subjectId: subject.id,
      themeLabelSingular: "Deel", themeLabelPlural: "Delen",
      sectionLabelSingular: "Sectie", sectionLabelPlural: "Secties",
      collectionLabelSingular: space.collectionLabelSingular,
      collectionLabelPlural: space.collectionLabelPlural,
      exerciseLabelSingular: space.exerciseLabelSingular,
      exerciseLabelPlural: space.exerciseLabelPlural,
      exerciseLabelShort: space.exerciseLabelShort,
      name: space.name,
      slug: space.slug,
      shortLabel: space.shortLabel,
      description: space.description,
      cardColor: space.cardColor,
      sortOrder: space.sortOrder,
      sourceType: space.sourceType,
      primarySource: space.primarySource ?? undefined,
      mirrorSource: space.mirrorSource,
      levelPresentation: space.levelPresentation,
    });
    expect((await getLearningSpace(space.id))?.subjectId).toBe(subject.id);
    await expect(getLearningSpace(space.id)).resolves.toMatchObject({
      themeLabelSingular: "Deel", themeLabelPlural: "Delen", sectionLabelSingular: "Sectie", sectionLabelPlural: "Secties",
      collectionLabelSingular: space.collectionLabelSingular, exerciseLabelPlural: space.exerciseLabelPlural, exerciseLabelShort: "Oef.", description: space.description,
    });
    expect((await getLearningSpaces()).length).toBeGreaterThan(0);

    const settingKey = `postgres-compat-${suffix}`;
    await setSetting(settingKey, "ok");
    expect(await getSetting(settingKey)).toBe("ok");
    const portfolioCode = `pg-${suffix}`;
    const firstIndex = postgresExerciseMoveFixture(portfolioCode, 1, "postgres-move-old");
    const leaseOwner = `postgres-compat-${suffix}`;
    expect(await tryAcquireSyncLease(space.id, leaseOwner)).toBe(true);
    const activeSource = await getActiveLearningSpaceSource(space.id);
    expect(activeSource).toMatchObject({
      learningSpaceId: space.id,
      providerType: "local",
      isActive: true,
    });
    if (!activeSource) throw new Error("De PostgreSQL-testfixture heeft geen actieve synchronisatiebron.");
    const storedSource = await getLearningSpaceSource(activeSource.id);
    expect(storedSource).toMatchObject({
      id: activeSource.id,
      learningSpaceId: space.id,
      role: "primary",
      providerType: activeSource.providerType,
      isActive: true,
      storageConnectionId: null,
      localSourcePath: null,
    });
    const publicationSnapshot = await getSyncPublicationSnapshot(space.id, activeSource.id);
    expect(publicationSnapshot).toMatchObject({
      learningSpaceId: space.id,
      sourceId: activeSource.id,
      sourceProviderType: activeSource.providerType,
      sourceStorageConnectionId: null,
      sourceLocalPath: null,
      activeSourceId: activeSource.id,
      sourceProfileConfigVersion: 1,
    });
    if (!publicationSnapshot) throw new Error("De PostgreSQL-testfixture heeft geen geldige publicatiesnapshot.");
    await persistIndex([firstIndex], activeSource.providerType, space.id, {
      sourceId: activeSource.id,
      publicationGuard: { ownerId: leaseOwner, leaseSeconds: 600, snapshot: publicationSnapshot },
    });
    await releaseSyncLease(space.id, leaseOwner);
    const originalExerciseId = String((await database.execute({
      sql: "SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ? AND portfolio_code = ?)",
      args: [space.id, portfolioCode],
    })).rows[0].id);
    await expect(persistIndex([postgresExerciseMoveFixture(portfolioCode, 2, "postgres-move-new")], activeSource.providerType, space.id))
      .resolves.toMatchObject({ added: 0, missing: 0 });
    expect((await database.execute({ sql: "SELECT id, is_indexed FROM exercises WHERE id = ?", args: [originalExerciseId] })).rows[0])
      .toMatchObject({ id: originalExerciseId, is_indexed: 1 });
    const directIndex = postgresExerciseMoveFixture(portfolioCode, 2, "postgres-move-new");
    directIndex.exercises = directIndex.sections[0].exercises;
    directIndex.sections = [];
    await persistIndex([directIndex], activeSource.providerType, space.id);
    expect((await database.execute({ sql: "SELECT id, section_id FROM exercises WHERE id = ?", args: [originalExerciseId] })).rows[0])
      .toMatchObject({ id: originalExerciseId, section_id: null });
    expect((await getAdminPortfolios(space.id))[0]).toMatchObject({
      sections: [], exercises: [expect.objectContaining({ id: originalExerciseId })],
    });
    await persistIndex([directIndex], activeSource.providerType, space.id);
    const conflictingIndex = structuredClone(directIndex);
    conflictingIndex.sections = firstIndex.sections;
    await expect(persistIndex([conflictingIndex], activeSource.providerType, space.id)).rejects.toThrow("Oefeningscode 20a");
    expect((await database.execute({ sql: "SELECT id, section_id FROM exercises WHERE id = ?", args: [originalExerciseId] })).rows[0])
      .toMatchObject({ id: originalExerciseId, section_id: null });
    await expect(persistIndex([firstIndex], activeSource.providerType, space.id)).resolves.toMatchObject({ added: 0, missing: 0 });
    expect((await getAdminPortfolios(space.id))[0].sections[0].exercises[0].id).toBe(originalExerciseId);
    await persistIndex([directIndex], activeSource.providerType, space.id);
    await expect(database.execute({
      sql: "INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix) SELECT ?, portfolio_id, NULL, exercise_code, exercise_number, exercise_suffix FROM exercises WHERE id = ?",
      args: [`duplicate-direct-${suffix}`, originalExerciseId],
    })).rejects.toThrow();

    const themeConfig = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    themeConfig.scanner.portfolio.themeMode = "folder";
    await database.execute({
      sql: "UPDATE source_profiles SET config_json = ? WHERE id IN (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = ?)",
      args: [JSON.stringify(themeConfig), space.id],
    });
    await createTheme(space.id, "Analyse", 60);
    await expect(createTheme(space.id, "Analyse")).rejects.toThrow();
    directIndex.sourceTheme = { name: "Analyse", relativePath: "Analyse", sourceId: `folder-${suffix}` };
    await persistIndex([directIndex], activeSource.providerType, space.id, { sourceId: activeSource.id });
    const theme = (await getThemes(space.id)).find((item) => item.sourceTheme)!;
    expect(theme).toMatchObject({ name: "Analyse", sortOrder: 70, sourceTheme: { ...directIndex.sourceTheme, scope: activeSource.id } });
    await updateTheme(theme.id, space.id, "Eigen analyse");
    const themeBefore = (await database.execute({ sql: "SELECT * FROM themes WHERE id = ?", args: [theme.id] })).rows[0];
    const portfolioId = (await getAdminPortfolios(space.id))[0].id;
    await persistIndex([directIndex], activeSource.providerType, space.id, { sourceId: activeSource.id });
    expect((await database.execute({ sql: "SELECT * FROM themes WHERE id = ?", args: [theme.id] })).rows[0]).toEqual(themeBefore);
    expect(await getThemes(space.id)).toHaveLength(2);
    expect((await getAdminPortfolios(space.id))[0]).toMatchObject({ id: portfolioId, themeId: theme.id });
    await setPortfolioTheme(portfolioId, space.id, null);
    expect((await getAdminPortfolios(space.id))[0].themeId).toBe(theme.id);
    await expect(deleteTheme(theme.id, space.id)).rejects.toThrow("bepaald door de bronmappen");
    const manualTheme = (await getThemes(space.id)).find((item) => !item.sourceTheme)!;
    await deleteTheme(manualTheme.id, space.id);
    expect(await getThemes(space.id)).toEqual([expect.objectContaining({ id: theme.id })]);
    themeConfig.scanner.portfolio.themeMode = "none";
    await database.execute({
      sql: "UPDATE source_profiles SET config_json = ? WHERE id IN (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = ?)",
      args: [JSON.stringify(themeConfig), space.id],
    });
    await expect(deleteTheme(theme.id, space.id)).rejects.toThrow("bepaald door de bronmappen");
    themeConfig.scanner.portfolio.themeMode = "folder";
    await database.execute({
      sql: "UPDATE source_profiles SET config_json = ? WHERE id IN (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = ?)",
      args: [JSON.stringify(themeConfig), space.id],
    });
    expect((await getIndexedSourceManifest(space.id)).find((entry) => entry.kind === "portfolio")?.sourceTheme).toEqual(directIndex.sourceTheme);
    await expect(database.execute({
      sql: `INSERT INTO themes (id, learning_space_id, name, created_at, updated_at, source_scope, source_id, source_folder_name, source_relative_path)
        SELECT ?, learning_space_id, name, created_at, updated_at, source_scope, source_id, source_folder_name, source_relative_path FROM themes WHERE id = ?`,
      args: [`duplicate-theme-${suffix}`, theme.id],
    })).rejects.toThrow();
    delete directIndex.sourceTheme;
    await persistIndex([directIndex], activeSource.providerType, space.id, { sourceId: activeSource.id });
    expect((await getAdminPortfolios(space.id))[0].themeId).toBeNull();
    expect((await database.execute({ sql: "SELECT * FROM themes WHERE id = ?", args: [theme.id] })).rows[0]).toEqual(themeBefore);
  }, 60_000);
});

function postgresExerciseMoveFixture(portfolioCode: string, sectionOrder: number, sourceId: string): IndexedPortfolio {
  const portfolioPath = `Portfolio ${portfolioCode}`;
  const sectionPath = `${portfolioPath}/${sectionOrder} Sectie`;
  const fileName = `${portfolioCode}-Oef20a.png`;
  return {
    code: portfolioCode,
    title: "PostgreSQL reconciliation",
    relativePath: portfolioPath,
    assignmentPdfPath: null,
    assignmentPdfSourceId: null,
    hintsDocumentPath: null,
    hintsDocumentSourceId: null,
    finalSolutionsPdfPath: null,
    finalSolutionsPdfSourceId: null,
    resourceAssets: [],
    sections: [{
      code: String(sectionOrder),
      sortOrder: sectionOrder,
      title: "Sectie",
      relativePath: sectionPath,
      exercises: [{
        code: "20a",
        number: 20,
        suffix: "a",
        levelSource: "basis",
        assets: [{
          resourceId: "worked-solution",
          semanticRole: "worked_solution",
          legacyVariant: "standard",
          relativePath: `${sectionPath}/${fileName}`,
          sourceId,
          fileName,
          lastModifiedAt: "2026-10-04T10:00:00.000Z",
          sourceVersion: sourceId,
          parsed: {
            portfolioCode,
            exerciseNumber: 20,
            exerciseSuffix: "a",
            exerciseCode: "20a",
            variant: "standard",
            step: 1,
            extension: "png",
          },
        }],
      }],
    }],
    warnings: [],
  };
}
