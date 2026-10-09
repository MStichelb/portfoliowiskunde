import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import { getActiveLearningSpaceSource, getAdminPortfolios, persistIndex } from "./repositories";
import { getSourceEntityBindings } from "./source-bindings";
import { supportsStableNativeIdentity } from "./source-identity";
import { nativeBindingContext, sourceBindingFixture } from "@/test/source-binding-fixture";

let temporaryDirectory: string | undefined;
afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) {
    try { await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error; }
  }
  temporaryDirectory = undefined;
}, 30_000);

async function setup(providerType = "onedrive") {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-source-bindings-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE learning_space_sources SET provider_type = ? WHERE learning_space_id IN ('space-6', 'space-5')", args: [providerType] });
  return database;
}

async function indexState() {
  const database = await getDatabase();
  const tables = ["portfolios", "sections", "exercises", "themes", "source_entity_bindings", "sync_runs", "sync_warnings"];
  return Promise.all(tables.map(async (table) => (await database.execute(`SELECT * FROM ${table} ORDER BY id`)).rows));
}

describe("source entity binding storage", () => {
  it("stores portfolio and section bindings without resetting IDs or owned metadata, and is idempotent", async () => {
    const database = await setup();
    const indexed = sourceBindingFixture();
    await persistIndex([indexed], "onedrive", "space-6");
    const original = (await getAdminPortfolios("space-6"))[0];
    await database.batch([
      { sql: "UPDATE portfolios SET title_override = 'Eigen titel', visible = 0, publication_limited = 1, publish_from = '2099-01-01', custom_text = 'Eigen uitleg' WHERE id = ?", args: [original.id] },
      { sql: "UPDATE sections SET visibility_mode = 'hidden', publication_limited = 1, publish_until = '2099-01-02' WHERE id = ?", args: [original.sections[0].id] },
      { sql: "UPDATE exercises SET custom_note = 'Bewaren', level_override_mode = 'level', level_override = 'uitdaging', visibility_mode = 'hidden', publish_from = '2099-01-01', show_alternative_to_students = 0 WHERE id = ?", args: [original.sections[0].exercises[0].id] },
    ]);
    const bindingsBefore = (await database.execute("SELECT * FROM source_entity_bindings ORDER BY id")).rows;
    for (let repeat = 0; repeat < 2; repeat++) await persistIndex([indexed], "onedrive", "space-6");
    expect((await database.execute("SELECT * FROM source_entity_bindings ORDER BY id")).rows).toEqual(bindingsBefore);
    const bindings = await getSourceEntityBindings(database, "space-6");
    expect(bindings).toHaveLength(2);
    expect(bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: "portfolio", entityId: original.id, nativeItemId: indexed.sourceId,
        learningSpaceId: "space-6", configuredSourceId: (await getActiveLearningSpaceSource("space-6"))!.id, ...nativeBindingContext }),
      expect.objectContaining({ entityType: "section", entityId: original.sections[0].id, portfolioId: original.id, nativeItemId: indexed.sections[0].sourceId }),
    ]));
    indexed.title = "Nieuwe brontitel"; indexed.relativePath = "Algebra/Portfolio 91 Nieuw";
    indexed.sections[0].title = "Nieuwe sectiontitel"; indexed.sections[0].relativePath = `${indexed.relativePath}/1.1 Nieuw`;
    await persistIndex([indexed], "onedrive", "space-6");
    const current = (await getAdminPortfolios("space-6"))[0];
    expect(current).toMatchObject({ id: original.id, title: "Eigen titel", customText: "Eigen uitleg", visible: false });
    expect((await database.execute("SELECT id, visibility_mode, publication_limited, publish_until FROM sections")).rows[0])
      .toMatchObject({ id: original.sections[0].id, visibility_mode: "hidden", publication_limited: 1, publish_until: "2099-01-02" });
    expect((await database.execute("SELECT id, custom_note, level_override_mode, level_override, visibility_mode, publish_from, show_alternative_to_students FROM exercises")).rows[0])
      .toMatchObject({ id: original.sections[0].exercises[0].id, custom_note: "Bewaren", level_override_mode: "level", level_override: "uitdaging", visibility_mode: "hidden", publish_from: "2099-01-01", show_alternative_to_students: 0 });
    expect((await database.execute("SELECT publication_limited, publish_from FROM portfolios")).rows[0])
      .toEqual({ publication_limited: 1, publish_from: "2099-01-01" });
    expect((await database.execute("SELECT * FROM source_entity_bindings ORDER BY id")).rows).toEqual(bindingsBefore);
  });

  it("leaves unbound legacy records valid and binds them only from a current scan", async () => {
    const database = await setup();
    const indexed = sourceBindingFixture();
    delete indexed.sourceIdentityContext;
    await persistIndex([indexed], "onedrive", "space-6");
    const original = (await getAdminPortfolios("space-6"))[0];
    expect(await getSourceEntityBindings(database, "space-6")).toEqual([]);
    await persistIndex([sourceBindingFixture()], "onedrive", "space-6");
    expect((await getAdminPortfolios("space-6"))[0].id).toBe(original.id);
    expect(await getSourceEntityBindings(database, "space-6")).toHaveLength(2);
  });

  it("isolates the same native IDs by LearningSpace, configured source and provider namespace", async () => {
    const database = await setup();
    const indexed = sourceBindingFixture();
    await persistIndex([indexed], "onedrive", "space-6");
    await persistIndex([indexed], "onedrive", "space-5");
    await database.execute("INSERT INTO learning_space_sources (id, learning_space_id, role, provider_type, is_active, created_at, updated_at) VALUES ('binding-mirror', 'space-6', 'mirror', 'onedrive', 0, 'now', 'now')");
    await persistIndex([indexed], "onedrive", "space-6", { sourceId: "binding-mirror" });
    const otherDrive = sourceBindingFixture("91", { ...nativeBindingContext, providerNamespace: "other-drive" });
    await persistIndex([otherDrive], "onedrive", "space-6", { sourceId: "binding-mirror" });
    const bindings = await getSourceEntityBindings(database, "space-6");
    expect(bindings).toHaveLength(6);
    expect(new Set(bindings.map((binding) => JSON.stringify([binding.configuredSourceId, binding.providerNamespace]))).size).toBe(3);
    expect((await getSourceEntityBindings(database, "space-5"))[0].entityId).not.toBe(bindings[0].entityId);
  });

  it.each(["changed-native-id", "changed-section-code", "duplicate-native", "wrong-provider", "wrong-source", "invalid-local-capability"])(
    "rejects %s before any index writes", async (scenario) => {
      await setup();
      await persistIndex([sourceBindingFixture()], "onedrive", "space-6");
      const before = await indexState();
      const indexed = sourceBindingFixture();
      const input = [indexed];
      let sourceId: string | undefined;
      if (scenario === "changed-native-id") indexed.sourceId = "replacement-folder";
      if (scenario === "changed-section-code") indexed.sections[0].code = "2";
      if (scenario === "duplicate-native") input.push({ ...sourceBindingFixture("92"), sourceId: indexed.sourceId });
      if (scenario === "wrong-provider") indexed.sourceIdentityContext = { ...nativeBindingContext, providerType: "google_drive" };
      if (scenario === "wrong-source") sourceId = (await getActiveLearningSpaceSource("space-5"))!.id;
      if (scenario === "invalid-local-capability") indexed.sourceIdentityContext = { ...nativeBindingContext, identityKind: "path" };
      await expect(persistIndex(input, "onedrive", "space-6", { sourceId })).rejects.toThrow();
      expect(await indexState()).toEqual(before);
    },
  );

  it("keeps provider contexts separate when the existing source configuration changes provider", async () => {
    const database = await setup();
    await persistIndex([sourceBindingFixture()], "onedrive", "space-6");
    const original = await getSourceEntityBindings(database, "space-6");
    await database.execute("UPDATE learning_space_sources SET provider_type = 'google_drive' WHERE learning_space_id = 'space-6'");
    await persistIndex([sourceBindingFixture("91", { ...nativeBindingContext, providerType: "google_drive" })], "google_drive", "space-6");
    const bindings = await getSourceEntityBindings(database, "space-6");
    expect(bindings).toHaveLength(4);
    expect(bindings.filter((binding) => binding.providerType === "onedrive")).toEqual(original);
    expect(bindings.filter((binding) => binding.providerType === "google_drive")).toHaveLength(2);
  });

  it("rejects one entity claiming two native section IDs and a folder used for two entity types", async () => {
    await setup();
    await persistIndex([sourceBindingFixture()], "onedrive", "space-6");
    const before = await indexState();
    const sameSection = sourceBindingFixture();
    sameSection.sections.push({ ...sameSection.sections[0], sourceId: "another-section", exercises: [] });
    await expect(persistIndex([sameSection], "onedrive", "space-6")).rejects.toThrow("bronidentiteit");
    const wrongType = sourceBindingFixture("92"); wrongType.sections[0].sourceId = wrongType.sourceId;
    await expect(persistIndex([wrongType], "onedrive", "space-6")).rejects.toThrow("bronidentiteit");
    expect(await indexState()).toEqual(before);
  });

  it("stores LocalFS as path identity and follows existing code matching without claiming stability", async () => {
    const database = await setup("local");
    const indexed = sourceBindingFixture("91", { providerType: "local", providerNamespace: "test-root", identityKind: "path" });
    indexed.sourceId = indexed.relativePath; indexed.sections[0].sourceId = indexed.sections[0].relativePath;
    await persistIndex([indexed], "local", "space-6");
    const before = await getSourceEntityBindings(database, "space-6");
    indexed.sourceId = indexed.relativePath = "Portfolio 91 Nieuw";
    indexed.sections[0].sourceId = indexed.sections[0].relativePath = "Portfolio 91 Nieuw/1.1 Nieuw";
    await persistIndex([indexed], "local", "space-6");
    const after = await getSourceEntityBindings(database, "space-6");
    expect(after.map((binding) => binding.entityId).sort()).toEqual(before.map((binding) => binding.entityId).sort());
    expect(after.every((binding) => !supportsStableNativeIdentity(binding))).toBe(true);
    expect(after.map((binding) => binding.nativeItemId)).toEqual(expect.arrayContaining([indexed.sourceId, indexed.sections[0].sourceId]));
  });

  it("rolls back bindings with a failing publication and cascades only their owning entities", async () => {
    const database = await setup();
    await persistIndex([sourceBindingFixture()], "onedrive", "space-6");
    const before = await indexState();
    // Force a failure after bindings have been inserted, in the same transaction.
    await database.execute("CREATE TRIGGER reject_binding_validation BEFORE UPDATE ON learning_space_sources BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    await expect(persistIndex([sourceBindingFixture("92")], "onedrive", "space-6", { sourceId: source.id })).rejects.toThrow();
    expect(await indexState()).toEqual(before);
    await database.execute("DROP TRIGGER reject_binding_validation");
    await database.execute("DELETE FROM exercises");
    await database.execute("DELETE FROM sections");
    expect(await getSourceEntityBindings(database, "space-6")).toEqual([expect.objectContaining({ entityType: "portfolio" })]);
    await database.execute("DELETE FROM portfolios");
    expect(await getSourceEntityBindings(database, "space-6")).toEqual([]);
  });
});

describe("059 to 060 source binding migration", () => {
  it("preserves populated data, adds no guessed bindings and enforces scoped foreign keys and uniqueness", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-binding-migration-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 59)) {
      await legacy.batch([...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations VALUES (?, ?)", args: [migration.version, "checkpoint"] }], "write");
    }
    await legacy.execute("INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, title_override, relative_path, indexed_at, visible) VALUES ('p', 'space-6:91', '91', 'space-6', 'Bron', 'Eigen titel', 'Bron', 'old', 0)");
    await legacy.execute("INSERT INTO sections (id, portfolio_id, section_code, sort_order, title, relative_path) VALUES ('s', 'p', '1', 1, 'Bron', 'Bron/1')");
    await legacy.execute("INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, custom_note) VALUES ('e', 'p', 's', '1', 1, '', 'Bewaar')");
    const tables = ["portfolios", "sections", "exercises", "themes", "learning_space_sources", "source_profiles"];
    const before = await Promise.all(tables.map(async (table) => (await legacy.execute(`SELECT * FROM ${table} ORDER BY id`)).rows));
    legacy.close();
    process.env.PORTFOLIO_DATABASE_PATH = databasePath; resetDatabaseForTests();
    const database = await getDatabase();
    for (const [index, table] of tables.entries()) expect((await database.execute(`SELECT * FROM ${table} ORDER BY id`)).rows).toEqual(before[index]);
    expect(await getSourceEntityBindings(database, "space-6")).toEqual([]);
    const insert = (id: string, space: string, source: string, type: string, portfolio: string, section: string | null, native: string, kind = "path") => database.execute({
      sql: `INSERT INTO source_entity_bindings (id, learning_space_id, learning_space_source_id, provider_type, provider_namespace,
        identity_kind, entity_type, portfolio_id, section_id, native_item_id, created_at, updated_at) VALUES (?, ?, ?, 'local', 'root', ?, ?, ?, ?, ?, 'now', 'now')`,
      args: [id, space, source, kind, type, portfolio, section, native],
    });
    const source = (await getActiveLearningSpaceSource("space-6"))!.id;
    await insert("b", "space-6", source, "portfolio", "p", null, "native-p");
    await expect(insert("duplicate", "space-6", source, "section", "p", "s", "native-p")).rejects.toThrow();
    await expect(insert("duplicate-entity", "space-6", source, "portfolio", "p", null, "other-p")).rejects.toThrow();
    await expect(insert("bad-space", "space-5", source, "portfolio", "p", null, "new-p")).rejects.toThrow();
    await expect(insert("bad-source", "space-6", "space-5:primary", "section", "p", "s", "new-s")).rejects.toThrow();
    await expect(insert("bad-section", "space-6", source, "section", "p", "missing", "new-s")).rejects.toThrow();
    await expect(insert("bad-kind", "space-6", source, "section", "p", "s", "new-s", "native")).rejects.toThrow();
    await insert("section", "space-6", source, "section", "p", "s", "native-s");
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });
});
