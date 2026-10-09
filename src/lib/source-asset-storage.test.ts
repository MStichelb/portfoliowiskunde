import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import { getAdminResourceAsset, getAdminPortfolios, persistIndex } from "./repositories";
import { getSourceAssetBindings } from "./source-asset-bindings";
import { sourceBindingContextKey } from "./source-identity";
import { nativeBindingContext, sourceAssetBindingFixture, sourceAssetBindingInsert } from "@/test/source-binding-fixture";

let directory: string | undefined;
afterEach(async () => {
  resetDatabaseForTests(); delete process.env.PORTFOLIO_DATABASE_PATH;
  if (directory) {
    try { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error; }
  }
  directory = undefined;
}, 30_000);

async function setup() {
  directory = await mkdtemp(path.join(os.tmpdir(), "scoped-storage-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(directory, "metadata.db"); resetDatabaseForTests();
  const database = await getDatabase();
  await database.execute("UPDATE learning_space_sources SET provider_type = 'onedrive' WHERE learning_space_id IN ('space-6', 'space-5')");
  return database;
}

describe("scoped asset storage", () => {
  it("stores identical raw IDs and variant paths independently by source and namespace, then resyncs without new IDs", async () => {
    const database = await setup(); const indexed = sourceAssetBindingFixture();
    await persistIndex([indexed], "onedrive", "space-6");
    const first = await getSourceAssetBindings(database, "space-6");
    await database.execute("INSERT INTO learning_space_sources (id, learning_space_id, role, provider_type, is_active, created_at, updated_at) VALUES ('storage-mirror', 'space-6', 'mirror', 'onedrive', 0, 'old', 'old')");
    await persistIndex([indexed], "onedrive", "space-6", { sourceId: "storage-mirror" });
    const otherNamespace = sourceAssetBindingFixture("91", { ...nativeBindingContext, providerNamespace: "another-root" });
    await persistIndex([otherNamespace], "onedrive", "space-6", { sourceId: "storage-mirror" });
    const before = (await database.execute("SELECT * FROM source_asset_bindings ORDER BY id")).rows;
    await persistIndex([otherNamespace], "onedrive", "space-6", { sourceId: "storage-mirror" });
    expect((await database.execute("SELECT * FROM source_asset_bindings ORDER BY id")).rows).toEqual(before);
    expect((await database.execute("SELECT id FROM source_resource_assets")).rows).toHaveLength(6);
    const solutions = (await database.execute("SELECT id, variant_id, relative_path, source_id, storage_context_key FROM solution_assets")).rows;
    expect(solutions).toHaveLength(3);
    expect(new Set(solutions.map((row) => row.id)).size).toBe(3);
    expect(new Set(solutions.map((row) => row.relative_path)).size).toBe(1);
    expect(new Set(solutions.map((row) => row.variant_id)).size).toBe(1);
    expect(solutions.every((row) => row.source_id === "raw-solution-id")).toBe(true);
    expect(new Set(solutions.map((row) => row.storage_context_key)).size).toBe(3);
    await persistIndex([indexed], "onedrive", "space-6");
    expect((await getSourceAssetBindings(database, "space-6")).filter((binding) => binding.configuredSourceId === "space-6:primary")).toEqual(first);
    for (const binding of first) expect(await getAdminResourceAsset(binding.resourceAssetId!, "space-6")).toMatchObject({ sourceId: binding.nativeItemId });
    await persistIndex([indexed], "onedrive", "space-5");
    expect((await getSourceAssetBindings(database, "space-5"))[0].resourceAssetId).not.toBe(first[0].resourceAssetId);
  });

  it("adopts reliable current context on an exact legacy match without changing IDs, source IDs or variant parents", async () => {
    const database = await setup(); const indexed = sourceAssetBindingFixture();
    const legacy = structuredClone(indexed); delete legacy.sourceIdentityContext;
    for (const asset of [...legacy.resourceAssets, ...legacy.sections[0].exercises[0].assets]) delete asset.sourceIdentityContext;
    await persistIndex([legacy], "onedrive", "space-6");
    const generic = (await database.execute("SELECT id, source_id FROM source_resource_assets ORDER BY id")).rows;
    const solutions = (await database.execute("SELECT id, source_id, variant_id FROM solution_assets ORDER BY id")).rows;
    await persistIndex([indexed], "onedrive", "space-6");
    expect((await database.execute("SELECT id, source_id FROM source_resource_assets ORDER BY id")).rows).toEqual(generic);
    expect((await database.execute("SELECT id, source_id, variant_id FROM solution_assets ORDER BY id")).rows).toEqual(solutions);
    const context = sourceBindingContextKey({ ...nativeBindingContext, learningSpaceId: "space-6", configuredSourceId: "space-6:primary" });
    expect((await database.execute("SELECT storage_context_key FROM source_resource_assets")).rows.every((row) => row.storage_context_key === context)).toBe(true);
    expect((await database.execute("SELECT storage_context_key FROM solution_assets")).rows[0].storage_context_key).toBe(context);
  });

  it("keeps independent configured sources with identical raw IDs under different parents separate", async () => {
    const database = await setup();
    await persistIndex([sourceAssetBindingFixture()], "onedrive", "space-6");
    const first = await getSourceAssetBindings(database, "space-6");
    await database.execute("INSERT INTO learning_space_sources (id, learning_space_id, role, provider_type, is_active, created_at, updated_at) VALUES ('other-parent-source', 'space-6', 'mirror', 'onedrive', 0, 'old', 'old')");
    await persistIndex([sourceAssetBindingFixture("92")], "onedrive", "space-6", { sourceId: "other-parent-source" });
    const other = (await getSourceAssetBindings(database, "space-6")).filter((binding) => binding.configuredSourceId === "other-parent-source");
    expect(other).toHaveLength(2);
    expect(other.map((binding) => binding.nativeItemId).sort()).toEqual(first.map((binding) => binding.nativeItemId).sort());
    expect(other[0].portfolioId).not.toBe(first[0].portfolioId);
    expect((await database.execute("SELECT id FROM source_resource_assets")).rows).toHaveLength(4);
    expect((await database.execute("SELECT id FROM solution_assets")).rows).toHaveLength(2);
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("never overwrites a scoped asset when a provider later supplies no identity context", async () => {
    const database = await setup(); const indexed = sourceAssetBindingFixture();
    const legacy = structuredClone(indexed); delete legacy.sourceIdentityContext;
    for (const asset of [...legacy.resourceAssets, ...legacy.sections[0].exercises[0].assets]) delete asset.sourceIdentityContext;
    await persistIndex([legacy], "onedrive", "space-6");
    await persistIndex([indexed], "onedrive", "space-6");
    const scopedIds = (await database.execute("SELECT id, storage_context_key FROM source_resource_assets ORDER BY id")).rows;
    const scopedSolutions = (await database.execute("SELECT id, storage_context_key FROM solution_assets ORDER BY id")).rows;
    legacy.sourceIdentityContext = indexed.sourceIdentityContext;
    await persistIndex([legacy], "onedrive", "space-6");
    expect((await database.execute("SELECT id, storage_context_key FROM source_resource_assets WHERE storage_context_key IS NOT NULL ORDER BY id")).rows).toEqual(scopedIds);
    expect((await database.execute("SELECT id, storage_context_key FROM solution_assets WHERE storage_context_key IS NOT NULL ORDER BY id")).rows).toEqual(scopedSolutions);
    expect((await database.execute("SELECT id FROM source_resource_assets WHERE storage_context_key IS NULL")).rows).toHaveLength(2);
    expect((await database.execute("SELECT id FROM solution_assets WHERE storage_context_key IS NULL")).rows).toHaveLength(1);
  });

  it("enforces both NULL legacy uniqueness and scoped uniqueness and rolls back conflicting publication", async () => {
    const database = await setup(); const indexed = sourceAssetBindingFixture();
    await persistIndex([indexed], "onedrive", "space-6");
    const copyResource = (id: string, context: string | null) => database.execute({
      sql: `INSERT INTO source_resource_assets (id, learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id,
        semantic_role, source_id, relative_path, file_name, extension, step, last_seen_at, storage_context_key)
        SELECT ?, learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id, semantic_role, source_id,
          relative_path, file_name, extension, step, last_seen_at, ? FROM source_resource_assets WHERE resource_scope = 'exercise' AND id <> 'legacy-copy' LIMIT 1`,
      args: [id, context],
    });
    const context = (await database.execute("SELECT storage_context_key FROM solution_assets")).rows[0].storage_context_key as string;
    await expect(copyResource("scoped-duplicate", context)).rejects.toThrow();
    await copyResource("legacy-copy", null);
    await expect(copyResource("legacy-duplicate", null)).rejects.toThrow();
    await expect(database.execute(`INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step, source_id, storage_context_key)
      SELECT 'scoped-solution-duplicate', variant_id, relative_path, file_name, extension, step, source_id, storage_context_key FROM solution_assets`)).rejects.toThrow();
    await database.execute(`INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step, source_id)
      SELECT 'legacy-solution', variant_id, relative_path, file_name, extension, step, NULL FROM solution_assets`);
    await expect(database.execute(`INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step)
      SELECT 'legacy-solution-duplicate', variant_id, relative_path, file_name, extension, step FROM solution_assets WHERE id = 'legacy-solution'`)).rejects.toThrow();
    const tables = ["portfolios", "exercises", "solution_assets", "source_resource_assets", "source_asset_bindings", "sync_runs"];
    const snapshot = () => Promise.all(tables.map(async (table) => (await database.execute(`SELECT * FROM ${table} ORDER BY id`)).rows));
    const before = await snapshot();
    const conflict = structuredClone(indexed); const asset = conflict.sections[0].exercises[0].assets[0];
    conflict.sections[0].exercises.push({ code: "2", number: 2, suffix: "", assets: [{ ...asset, parsed: { ...asset.parsed, exerciseCode: "2", exerciseNumber: 2 } }] });
    await expect(persistIndex([conflict], "onedrive", "space-6")).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    await expect(database.batch([
      { sql: "UPDATE portfolios SET title = 'must-rollback'" },
      { sql: `INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step, source_id, storage_context_key)
        SELECT 'late-duplicate', variant_id, 'different-path.png', file_name, extension, step, source_id, storage_context_key FROM solution_assets WHERE storage_context_key IS NOT NULL` },
    ])).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
});

describe("061 to 062 migration", () => {
  it("preserves all data and nonempty binding FKs, leaves every historical asset unscoped, and keeps legacy assets readable", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "storage-migration-")); const file = path.join(directory, "metadata.db");
    const legacy = createClient({ url: `file:${file.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 61)) await legacy.batch([
      ...migration.statements.map((sql) => ({ sql, args: [] })), { sql: "INSERT INTO schema_migrations VALUES (?, 'old')", args: [migration.version] },
    ], "write");
    await legacy.execute("INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, indexed_at) VALUES ('p', 'space-6:99', '99', 'space-6', 'Bron', 'Bron', 'old')");
    await legacy.execute("INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix) VALUES ('e', 'p', NULL, '1', 1, '')");
    await legacy.execute("INSERT INTO solution_variants (id, exercise_id, kind, label) VALUES ('v', 'e', 'standard', 'Bron')");
    await legacy.execute("INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step, source_id) VALUES ('old-a', 'v', 'Bron/1.png', '1.png', 'png', 1, NULL)");
    await legacy.execute("INSERT INTO source_resource_assets (id, learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id, semantic_role, source_id, relative_path, file_name, extension, last_seen_at) VALUES ('old-g', 'space-6', 'p', 'e', 'exercise', 'worked-solution', 'worked_solution', 'old-item', 'Bron/1.png', '1.png', 'png', 'old')");
    await legacy.execute(sourceAssetBindingInsert("old-binding", { providerType: "local", providerNamespace: "known-old-root", identityKind: "path", learningSpaceId: "space-6", configuredSourceId: "space-6:primary", nativeItemId: "old-item", resourceScope: "exercise", resourceId: "worked-solution", portfolioId: "p", exerciseId: "e", resourceAssetId: "old-g", solutionAssetId: "old-a", variantId: "v" }));
    const tables = (await legacy.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name")).rows.map((row) => String(row.name));
    const before = await Promise.all(tables.map(async (table) => (await legacy.execute(`SELECT * FROM ${table} ORDER BY 1`)).rows));
    const oldIndexes = (await legacy.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('source_resource_assets', 'solution_assets') AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name")).rows;
    legacy.close();
    process.env.PORTFOLIO_DATABASE_PATH = file; resetDatabaseForTests(); const database = await getDatabase();
    for (const [index, table] of tables.entries()) {
      const after = (await database.execute(`SELECT * FROM ${table} ORDER BY 1`)).rows;
      expect(after.map(({ storage_context_key, ...row }) => { if (["source_resource_assets", "solution_assets"].includes(table)) expect(storage_context_key).toBeNull(); return row; }), table).toEqual(before[index]);
    }
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    expect((await database.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('source_resource_assets', 'solution_assets') ORDER BY name")).rows).toEqual(expect.arrayContaining(oldIndexes));
    expect((await getAdminPortfolios("space-6"))[0].exercises![0].assets[0].id).toBe("old-a");
    expect(await getAdminResourceAsset("old-g", "space-6")).toMatchObject({ sourceId: "old-item" });
    expect((await database.execute("SELECT version FROM schema_migrations WHERE version LIKE '062%'")).rows).toHaveLength(1);
  });
});
