import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { getActiveLearningSpaceSource, persistIndex } from "./repositories";
import { getSourceAssetBindings } from "./source-asset-bindings";
import { nativeBindingContext, sourceAssetBindingFixture, sourceAssetBindingInsert, sourceBindingFixture } from "@/test/source-binding-fixture";
import { sourceChildState, verifyHistoricalChildContexts, verifyNativeChildContinuity } from "@/test/source-child-reconciliation-scenarios";

let directory: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks(); resetDatabaseForTests(); delete process.env.PORTFOLIO_DATABASE_PATH;
  if (directory) {
    try { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error; }
  }
  directory = undefined;
}, 30_000);

async function setup() {
  directory = await mkdtemp(path.join(os.tmpdir(), "child-reconciliation-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(directory, "metadata.db"); resetDatabaseForTests();
  const database = await getDatabase();
  await database.execute("UPDATE learning_space_sources SET provider_type = 'onedrive' WHERE learning_space_id = 'space-6'");
  const source = (await getActiveLearningSpaceSource("space-6"))!;
  return { database, source };
}

describe("central child reconciliation", () => {
  it("preserves native section and both asset IDs across code/title/path/step/order changes, missing-return and Fase-2 exercise moves with reports", async () => {
    const { database, source } = await setup();
    await verifyNativeChildContinuity(database, "space-6", source.id);
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("reuses exactly bound historical contexts without splitting IDs or dropping history and isolates new contexts", async () => {
    const { database, source } = await setup();
    await verifyHistoricalChildContexts(database, "space-6", source.id);
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("does not treat a migrated NULL asset with historical path bindings as an unbound asset in a new context", async () => {
    const { database } = await setup();
    await database.execute("UPDATE learning_space_sources SET provider_type = 'local' WHERE learning_space_id = 'space-6'");
    const indexed = sourceAssetBindingFixture("91", { providerType: "local", providerNamespace: "old-local-root", identityKind: "path" });
    await persistIndex([indexed], "local", "space-6");
    const original = await getSourceAssetBindings(database, "space-6");
    // Migration 062 leaves all pre-existing rows NULL, including rows with historical bindings.
    await database.execute("UPDATE source_resource_assets SET storage_context_key = NULL");
    await database.execute("UPDATE solution_assets SET storage_context_key = NULL");
    await database.execute("UPDATE learning_space_sources SET provider_type = 'onedrive' WHERE learning_space_id = 'space-6'");
    indexed.sourceIdentityContext = nativeBindingContext;
    for (const asset of [...indexed.resourceAssets, ...indexed.sections[0].exercises[0].assets]) asset.sourceIdentityContext = nativeBindingContext;
    await persistIndex([indexed], "onedrive", "space-6"); await persistIndex([indexed], "onedrive", "space-6");
    const current = (await getSourceAssetBindings(database, "space-6")).filter((binding) => binding.providerType === "onedrive");
    expect(current).toHaveLength(2);
    for (const binding of current) expect(original.map((item) => item.resourceAssetId)).not.toContain(binding.resourceAssetId);
    expect((await getSourceAssetBindings(database, "space-6")).filter((binding) => binding.providerType === "local")).toEqual(original);
  });

  it("adopts a legacy solution with NULL provider ID without violating the scoped check or changing app IDs", async () => {
    const { database } = await setup(); const legacy = sourceAssetBindingFixture();
    delete legacy.sourceIdentityContext;
    for (const asset of [...legacy.resourceAssets, ...legacy.sections[0].exercises[0].assets]) delete asset.sourceIdentityContext;
    await persistIndex([legacy], "onedrive", "space-6");
    const original = (await database.execute("SELECT id, variant_id FROM solution_assets")).rows[0];
    await database.execute("UPDATE solution_assets SET source_id = NULL");
    const indexed = sourceAssetBindingFixture();
    await persistIndex([indexed], "onedrive", "space-6"); await persistIndex([indexed], "onedrive", "space-6");
    const rows = (await database.execute("SELECT id, variant_id, source_id, relative_path, storage_context_key FROM solution_assets")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ...original, source_id: "raw-solution-id", relative_path: indexed.sections[0].exercises[0].assets[0].relativePath });
    expect(rows[0].storage_context_key).not.toBeNull();
    expect((await getSourceAssetBindings(database, "space-6")).find((binding) => binding.solutionAssetId)!.solutionAssetId).toBe(original.id);
  });

  it("binds a unique legacy section without losing metadata and never recycles its generated ID after a native code rename", async () => {
    const { database } = await setup(); const indexed = sourceBindingFixture();
    const identity = indexed.sourceIdentityContext; delete indexed.sourceIdentityContext;
    await persistIndex([indexed], "onedrive", "space-6");
    const section = (await database.execute("SELECT * FROM sections")).rows[0];
    await database.execute({ sql: "UPDATE sections SET visibility_mode = 'hidden' WHERE id = ?", args: [String(section.id)] });
    indexed.sourceIdentityContext = identity;
    await persistIndex([indexed], "onedrive", "space-6");
    indexed.sections[0].code = "2";
    await persistIndex([indexed], "onedrive", "space-6");
    indexed.sections.push({ ...indexed.sections[0], code: "1.1", sourceId: "brand-new-section", exercises: [] });
    await persistIndex([indexed], "onedrive", "space-6"); await persistIndex([indexed], "onedrive", "space-6");
    const rows = (await database.execute("SELECT * FROM sections ORDER BY section_code")).rows;
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.section_code === "2")).toMatchObject({ id: section.id, visibility_mode: "hidden" });
    expect(rows.find((row) => row.section_code === "1.1")).toMatchObject({ visibility_mode: "visible" });
    expect(rows.find((row) => row.section_code === "1.1")!.id).not.toBe(section.id);
  });

  it.each(["metadata", "reports", "solutions"])("rejects a conflicting Fase-2 %s merge before any publication writes", async (scenario) => {
    const { database } = await setup(); const indexed = sourceBindingFixture();
    await persistIndex([indexed], "onedrive", "space-6");
    const retained = (await database.execute("SELECT * FROM exercises")).rows[0];
    const targetSectionId = `${retained.portfolio_id}-section-2`; const duplicateId = `${targetSectionId}-exercise-1`;
    await database.batch([
      { sql: "INSERT INTO sections (id, portfolio_id, section_code, sort_order, title, relative_path) VALUES (?, ?, '2', 2, 'Nieuw', 'Nieuw')", args: [targetSectionId, String(retained.portfolio_id)] },
      { sql: "INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix) VALUES (?, ?, ?, '1', 1, '')", args: [duplicateId, String(retained.portfolio_id), targetSectionId] },
      { sql: "UPDATE exercises SET is_indexed = 0 WHERE id = ?", args: [String(retained.id)] },
    ]);
    if (scenario === "metadata") {
      await database.execute({ sql: "UPDATE exercises SET custom_note = 'Oude notitie' WHERE id = ?", args: [String(retained.id)] });
      await database.execute({ sql: "UPDATE exercises SET custom_note = 'Andere notitie' WHERE id = ?", args: [duplicateId] });
    }
    if (scenario === "reports") {
      for (const [index, id] of [String(retained.id), duplicateId].entries()) await database.execute({
        sql: "INSERT INTO error_report_threads (id, learning_space_id, portfolio_id, exercise_id, exercise_code, created_at, updated_at) VALUES (?, 'space-6', ?, ?, ?, 'old', 'old')",
        args: [`thread-${index}`, String(retained.portfolio_id), id, `historical-${index}`],
      });
    }
    if (scenario === "solutions") {
      for (const id of [String(retained.id), duplicateId]) {
        await database.execute({ sql: "INSERT INTO solution_variants (id, exercise_id, kind, label) VALUES (?, ?, 'standard', 'Standaard')", args: [`${id}-standard`, id] });
        for (const index of [1, 2]) await database.execute({
          sql: "INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step, source_id) VALUES (?, ?, ?, 'historical.png', 'png', 1, ?)",
          args: [`${id}-asset-${index}`, `${id}-standard`, `${id}-${index}.png`, `${id}-raw-${index}`],
        });
      }
    }
    indexed.sections[0].code = "2"; indexed.sections[0].sourceId = "target-section-native";
    const before = await sourceChildState(database, "space-6"); const batch = vi.spyOn(database, "batch");
    await expect(persistIndex([indexed], "onedrive", "space-6")).rejects.toThrow("conflicterende metadata, rapporten of uitwerkingen");
    expect(batch).not.toHaveBeenCalled();
    expect(await sourceChildState(database, "space-6")).toEqual(before);
  });

  it.each(["section-native-replacement", "section-occupied-code", "section-cross-portfolio", "duplicate-section-native", "section-portfolio-type",
    "changed-exercise-code", "changed-variant", "changed-resource", "asset-cross-portfolio", "duplicate-asset-native", "different-native-at-bound-path",
    "two-native-bindings-one-app-id"])("rejects %s before publication and retains every previous row", async (scenario) => {
    const { database, source } = await setup(); const indexed = sourceAssetBindingFixture();
    if (scenario === "section-occupied-code") indexed.sections.push({ ...structuredClone(indexed.sections[0]), code: "2", sourceId: "second-section", exercises: [] });
    await persistIndex([indexed], "onedrive", "space-6", { sourceId: source.id });
    const portfolios = [indexed];
    const exercise = indexed.sections[0].exercises[0]; const asset = exercise.assets[0];
    if (scenario === "section-native-replacement") indexed.sections[0].sourceId = "another-native-section";
    if (scenario === "section-occupied-code") { indexed.sections.pop(); indexed.sections[0].code = "2"; }
    if (scenario === "duplicate-section-native") indexed.sections.push({ ...indexed.sections[0], code: "2", exercises: [] });
    if (scenario === "section-portfolio-type") indexed.sections[0].sourceId = indexed.sourceId;
    if (scenario === "section-cross-portfolio") {
      const other = sourceBindingFixture("92"); other.sections = indexed.sections; indexed.sections = []; portfolios.push(other);
    }
    if (scenario === "changed-exercise-code") { exercise.code = "2"; exercise.number = 2; asset.parsed.exerciseCode = "2"; asset.parsed.exerciseNumber = 2; }
    if (scenario === "changed-variant") asset.legacyVariant = "alternative";
    if (scenario === "changed-resource") asset.resourceId = "other-resource";
    if (scenario === "asset-cross-portfolio") {
      const other = sourceBindingFixture("92"); other.sections[0].exercises[0].assets = [asset]; exercise.assets = []; portfolios.push(other);
    }
    if (scenario === "duplicate-asset-native") exercise.assets.push({ ...structuredClone(asset), relativePath: "different.png", parsed: { ...asset.parsed, step: 2 } });
    if (scenario === "different-native-at-bound-path") asset.sourceId = "another-native-file";
    if (scenario === "two-native-bindings-one-app-id") {
      const pair = (await getSourceAssetBindings(database, "space-6")).find((binding) => binding.solutionAssetId)!;
      await database.execute(sourceAssetBindingInsert("historic-same-app-id", { ...pair, nativeItemId: "historic-other-item" }));
      exercise.assets.push({ ...structuredClone(asset), sourceId: "historic-other-item", relativePath: "other.png", parsed: { ...asset.parsed, step: 2 } });
    }
    const before = await sourceChildState(database, "space-6"); const batch = vi.spyOn(database, "batch");
    await expect(persistIndex(portfolios, "onedrive", "space-6", { sourceId: source.id })).rejects.toThrow(/bronidentiteit/);
    expect(batch).not.toHaveBeenCalled();
    expect(await sourceChildState(database, "space-6")).toEqual(before);
  });

  it("does not transfer exercise identity from an asset when the exercise code changes without native bindings", async () => {
    const { database } = await setup(); const indexed = sourceAssetBindingFixture();
    delete indexed.sourceIdentityContext;
    for (const asset of [...indexed.resourceAssets, ...indexed.sections[0].exercises[0].assets]) delete asset.sourceIdentityContext;
    await persistIndex([indexed], "onedrive", "space-6");
    const old = (await database.execute("SELECT id FROM exercises")).rows[0];
    await database.execute({ sql: "UPDATE exercises SET custom_note = 'Bewaar oude oefening' WHERE id = ?", args: [String(old.id)] });
    indexed.sections[0].exercises[0].code = "2";
    // The raw file ID alone is not parent continuity; reject its conflicting generic parent.
    const before = await sourceChildState(database, "space-6");
    await expect(persistIndex([indexed], "onedrive", "space-6")).rejects.toThrow(/parent/);
    expect(await sourceChildState(database, "space-6")).toEqual(before);
  });

  it("keeps a new generic native file separate from an old bound file with the same step and extension", async () => {
    const { database } = await setup(); const indexed = sourceAssetBindingFixture();
    indexed.sections[0].exercises[0].assets = [];
    await persistIndex([indexed], "onedrive", "space-6");
    const old = (await getSourceAssetBindings(database, "space-6"))[0];
    indexed.resourceAssets[0].sourceId = "new-native-document"; indexed.resourceAssets[0].relativePath = "new.pdf";
    await persistIndex([indexed], "onedrive", "space-6"); await persistIndex([indexed], "onedrive", "space-6");
    const current = (await getSourceAssetBindings(database, "space-6")).find((binding) => binding.nativeItemId === "new-native-document")!;
    expect(current.resourceAssetId).not.toBe(old.resourceAssetId);
    expect((await database.execute({ sql: "SELECT source_id, is_indexed FROM source_resource_assets WHERE id = ?", args: [old.resourceAssetId] })).rows[0])
      .toEqual({ source_id: old.nativeItemId, is_indexed: 0 });
  });

  it.each(["generic", "solution"])("rejects an ambiguous unbound %s fallback atomically", async (model) => {
    const { database } = await setup(); const indexed = sourceAssetBindingFixture();
    delete indexed.sourceIdentityContext;
    for (const asset of [...indexed.resourceAssets, ...indexed.sections[0].exercises[0].assets]) delete asset.sourceIdentityContext;
    await persistIndex([indexed], "onedrive", "space-6");
    const asset = indexed.sections[0].exercises[0].assets[0];
    if (model === "generic") {
      await database.execute("INSERT INTO source_resource_assets (id, learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id, semantic_role, source_id, relative_path, file_name, extension, step, last_seen_at) SELECT 'ambiguous', learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id, semantic_role, 'other', 'other.png', 'other.png', extension, step, last_seen_at FROM source_resource_assets WHERE resource_scope = 'exercise'");
      asset.sourceId = "new";
    } else {
      await database.execute("INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step, source_id) SELECT 'ambiguous', variant_id, 'other.png', 'other.png', extension, step, 'other' FROM solution_assets");
    }
    asset.relativePath = "new.png";
    const before = await sourceChildState(database, "space-6");
    await expect(persistIndex([indexed], "onedrive", "space-6")).rejects.toThrow(/legacy/);
    expect(await sourceChildState(database, "space-6")).toEqual(before);
  });

  it("rolls back native path-swap staging, bindings, metadata and source state on a late SQL failure", async () => {
    const { database, source } = await setup(); const indexed = sourceAssetBindingFixture();
    const exercise = indexed.sections[0].exercises[0]; const first = exercise.assets[0];
    exercise.assets.push({ ...structuredClone(first), sourceId: "second", relativePath: "second.png", parsed: { ...first.parsed, step: 2 } });
    await persistIndex([indexed], "onedrive", "space-6", { sourceId: source.id });
    const before = await sourceChildState(database, "space-6");
    [first.relativePath, exercise.assets[1].relativePath] = [exercise.assets[1].relativePath, first.relativePath];
    indexed.sections[0].code = "2";
    await database.execute("CREATE TRIGGER reject_child_publication BEFORE UPDATE ON learning_space_sources BEGIN SELECT RAISE(ABORT, 'late child failure'); END");
    await expect(persistIndex([indexed], "onedrive", "space-6", { sourceId: source.id })).rejects.toThrow("late child failure");
    expect(await sourceChildState(database, "space-6")).toEqual(before);
  });
});
