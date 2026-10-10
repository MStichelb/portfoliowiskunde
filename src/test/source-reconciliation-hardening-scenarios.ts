import { expect, vi } from "vitest";

import type { DatabaseClient, InStatement } from "@/lib/database";
import { archiveMissingIndexItems, getSyncPublicationSnapshot, persistIndex, releaseSyncLease, tryAcquireSyncLease } from "@/lib/repositories";
import { getSourceAssetBindings } from "@/lib/source-asset-bindings";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import { nativeBindingContext, sourceAssetBindingFixture } from "@/test/source-binding-fixture";
import type { StorageIdentityContext } from "@/lib/source-identity";
import { sourceChildState } from "@/test/source-child-reconciliation-scenarios";

export const rollbackStages = ["portfolio-assets", "section-resources", "exercise-solutions", "bindings", "missing", "archive", "guarded-bindings"] as const;
export type RollbackStage = typeof rollbackStages[number];

async function prepare(database: DatabaseClient, spaceId: string, sourceId: string) {
  const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
  config.scanner.portfolio.themeMode = "folder";
  await database.execute({ sql: `UPDATE source_profiles SET config_json = ? WHERE id IN
    (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = ?)`, args: [JSON.stringify(config), spaceId] });
  const indexed = sourceAssetBindingFixture();
  indexed.sourceTheme = { sourceId: "native-theme", name: "Analyse", relativePath: "Analyse" };
  const publish = () => persistIndex([indexed], "onedrive", spaceId, { sourceId });
  await publish();
  const bindings = await getSourceAssetBindings(database, spaceId);
  const pair = bindings.find((binding) => binding.solutionAssetId)!;
  const sectionId = String((await database.execute({ sql: "SELECT section_id FROM exercises WHERE id = ?", args: [pair.exerciseId] })).rows[0].section_id);
  const themeId = String((await database.execute({ sql: "SELECT theme_id FROM portfolios WHERE id = ?", args: [pair.portfolioId] })).rows[0].theme_id);
  await database.batch([
    { sql: "UPDATE themes SET name = 'Eigen analyse', sort_order = 80 WHERE id = ?", args: [themeId] },
    { sql: `UPDATE portfolios SET visible = 0, publication_limited = 1, publish_from = '2099-01-01', publish_until = '2099-12-31',
      title_override = 'Eigen titel', card_color = '#abcdef', custom_text = 'Bewaar tekst', custom_text_position = 'below_documents' WHERE id = ?`, args: [pair.portfolioId] },
    { sql: "UPDATE sections SET visibility_mode = 'hidden', publication_limited = 1, publish_from = '2099-01-01', publish_until = '2099-12-31' WHERE id = ?", args: [sectionId] },
    { sql: `UPDATE exercises SET visible = 0, visibility_mode = 'hidden', publish_from = '2099-01-01', publish_until = '2099-12-31',
      custom_note = 'Bewaar notitie', note_label = 'Tip', note_position = 'below_solution', level_override_mode = 'level',
      level_override = 'uitdaging', show_alternative_to_students = 0 WHERE id = ?`, args: [pair.exerciseId] },
    { sql: `INSERT INTO error_report_threads (id, learning_space_id, portfolio_id, exercise_id, exercise_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, '1', 'old', 'old')`, args: [`hardening-thread-${spaceId}`, spaceId, pair.portfolioId, pair.exerciseId] },
    { sql: `INSERT INTO error_report_issues (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, '1', 'exercise_solution', 'old', 'old')`, args: [`hardening-issue-${spaceId}`, `hardening-thread-${spaceId}`, spaceId, pair.portfolioId, pair.exerciseId] },
    { sql: `INSERT INTO error_reports (id, portfolio_id, section_id, exercise_id, issue_id, variant_kind, asset_snapshot, message, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'standard', '[]', 'Bewaar melding', 'TODO', 'old', 'old')`, args: [`hardening-report-${spaceId}`, pair.portfolioId, sectionId, pair.exerciseId, `hardening-issue-${spaceId}`] },
  ]);
  return { indexed, publish, bindings, pair, sectionId, themeId };
}

/** Fail a real SQL constraint inside the real adapter transaction, after the chosen write. */
export async function verifyReconciliationRollback(database: DatabaseClient, spaceId: string, sourceId: string, stage: RollbackStage) {
  const { indexed, publish } = await prepare(database, spaceId, sourceId);
  if (stage === "archive") await persistIndex([], "onedrive", spaceId, { sourceId });
  indexed.code = "92"; indexed.title = "Hernoemd"; indexed.relativePath = "Algebra/Portfolio 92";
  indexed.sourceTheme = { sourceId: "new-theme", name: "Algebra", relativePath: "Algebra" };
  indexed.sections[0].code = "2.4";
  const exercise = indexed.sections[0].exercises[0];
  exercise.assets[0].relativePath = "Algebra/Portfolio 92/nieuw.png";
  if (stage === "exercise-solutions") { indexed.exercises = [exercise]; indexed.sections = []; }
  // Force an actual new binding write; unchanged native observations never write again.
  indexed.resourceAssets.push({ ...indexed.resourceAssets[0], sourceId: "new-native-document", relativePath: "new.pdf", fileName: "new.pdf" });
  const ownerId = `hardening-owner-${spaceId}`;
  const snapshot = stage === "guarded-bindings" ? await getSyncPublicationSnapshot(spaceId, sourceId) : null;
  if (stage === "guarded-bindings") {
    expect(snapshot).not.toBeNull();
    expect(await tryAcquireSyncLease(spaceId, ownerId, new Date(), 600)).toBe(true);
  }
  const before = await sourceChildState(database, spaceId);
  const originalBatch = database.batch.bind(database);
  const originalGuardedBatch = database.guardedBatch.bind(database);
  const afterWrite: Record<RollbackStage, (statement: InStatement) => boolean> = {
    "portfolio-assets": (statement) => /INSERT INTO source_resource_assets/.test(statement.sql),
    "section-resources": (statement) => /source_resource_assets/.test(statement.sql) && statement.args?.includes("raw-solution-id") === true,
    "exercise-solutions": (statement) => /INSERT INTO solution_assets/.test(statement.sql) || (/UPDATE solution_assets SET relative_path/.test(statement.sql) && /is_indexed = 1/.test(statement.sql)),
    bindings: (statement) => /INSERT INTO source_asset_bindings/.test(statement.sql),
    "guarded-bindings": (statement) => /INSERT INTO source_asset_bindings/.test(statement.sql),
    missing: (statement) => /UPDATE source_resource_assets SET missing_since/.test(statement.sql),
    archive: (statement) => /UPDATE portfolios SET archived_at/.test(statement.sql),
  };
  const failStatements = (statements: InStatement[]) => {
    const index = statements.findIndex(afterWrite[stage]);
    expect(index, `missing write boundary for ${stage}`).toBeGreaterThanOrEqual(0);
    const columns = stage === "portfolio-assets" || stage === "section-resources"
      ? "id, learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id, semantic_role, source_id, relative_path, file_name, extension, step, last_seen_at, storage_context_key"
      : stage === "exercise-solutions" ? "id, variant_id, relative_path, file_name, extension, step, source_id, storage_context_key"
        : stage === "bindings" || stage === "guarded-bindings" ? "id, learning_space_id, learning_space_source_id, provider_type, provider_namespace, identity_kind, native_item_id, resource_scope, resource_id, portfolio_id, exercise_id, resource_asset_id, solution_asset_id, variant_id, created_at, updated_at"
          : "id, learning_space_id, portfolio_code, title, relative_path";
    const table = stage === "portfolio-assets" || stage === "section-resources" ? "source_resource_assets"
      : stage === "exercise-solutions" ? "solution_assets" : stage === "bindings" || stage === "guarded-bindings" ? "source_asset_bindings" : "portfolios";
    const scope = stage === "exercise-solutions"
      ? "variant_id IN (SELECT id FROM solution_variants WHERE exercise_id IN (SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)))"
      : "learning_space_id = ?";
    const failure: InStatement = { sql: `INSERT INTO ${table} (${columns}) SELECT ${columns} FROM ${table} WHERE ${scope}`, args: [spaceId] };
    return [...statements.slice(0, index + 1), failure, ...statements.slice(index + 1)];
  };
  const batch = stage === "guarded-bindings"
    ? vi.spyOn(database, "guardedBatch").mockImplementation((guard, statements) => originalGuardedBatch(guard, failStatements(statements)))
    : vi.spyOn(database, "batch").mockImplementation((statements) => originalBatch(failStatements(statements)));
  try {
    await expect(snapshot ? persistIndex([indexed], "onedrive", spaceId, { sourceId, publicationGuard: { ownerId, leaseSeconds: 600, snapshot } })
      : stage === "archive" ? archiveMissingIndexItems(spaceId) : stage === "missing"
      ? persistIndex([], "onedrive", spaceId, { sourceId }) : publish()).rejects.toThrow(/constraint|duplicate|unique/i);
    expect(batch).toHaveBeenCalledTimes(1);
  } finally { batch.mockRestore(); }
  expect(await sourceChildState(database, spaceId), `rollback after ${stage}`).toEqual(before);
  if (snapshot) await releaseSyncLease(spaceId, ownerId);
}

export async function verifyReconciliationLifecycle(database: DatabaseClient, spaceId: string, sourceId: string) {
  const { indexed, publish, bindings, pair, sectionId, themeId } = await prepare(database, spaceId, sourceId);
  const ownedStatements: InStatement[] = [
    { sql: "SELECT id, name, sort_order FROM themes WHERE id = ?", args: [themeId] },
    { sql: "SELECT id, visible, publication_limited, publish_from, publish_until, title_override, card_color, custom_text, custom_text_position, theme_id FROM portfolios WHERE id = ?", args: [pair.portfolioId] },
    { sql: "SELECT id, visibility_mode, publication_limited, publish_from, publish_until FROM sections WHERE id = ?", args: [sectionId] },
    { sql: "SELECT id, section_id, visible, visibility_mode, publish_from, publish_until, custom_note, note_label, note_position, level_override_mode, level_override, show_alternative_to_students FROM exercises WHERE id = ?", args: [pair.exerciseId] },
    { sql: "SELECT * FROM error_reports WHERE id = ?", args: [`hardening-report-${spaceId}`] },
  ];
  const owned = () => Promise.all(ownedStatements.map((statement) => database.execute(statement).then((result) => result.rows)));
  const beforeOwned = await owned();
  const lifecycleStatements: InStatement[] = [
    ...["portfolios", "sections", "exercises"].map((table, index) => ({ sql: `SELECT id, is_indexed, archived_at FROM ${table} WHERE id = ?`, args: [[pair.portfolioId, sectionId, pair.exerciseId][index]] })),
    { sql: "SELECT id, is_indexed, archived_at FROM solution_variants WHERE id = ?", args: [pair.variantId] },
    { sql: "SELECT id, variant_id, source_id, storage_context_key, is_indexed, archived_at, missing_since FROM solution_assets WHERE id = ?", args: [pair.solutionAssetId] },
    { sql: "SELECT id, portfolio_id, exercise_id, source_id, storage_context_key, is_indexed, archived_at, missing_since FROM source_resource_assets WHERE learning_space_id = ? ORDER BY id", args: [spaceId] },
  ];
  const lifecycle = () => Promise.all(lifecycleStatements.map((statement) => database.execute(statement).then((result) => result.rows)));
  const beforeLifecycle = await lifecycle();
  await persistIndex([], "onedrive", spaceId, { sourceId });
  for (const rows of await lifecycle()) for (const row of rows) expect(row).toMatchObject({ is_indexed: 0, archived_at: null });
  for (const table of ["source_resource_assets", "solution_assets"]) {
    const missing = await database.execute(table === "source_resource_assets"
      ? { sql: "SELECT missing_since FROM source_resource_assets WHERE learning_space_id = ?", args: [spaceId] }
      : { sql: "SELECT missing_since FROM solution_assets WHERE id = ?", args: [pair.solutionAssetId] });
    for (const row of missing.rows) expect(row.missing_since).toBeTruthy();
  }
  await archiveMissingIndexItems(spaceId);
  for (const rows of await lifecycle()) for (const row of rows) expect(row.archived_at).toBeTruthy();
  expect(await owned()).toEqual(beforeOwned);
  // Different native folders at the occupied logical code must not inherit archived metadata.
  const replacement = structuredClone(indexed); replacement.sourceId = "replacement-folder";
  const archived = await sourceChildState(database, spaceId);
  await expect(persistIndex([replacement], "onedrive", spaceId, { sourceId })).rejects.toThrow("bronidentiteit");
  expect(await sourceChildState(database, spaceId)).toEqual(archived);
  for (let repeat = 0; repeat < 3; repeat++) {
    expect(await publish()).toMatchObject(repeat === 0 ? { warnings: 0 } : { warnings: 0, added: 0 });
    expect(await lifecycle()).toEqual(beforeLifecycle);
    expect(await owned()).toEqual(beforeOwned);
    expect(await getSourceAssetBindings(database, spaceId)).toEqual(bindings);
  }
  // Initial publication followed by a combined rename/move and two identical repeats.
  indexed.code = "92"; indexed.title = "Nieuwe titel"; indexed.relativePath = "Nieuw/Portfolio 92";
  indexed.sourceTheme = { sourceId: "native-theme", name: "Nieuwe bronnaam", relativePath: "Nieuw" };
  indexed.sections[0].code = "2.4"; indexed.sections[0].relativePath = "Nieuw/Portfolio 92/2.4";
  indexed.resourceAssets[0].relativePath = "Nieuw/opdracht.pdf"; indexed.resourceAssets[0].fileName = "opdracht.pdf";
  const asset = indexed.sections[0].exercises[0].assets[0];
  asset.relativePath = "Nieuw/2.png"; asset.fileName = "2.png"; asset.parsed.step = 2;
  let stableRows: unknown;
  for (let repeat = 0; repeat < 3; repeat++) {
    expect(await publish()).toMatchObject({ warnings: 0, added: 0 });
    expect(await lifecycle()).toEqual(beforeLifecycle);
    expect(await owned()).toEqual(beforeOwned);
    expect(await getSourceAssetBindings(database, spaceId)).toEqual(bindings);
    const state = await sourceChildState(database, spaceId);
    const volatile = new Set(["indexed_at", "last_seen_at", "updated_at"]);
    const rows = [...state.slice(0, 5), ...state.slice(8, 15)].map((table) => table.map((row) =>
      Object.fromEntries(Object.entries(row).filter(([column]) => !volatile.has(column)))));
    if (repeat === 0) stableRows = rows; else expect(rows).toEqual(stableRows);
  }
}

export async function verifyReconciliationScopeIsolation(database: DatabaseClient, spaceId: string, sourceId: string) {
  const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
  await database.execute({ sql: `UPDATE source_profiles SET config_json = ? WHERE id IN
    (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = ?)`, args: [JSON.stringify(config), spaceId] });
  const primary = sourceAssetBindingFixture();
  await persistIndex([primary], "onedrive", spaceId, { sourceId });
  const original = await getSourceAssetBindings(database, spaceId);
  const mirrorId = `hardening-mirror-${spaceId}`;
  await database.execute({ sql: `INSERT INTO learning_space_sources (id, learning_space_id, role, provider_type, is_active, created_at, updated_at)
    VALUES (?, ?, 'mirror', 'onedrive', 0, 'old', 'old')`, args: [mirrorId, spaceId] });
  const contexts: StorageIdentityContext[] = [
    nativeBindingContext,
    { ...nativeBindingContext, providerNamespace: JSON.stringify(["drive", "other-drive", "root", "test-root"]) },
    { ...nativeBindingContext, providerNamespace: JSON.stringify(["drive", "test-drive", "root", "other-root"]) },
    // Even an identical opaque namespace and raw ID is separate across provider types.
    { ...nativeBindingContext, providerType: "google_drive" },
    { providerType: "google_drive", identityKind: "native", providerNamespace: JSON.stringify(["account", "account-a", "root", "root-a"]) },
    { providerType: "google_drive", identityKind: "native", providerNamespace: JSON.stringify(["account", "account-b", "root", "root-a"]) },
    { providerType: "google_drive", identityKind: "native", providerNamespace: JSON.stringify(["account", "account-a", "root", "root-b"]) },
  ];
  const seenGeneric = new Set(original.map((binding) => binding.resourceAssetId));
  const seenSolutions = new Set(original.filter((binding) => binding.solutionAssetId).map((binding) => binding.solutionAssetId));
  for (const context of contexts) {
    await database.execute({ sql: "UPDATE learning_space_sources SET provider_type = ? WHERE id = ?", args: [context.providerType, mirrorId] });
    const indexed = sourceAssetBindingFixture("91", context);
    await persistIndex([indexed], context.providerType, spaceId, { sourceId: mirrorId });
    const bindings = (await getSourceAssetBindings(database, spaceId)).filter((binding) => binding.configuredSourceId === mirrorId
      && binding.providerType === context.providerType && binding.providerNamespace === context.providerNamespace);
    expect(bindings).toHaveLength(2);
    for (const binding of bindings) {
      expect(seenGeneric.has(binding.resourceAssetId)).toBe(false); seenGeneric.add(binding.resourceAssetId);
      if (binding.solutionAssetId) { expect(seenSolutions.has(binding.solutionAssetId)).toBe(false); seenSolutions.add(binding.solutionAssetId); }
    }
    const beforeRepeat = bindings;
    for (let repeat = 0; repeat < 2; repeat++) {
      await persistIndex([indexed], context.providerType, spaceId, { sourceId: mirrorId });
      expect((await getSourceAssetBindings(database, spaceId)).filter((binding) => binding.configuredSourceId === mirrorId
        && binding.providerType === context.providerType && binding.providerNamespace === context.providerNamespace)).toEqual(beforeRepeat);
    }
  }
  await persistIndex([primary], "onedrive", spaceId, { sourceId });
  expect((await getSourceAssetBindings(database, spaceId)).filter((binding) => binding.configuredSourceId === sourceId)).toEqual(original);
  const generic = (await database.execute({ sql: "SELECT id, source_id, storage_context_key FROM source_resource_assets WHERE learning_space_id = ?", args: [spaceId] })).rows;
  expect(generic).toHaveLength(16); expect(new Set(generic.map((row) => row.storage_context_key)).size).toBe(8);
  expect(generic.filter((row) => row.source_id === "raw-solution-id")).toHaveLength(8);
  return original;
}
