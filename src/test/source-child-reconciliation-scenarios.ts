import { expect } from "vitest";

import type { DatabaseClient } from "@/lib/database";
import { getActiveLearningSpaceSource, persistIndex } from "@/lib/repositories";
import { getSourceAssetBindings } from "@/lib/source-asset-bindings";
import { sourceBindingContextKey } from "@/lib/source-identity";
import { planSourceReconciliation } from "@/lib/source-reconciliation";
import { nativeBindingContext, sourceAssetBindingFixture, sourceAssetBindingInsert } from "@/test/source-binding-fixture";

/** Full publication state, shared by SQLite and dedicated PostgreSQL reconciliation proofs. */
export async function sourceChildState(database: DatabaseClient, spaceId: string) {
  const portfolioIds = "SELECT id FROM portfolios WHERE learning_space_id = ?";
  const exerciseIds = `SELECT id FROM exercises WHERE portfolio_id IN (${portfolioIds})`;
  const variantIds = `SELECT id FROM solution_variants WHERE exercise_id IN (${exerciseIds})`;
  const statements = [
    ...["portfolios", "themes", "source_entity_bindings", "source_asset_bindings", "source_resource_assets", "sync_runs", "learning_space_sources", "learning_space_header_assets"].map((table) =>
      `SELECT * FROM ${table} WHERE learning_space_id = ? ORDER BY id`),
    `SELECT * FROM sections WHERE portfolio_id IN (${portfolioIds}) ORDER BY id`,
    `SELECT * FROM exercises WHERE portfolio_id IN (${portfolioIds}) ORDER BY id`,
    `SELECT * FROM solution_variants WHERE exercise_id IN (${exerciseIds}) ORDER BY id`,
    `SELECT * FROM solution_assets WHERE variant_id IN (${variantIds}) ORDER BY id`,
    ...["error_reports", "error_report_threads", "error_report_issues"].map((table) => `SELECT * FROM ${table} WHERE portfolio_id IN (${portfolioIds}) ORDER BY id`),
    "SELECT * FROM sync_warnings WHERE sync_run_id IN (SELECT id FROM sync_runs WHERE learning_space_id = ?) ORDER BY id",
  ];
  return Promise.all(statements.map((sql) => database.execute({ sql, args: [spaceId] }).then((result) => result.rows)));
}

export async function verifyNativeChildContinuity(database: DatabaseClient, spaceId: string, sourceId: string) {
  const indexed = sourceAssetBindingFixture();
  const exercise = indexed.sections[0].exercises[0];
  const first = exercise.assets[0];
  exercise.assets.push({ ...structuredClone(first), sourceId: "second-native-file", relativePath: "second.png", fileName: "second.png", parsed: { ...first.parsed, step: 2 } });
  const publish = () => persistIndex([indexed], "onedrive", spaceId, { sourceId });
  await publish();
  const originalBindings = await getSourceAssetBindings(database, spaceId);
  const pair = originalBindings.find((binding) => binding.nativeItemId === first.sourceId)!;
  const sectionId = String((await database.execute({ sql: "SELECT section_id FROM exercises WHERE id = ?", args: [pair.exerciseId] })).rows[0].section_id);
  await database.batch([
    { sql: "UPDATE sections SET visibility_mode = 'hidden', publication_limited = 1, publish_from = '2099-01-01', publish_until = '2099-12-31' WHERE id = ?", args: [sectionId] },
    { sql: "UPDATE exercises SET custom_note = 'Bewaar', visibility_mode = 'hidden', visible = 0, publish_from = '2099-01-01', note_label = 'Tip', note_position = 'below_solution', show_alternative_to_students = 0, level_override_mode = 'level', level_override = 'verdieping' WHERE id = ?", args: [pair.exerciseId] },
    { sql: "INSERT INTO error_report_threads (id, learning_space_id, portfolio_id, exercise_id, exercise_code, created_at, updated_at) VALUES (?, ?, ?, ?, '1', 'old', 'old')", args: [`thread-${spaceId}`, spaceId, pair.portfolioId, pair.exerciseId] },
    { sql: "INSERT INTO error_report_issues (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '1', 'exercise_solution', 'old', 'old')", args: [`issue-${spaceId}`, `thread-${spaceId}`, spaceId, pair.portfolioId, pair.exerciseId] },
    { sql: "INSERT INTO error_reports (id, portfolio_id, section_id, exercise_id, issue_id, variant_kind, asset_snapshot, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'standard', '[]', 'Bewaar melding', 'TODO', 'old', 'old')", args: [`report-${spaceId}`, pair.portfolioId, sectionId, pair.exerciseId, `issue-${spaceId}`] },
  ]);
  const section = indexed.sections[0];
  section.code = "2.4"; section.title = "Hernoemd"; section.relativePath = "Nieuwe map/2.4 Hernoemd"; section.sortOrder = 24;
  indexed.resourceAssets[0].relativePath = "Nieuwe map/opdracht.pdf"; indexed.resourceAssets[0].fileName = "opdracht.pdf";
  const second = exercise.assets[1];
  [first.relativePath, second.relativePath] = [second.relativePath, first.relativePath];
  [first.fileName, second.fileName] = [second.fileName, first.fileName];
  first.parsed.step = 3; second.parsed.step = 1; exercise.assets.reverse();
  const beforePlanning = await sourceChildState(database, spaceId);
  const source = (await getActiveLearningSpaceSource(spaceId))!;
  const plan = await planSourceReconciliation(database, { learningSpaceId: spaceId, providerType: "onedrive", source,
    portfolios: [indexed], synchronizesThemes: false, newPortfolioId: () => "unused" });
  expect(plan.sectionIds.get(JSON.stringify([pair.portfolioId, "2.4"]))).toBe(sectionId);
  expect(await sourceChildState(database, spaceId)).toEqual(beforePlanning);
  for (let repeat = 0; repeat < 2; repeat++) {
    await publish();
    expect(await getSourceAssetBindings(database, spaceId)).toEqual(originalBindings);
    for (const binding of originalBindings) {
      const incoming = [indexed.resourceAssets[0], ...exercise.assets].find((asset) => asset.sourceId === binding.nativeItemId)!;
      const generic = (await database.execute({ sql: "SELECT * FROM source_resource_assets WHERE id = ?", args: [binding.resourceAssetId] })).rows[0];
      expect(generic).toMatchObject({ relative_path: incoming.relativePath, file_name: incoming.fileName, source_id: binding.nativeItemId, is_indexed: 1 });
      if (binding.solutionAssetId) {
        const solution = (await database.execute({ sql: "SELECT * FROM solution_assets WHERE id = ?", args: [binding.solutionAssetId] })).rows[0];
        expect(solution).toMatchObject({ variant_id: binding.variantId, relative_path: incoming.relativePath, step: "parsed" in incoming ? incoming.parsed.step : 1, source_id: binding.nativeItemId, is_indexed: 1 });
      }
    }
  }
  expect((await database.execute({ sql: "SELECT * FROM sections WHERE id = ?", args: [sectionId] })).rows[0])
    .toMatchObject({ section_code: "2.4", title: "Hernoemd", visibility_mode: "hidden", publication_limited: 1, publish_from: "2099-01-01", publish_until: "2099-12-31" });
  const ownedExercise = (await database.execute({ sql: "SELECT * FROM exercises WHERE id = ?", args: [pair.exerciseId] })).rows[0];
  const expectedOwned = { custom_note: "Bewaar", visibility_mode: "hidden", visible: 0, publish_from: "2099-01-01", note_label: "Tip", note_position: "below_solution", show_alternative_to_students: 0, level_override: "verdieping" };
  expect(ownedExercise).toMatchObject(expectedOwned);
  // Missing native files reconnect to their original two live representations.
  const savedAssets = exercise.assets; const savedDocuments = indexed.resourceAssets;
  exercise.assets = []; indexed.resourceAssets = []; await publish();
  exercise.assets = savedAssets; indexed.resourceAssets = savedDocuments; await publish();
  expect(await getSourceAssetBindings(database, spaceId)).toEqual(originalBindings);
  // Existing Fase-2 resolution follows the same exercise through root and another section.
  indexed.exercises = [exercise]; indexed.sections = []; await publish();
  expect((await database.execute({ sql: "SELECT exercise_id, section_id FROM error_reports WHERE id = ?", args: [`report-${spaceId}`] })).rows[0])
    .toEqual({ exercise_id: pair.exerciseId, section_id: null });
  indexed.exercises = []; indexed.sections = [{ ...section, code: "3", sourceId: "new-section", exercises: [exercise] }];
  await publish(); await publish();
  expect((await database.execute({ sql: "SELECT * FROM exercises WHERE id = ?", args: [pair.exerciseId] })).rows[0]).toMatchObject(expectedOwned);
  expect((await database.execute({ sql: "SELECT exercise_id, section_id FROM error_reports WHERE id = ?", args: [`report-${spaceId}`] })).rows[0])
    .toEqual({ exercise_id: pair.exerciseId, section_id: `${pair.portfolioId}-section-3` });
  expect(await getSourceAssetBindings(database, spaceId)).toEqual(originalBindings);
  return indexed;
}

export async function verifyHistoricalChildContexts(database: DatabaseClient, spaceId: string, sourceId: string) {
  const indexed = sourceAssetBindingFixture();
  const publish = () => persistIndex([indexed], "onedrive", spaceId, { sourceId });
  await publish();
  const bindings = await getSourceAssetBindings(database, spaceId);
  const historicalContext = { ...nativeBindingContext, providerNamespace: "historical-native-root" };
  for (const binding of bindings) await database.execute(sourceAssetBindingInsert(`historic-${binding.resourceAssetId}`, { ...binding, ...historicalContext }));
  const allBindings = (await database.execute({ sql: "SELECT * FROM source_asset_bindings WHERE learning_space_id = ? ORDER BY id", args: [spaceId] })).rows;
  for (const context of [historicalContext, nativeBindingContext, historicalContext]) {
    indexed.sourceIdentityContext = context;
    for (const asset of [...indexed.resourceAssets, ...indexed.sections[0].exercises[0].assets]) asset.sourceIdentityContext = context;
    await publish(); await publish();
    expect((await database.execute({ sql: "SELECT * FROM source_asset_bindings WHERE learning_space_id = ? ORDER BY id", args: [spaceId] })).rows).toEqual(allBindings);
    for (const binding of bindings) {
      const key = sourceBindingContextKey({ ...binding, ...context });
      expect((await database.execute({ sql: "SELECT storage_context_key FROM source_resource_assets WHERE id = ?", args: [binding.resourceAssetId] })).rows[0].storage_context_key).toBe(key);
      if (binding.solutionAssetId) expect((await database.execute({ sql: "SELECT storage_context_key FROM solution_assets WHERE id = ?", args: [binding.solutionAssetId] })).rows[0].storage_context_key).toBe(key);
    }
  }
  // A new context has no historical proof and must create separate app assets.
  const freshContext = { ...nativeBindingContext, providerNamespace: "new-independent-root" };
  indexed.sourceIdentityContext = freshContext;
  for (const asset of [...indexed.resourceAssets, ...indexed.sections[0].exercises[0].assets]) asset.sourceIdentityContext = freshContext;
  await publish();
  const freshBindings = (await getSourceAssetBindings(database, spaceId)).filter((binding) => binding.providerNamespace === freshContext.providerNamespace);
  expect(freshBindings).toHaveLength(2);
  for (const binding of freshBindings) expect(bindings.map((item) => item.resourceAssetId)).not.toContain(binding.resourceAssetId);
  return indexed;
}
