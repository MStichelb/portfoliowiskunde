import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import { getActiveLearningSpaceSource, getAdminPortfolios, persistIndex } from "./repositories";
import { getSourceAssetBindings, prepareSourceAssetBindingWrites } from "./source-asset-bindings";
import { supportsStableNativeIdentity } from "./source-identity";
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

async function setup(provider = "onedrive") {
  directory = await mkdtemp(path.join(os.tmpdir(), "asset-binding-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(directory, "metadata.db"); resetDatabaseForTests();
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE learning_space_sources SET provider_type = ? WHERE learning_space_id IN ('space-6', 'space-5')", args: [provider] });
  return database;
}

async function state() {
  const database = await getDatabase();
  const tables = ["portfolios", "sections", "exercises", "solution_variants", "solution_assets", "source_resource_assets",
    "source_asset_bindings", "source_entity_bindings", "sync_runs", "sync_warnings", "learning_space_sources"];
  return Promise.all(tables.map(async (table) => (await database.execute(`SELECT * FROM ${table} ORDER BY id`)).rows));
}

describe("source asset identity storage", () => {
  it("records scoped identities for both models without changing asset IDs, parents, metadata or repeated-sync timestamps", async () => {
    const database = await setup();
    const indexed = sourceAssetBindingFixture();
    // Current legacy matching chooses the original app IDs before any scope is attached.
    const unbound = structuredClone(indexed); delete unbound.sourceIdentityContext;
    for (const asset of [...unbound.resourceAssets, ...unbound.sections[0].exercises[0].assets]) delete asset.sourceIdentityContext;
    await persistIndex([unbound], "onedrive", "space-6");
    expect(await getSourceAssetBindings(database, "space-6")).toEqual([]);
    const generic = (await database.execute("SELECT * FROM source_resource_assets ORDER BY id")).rows;
    const legacy = (await database.execute("SELECT * FROM solution_assets ORDER BY id")).rows;
    await persistIndex([indexed], "onedrive", "space-6");
    const bindings = (await database.execute("SELECT * FROM source_asset_bindings ORDER BY id")).rows;
    expect(bindings).toHaveLength(2);
    for (let repeat = 0; repeat < 2; repeat++) await persistIndex([indexed], "onedrive", "space-6");
    expect((await database.execute("SELECT * FROM source_asset_bindings ORDER BY id")).rows).toEqual(bindings);
    expect((await database.execute("SELECT id, variant_id FROM solution_assets ORDER BY id")).rows).toEqual(legacy.map(({ id, variant_id }) => ({ id, variant_id })));
    expect((await database.execute("SELECT id, portfolio_id, exercise_id, resource_id FROM source_resource_assets ORDER BY id")).rows)
      .toEqual(generic.map(({ id, portfolio_id, exercise_id, resource_id }) => ({ id, portfolio_id, exercise_id, resource_id })));
    expect(await getSourceAssetBindings(database, "space-6")).toEqual(expect.arrayContaining([
      expect.objectContaining({ ...nativeBindingContext, nativeItemId: "raw-solution-id", resourceScope: "exercise", resourceId: "worked-solution",
        solutionAssetId: legacy[0].id, variantId: legacy[0].variant_id }),
      expect.objectContaining({ nativeItemId: "raw-document-id", resourceScope: "portfolio", solutionAssetId: null, variantId: null }),
    ]));
  });

  it("keeps identical raw IDs distinct by configured source, provider namespace, provider and LearningSpace", async () => {
    const database = await setup(); const indexed = sourceAssetBindingFixture();
    await persistIndex([indexed], "onedrive", "space-6");
    const originalIds = (await database.execute("SELECT id FROM source_resource_assets ORDER BY id")).rows;
    await database.execute("INSERT INTO learning_space_sources (id, learning_space_id, role, provider_type, is_active, created_at, updated_at) VALUES ('asset-mirror', 'space-6', 'mirror', 'onedrive', 0, 'old', 'old')");
    await persistIndex([indexed], "onedrive", "space-6", { sourceId: "asset-mirror" });
    await persistIndex([sourceAssetBindingFixture("91", { ...nativeBindingContext, providerNamespace: "another-drive-root" })], "onedrive", "space-6", { sourceId: "asset-mirror" });
    await persistIndex([indexed], "onedrive", "space-5");
    expect(await getSourceAssetBindings(database, "space-6")).toHaveLength(6);
    expect((await database.execute("SELECT id FROM source_resource_assets WHERE learning_space_id = 'space-6' ORDER BY id")).rows).toEqual(expect.arrayContaining(originalIds));
    expect(new Set((await getSourceAssetBindings(database, "space-6")).map((binding) => binding.configuredSourceId + binding.providerNamespace)).size).toBe(3);
    expect((await getSourceAssetBindings(database, "space-5"))[0].resourceAssetId).not.toBe((await getSourceAssetBindings(database, "space-6"))[0].resourceAssetId);
    await database.execute("UPDATE learning_space_sources SET provider_type = 'google_drive' WHERE id = 'asset-mirror'");
    await persistIndex([sourceAssetBindingFixture("91", { providerType: "google_drive", providerNamespace: "google-account-root", identityKind: "native" })], "google_drive", "space-6", { sourceId: "asset-mirror" });
    expect(await getSourceAssetBindings(database, "space-6")).toHaveLength(8);
  });

  it.each(["wrong-namespace", "wrong-provider", "invalid-capability", "wrong-parent", "wrong-paired-asset"])("refuses %s without partial publication", async (scenario) => {
    const database = await setup(); const indexed = sourceAssetBindingFixture();
    await persistIndex([indexed], "onedrive", "space-6"); const before = await state();
    const asset = indexed.sections[0].exercises[0].assets[0];
    if (scenario === "wrong-namespace") asset.sourceIdentityContext = { ...nativeBindingContext, providerNamespace: "foreign" };
    if (scenario === "wrong-provider") asset.sourceIdentityContext = { ...nativeBindingContext, providerType: "google_drive" };
    if (scenario === "invalid-capability") asset.sourceIdentityContext = { ...nativeBindingContext, identityKind: "path" };
    if (scenario === "wrong-parent") {
      // Same provider file, changed logical exercise: scope recording must not steal the old asset.
      indexed.sections[0].exercises[0].code = "2"; asset.parsed.exerciseCode = "2"; asset.parsed.exerciseNumber = 2;
    }
    if (scenario === "wrong-paired-asset") {
      const binding = (await getSourceAssetBindings(database, "space-6")).find((item) => item.solutionAssetId)!;
      await expect(prepareSourceAssetBindingWrites(database, "space-6", [{ ...binding, solutionAssetId: "another-asset" }], "new")).rejects.toThrow();
    } else await expect(persistIndex([indexed], "onedrive", "space-6")).rejects.toThrow();
    expect(await state()).toEqual(before);
  });

  it("stores path capability for LocalFS and leaves assets without an explicit item context unbound", async () => {
    const database = await setup("local");
    const indexed = sourceAssetBindingFixture("91", { providerType: "local", providerNamespace: "absolute-root", identityKind: "path" });
    await persistIndex([indexed], "local", "space-6");
    expect((await getSourceAssetBindings(database, "space-6")).every((binding) => !supportsStableNativeIdentity(binding))).toBe(true);
    const other = sourceAssetBindingFixture("92", indexed.sourceIdentityContext);
    for (const asset of [...other.resourceAssets, ...other.sections[0].exercises[0].assets]) { delete asset.sourceIdentityContext; asset.sourceId += "-other"; }
    await persistIndex([other], "local", "space-6");
    expect(await getSourceAssetBindings(database, "space-6")).toHaveLength(2);
  });

  it("does not bind any of several legacy candidates when existing matching reports ambiguity", async () => {
    const database = await setup(); const indexed = sourceAssetBindingFixture();
    indexed.resourceAssets = [];
    const asset = indexed.sections[0].exercises[0].assets[0];
    delete asset.sourceIdentityContext;
    await persistIndex([indexed], "onedrive", "space-6");
    await database.execute(`INSERT INTO source_resource_assets (id, learning_space_id, portfolio_id, exercise_id,
      resource_scope, resource_id, semantic_role, source_id, relative_path, file_name, extension, step, last_seen_at)
      SELECT 'ambiguous-generic', learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id,
        semantic_role, 'other-item', 'other.png', 'other.png', extension, step, last_seen_at FROM source_resource_assets`);
    await database.execute(`INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step, source_id)
      SELECT 'ambiguous-solution', variant_id, 'other.png', 'other.png', extension, step, 'other-item' FROM solution_assets`);
    const beforeIds = (await database.execute("SELECT id FROM source_resource_assets ORDER BY id")).rows;
    const beforeSolutionIds = (await database.execute("SELECT id FROM solution_assets ORDER BY id")).rows;
    asset.sourceIdentityContext = nativeBindingContext; asset.sourceId = "new-item";
    asset.relativePath = "renamed.png"; asset.fileName = "renamed.png";
    await persistIndex([indexed], "onedrive", "space-6");
    expect(await getSourceAssetBindings(database, "space-6")).toEqual([]);
    expect((await database.execute("SELECT id FROM source_resource_assets ORDER BY id")).rows).toEqual(beforeIds);
    expect((await database.execute("SELECT id FROM solution_assets ORDER BY id")).rows).toEqual(beforeSolutionIds);
    expect((await database.execute("SELECT message FROM sync_warnings")).rows.some((row) => String(row.message).includes("meerdere mogelijke"))).toBe(true);
  });

  it("retains asset scope through the existing root/section exercise moves without changing matching", async () => {
    const database = await setup(); const indexed = sourceAssetBindingFixture();
    await persistIndex([indexed], "onedrive", "space-6");
    const before = await getSourceAssetBindings(database, "space-6"); const original = (await getAdminPortfolios("space-6"))[0];
    indexed.exercises = indexed.sections[0].exercises; indexed.sections = [];
    await persistIndex([indexed], "onedrive", "space-6");
    expect((await getAdminPortfolios("space-6"))[0].exercises![0].id).toBe(original.sections[0].exercises![0].id);
    expect(await getSourceAssetBindings(database, "space-6")).toEqual(before);
  });

  it("copies proven Fase-2 duplicate-parent results into current and historical asset scopes", async () => {
    const database = await setup(); const indexed = sourceAssetBindingFixture();
    await persistIndex([indexed], "onedrive", "space-6");
    const pair = (await getSourceAssetBindings(database, "space-6")).find((binding) => binding.solutionAssetId)!;
    const sectionId = `${pair.portfolioId}-section-2`; const duplicateId = `${sectionId}-exercise-1`;
    await database.batch([
      { sql: "INSERT INTO sections (id, portfolio_id, section_code, sort_order, title, relative_path) VALUES (?, ?, '2', 2, 'Nieuw', 'Nieuw')", args: [sectionId, pair.portfolioId] },
      { sql: "INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix) VALUES (?, ?, ?, '1', 1, '')", args: [duplicateId, pair.portfolioId, sectionId] },
      { sql: "INSERT INTO solution_variants (id, exercise_id, kind, label) VALUES (?, ?, 'standard', 'Standaard')", args: [`${duplicateId}-standard`, duplicateId] },
      { sql: `INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step, source_id)
        VALUES ('duplicate-step-2', ?, 'Nieuw/step2.png', 'step2.png', 'png', 2, 'raw-step-2')`, args: [`${duplicateId}-standard`] },
      { sql: `INSERT INTO source_resource_assets (id, learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id,
        semantic_role, source_id, relative_path, file_name, extension, step, last_seen_at)
        VALUES ('duplicate-resource-2', 'space-6', ?, ?, 'exercise', 'worked-solution', 'worked_solution', 'raw-step-2',
          'Nieuw/step2.png', 'step2.png', 'png', 2, 'old')`, args: [pair.portfolioId, duplicateId] },
      sourceAssetBindingInsert("duplicate-historical-scope", { ...pair, nativeItemId: "raw-step-2", providerNamespace: "historical-root",
        exerciseId: duplicateId, resourceAssetId: "duplicate-resource-2", solutionAssetId: "duplicate-step-2", variantId: `${duplicateId}-standard` }),
      { sql: "UPDATE exercises SET is_indexed = 0 WHERE id = ?", args: [pair.exerciseId] },
      { sql: "UPDATE solution_variants SET is_indexed = 0 WHERE id = ?", args: [pair.variantId] },
      { sql: "UPDATE solution_assets SET is_indexed = 0 WHERE id = ?", args: [pair.solutionAssetId] },
      { sql: "UPDATE source_resource_assets SET is_indexed = 0 WHERE id = ?", args: [pair.resourceAssetId] },
    ]);
    indexed.sections[0].code = "2"; indexed.sections[0].sourceId = "new-section-folder";
    const asset = indexed.sections[0].exercises[0].assets[0];
    indexed.sections[0].exercises[0].assets.push({ ...asset, sourceId: "raw-step-2", relativePath: "Nieuw/step2.png",
      fileName: "step2.png", parsed: { ...asset.parsed, step: 2 } });
    await persistIndex([indexed], "onedrive", "space-6");
    const historical = (await getSourceAssetBindings(database, "space-6")).find((binding) => binding.providerNamespace === "historical-root")!;
    expect(historical).toMatchObject({ exerciseId: pair.exerciseId, variantId: pair.variantId,
      resourceAssetId: "duplicate-resource-2", solutionAssetId: "duplicate-step-2" });
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    expect((await database.execute("SELECT id FROM solution_assets ORDER BY id")).rows).toEqual([
      { id: "duplicate-step-2" }, { id: pair.solutionAssetId },
    ].sort((left, right) => String(left.id).localeCompare(String(right.id))));
  });

  it("rolls back asset scope and every existing row when a statement after binding writes fails", async () => {
    const database = await setup(); await persistIndex([sourceAssetBindingFixture()], "onedrive", "space-6");
    const before = await state();
    await database.execute("CREATE TRIGGER reject_asset_scope_validation BEFORE UPDATE ON learning_space_sources BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    const other = sourceAssetBindingFixture("92");
    for (const asset of [...other.resourceAssets, ...other.sections[0].exercises[0].assets]) asset.sourceId += "-new";
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    await expect(persistIndex([other], "onedrive", "space-6", { sourceId: source.id })).rejects.toThrow();
    expect(await state()).toEqual(before);
  });

  it("enforces unique identities, typed model/parent FKs and rolls back a deferred constraint failure", async () => {
    const database = await setup(); await persistIndex([sourceAssetBindingFixture()], "onedrive", "space-6");
    const pair = (await getSourceAssetBindings(database, "space-6")).find((binding) => binding.solutionAssetId)!;
    const document = (await getSourceAssetBindings(database, "space-6")).find((binding) => binding.resourceScope === "portfolio")!;
    await database.execute(sourceAssetBindingInsert("another-namespace", { ...pair, providerNamespace: "other" }));
    const other = sourceAssetBindingFixture("92");
    for (const asset of [...other.resourceAssets, ...other.sections[0].exercises[0].assets]) asset.sourceId += "-other";
    await persistIndex([sourceAssetBindingFixture(), other], "onedrive", "space-6");
    const otherPair = (await getSourceAssetBindings(database, "space-6")).find((binding) => binding.nativeItemId === "raw-solution-id-other")!;
    await database.execute(sourceAssetBindingInsert("same-raw-other-parent", { ...otherPair,
      nativeItemId: pair.nativeItemId, providerNamespace: "isolated-other-parent" }));
    expect(otherPair.solutionAssetId).not.toBe(pair.solutionAssetId);
    const before = await state();
    const invalid = [
      pair,
      { ...pair, configuredSourceId: "space-5:primary" },
      { ...pair, learningSpaceId: "space-5" },
      { ...pair, portfolioId: "missing" },
      { ...pair, exerciseId: "missing" },
      { ...pair, resourceId: "other-resource" },
      { ...pair, resourceAssetId: document.resourceAssetId },
      { ...pair, solutionAssetId: "missing" },
      { ...pair, variantId: "missing" },
      { ...pair, identityKind: "path" as const },
      { ...pair, providerNamespace: "" },
      { ...pair, resourceAssetId: null, solutionAssetId: null, variantId: null },
    ];
    for (const [index, binding] of invalid.entries()) await expect(database.execute(sourceAssetBindingInsert(`invalid-${index}`, binding))).rejects.toThrow();
    expect(await state()).toEqual(before);
    await expect(database.batch([
      { sql: "UPDATE exercises SET custom_note = 'must-rollback' WHERE id = ?", args: [pair.exerciseId] },
      sourceAssetBindingInsert("deferred-rollback", { ...pair, providerNamespace: "rollback", solutionAssetId: "missing" }),
    ])).rejects.toThrow();
    expect(await state()).toEqual(before);
  });
});

describe("060 to 061 asset source scope migration", () => {
  it("preserves every legacy table and app ID without inventing asset scope", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "asset-scope-migration-")); const file = path.join(directory, "metadata.db");
    const legacy = createClient({ url: `file:${file.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 60)) await legacy.batch([
      ...migration.statements.map((sql) => ({ sql, args: [] })), { sql: "INSERT INTO schema_migrations VALUES (?, 'old')", args: [migration.version] },
    ], "write");
    await legacy.execute("INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, indexed_at) VALUES ('p', 'space-6:99', '99', 'space-6', 'Bron', 'Bron', 'old')");
    await legacy.execute("INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix) VALUES ('e', 'p', NULL, '1', 1, '')");
    await legacy.execute("INSERT INTO solution_variants (id, exercise_id, kind, label) VALUES ('v', 'e', 'standard', 'Bron')");
    await legacy.execute("INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step, source_id) VALUES ('legacy-a', 'v', 'Bron/1.png', '1.png', 'png', 1, NULL)");
    await legacy.execute("INSERT INTO source_resource_assets (id, learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id, semantic_role, source_id, relative_path, file_name, extension, last_seen_at) VALUES ('generic-a', 'space-6', 'p', 'e', 'exercise', 'worked-solution', 'worked_solution', 'legacy-item', 'Bron/1.png', '1.png', 'png', 'old')");
    const tables = (await legacy.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name")).rows.map((row) => String(row.name));
    const before = await Promise.all(tables.map(async (table) => (await legacy.execute(`SELECT * FROM ${table} ORDER BY 1`)).rows)); legacy.close();
    process.env.PORTFOLIO_DATABASE_PATH = file; resetDatabaseForTests(); const database = await getDatabase();
    for (const [index, table] of tables.entries()) {
      const rows = (await database.execute(`SELECT * FROM ${table} ORDER BY 1`)).rows;
      expect(rows.map(({ storage_context_key, ...row }) => { if (["source_resource_assets", "solution_assets"].includes(table)) expect(storage_context_key).toBeNull(); return row; }), table).toEqual(before[index]);
    }
    expect(await getSourceAssetBindings(database, "space-6")).toEqual([]);
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    expect((await getAdminPortfolios("space-6"))[0].exercises![0].assets[0].id).toBe("legacy-a");
  });
});
