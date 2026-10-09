import { randomUUID } from "node:crypto";

import type { DatabaseClient, DatabaseRow, InStatement } from "@/lib/database";
import { SourceConfigurationError } from "@/lib/source-errors";
import { sourceBindingContextKey, type SourceAssetBinding } from "@/lib/source-identity";

function identityKey(binding: SourceAssetBinding): string {
  return JSON.stringify([sourceBindingContextKey(binding), binding.resourceScope, binding.resourceId, binding.nativeItemId]);
}

function fromRow(row: DatabaseRow): SourceAssetBinding {
  const nullable = (value: unknown) => value == null ? null : String(value);
  return {
    learningSpaceId: String(row.learning_space_id), configuredSourceId: String(row.learning_space_source_id),
    providerType: String(row.provider_type) as SourceAssetBinding["providerType"], providerNamespace: String(row.provider_namespace),
    identityKind: String(row.identity_kind) as SourceAssetBinding["identityKind"], nativeItemId: String(row.native_item_id),
    resourceScope: String(row.resource_scope) as SourceAssetBinding["resourceScope"], resourceId: String(row.resource_id),
    portfolioId: String(row.portfolio_id), exerciseId: nullable(row.exercise_id), resourceAssetId: nullable(row.resource_asset_id),
    solutionAssetId: nullable(row.solution_asset_id), variantId: nullable(row.variant_id),
  };
}

export async function getSourceAssetBindings(database: DatabaseClient, learningSpaceId: string): Promise<SourceAssetBinding[]> {
  const result = await database.execute({ sql: "SELECT * FROM source_asset_bindings WHERE learning_space_id = ?", args: [learningSpaceId] });
  return result.rows.map(fromRow);
}

/** Store the IDs already selected by existing asset matching. Never choose an asset here. */
export async function prepareSourceAssetBindingWrites(
  database: DatabaseClient, learningSpaceId: string, incoming: readonly SourceAssetBinding[], timestamp: string,
  parentMoves: { exercises: ReadonlyMap<string, string>; variants: ReadonlyMap<string, string> } = { exercises: new Map(), variants: new Map() },
): Promise<InStatement[]> {
  if (incoming.length === 0 && parentMoves.exercises.size === 0) return [];
  const rows = (await database.execute({ sql: "SELECT * FROM source_asset_bindings WHERE learning_space_id = ?", args: [learningSpaceId] })).rows;
  const previousByKey = new Map(rows.map((row) => [identityKey(fromRow(row)), row]));
  const movedBinding = (binding: SourceAssetBinding): SourceAssetBinding => ({ ...binding,
    exerciseId: binding.exerciseId ? parentMoves.exercises.get(binding.exerciseId) ?? binding.exerciseId : null,
    variantId: binding.variantId ? parentMoves.variants.get(binding.variantId) ?? binding.variantId : null });
  const planned = new Map<string, SourceAssetBinding>();
  const conflict = () => new SourceConfigurationError("De gescopeerde bronidentiteit hoort bij verschillende assets of parentcontexten. De bestaande index is behouden.");
  for (const binding of incoming) {
    if (binding.learningSpaceId !== learningSpaceId || !binding.configuredSourceId || !binding.portfolioId
      || !binding.providerNamespace.trim() || !binding.nativeItemId.trim() || !binding.resourceId.trim()
      || (binding.providerType === "local" ? binding.identityKind !== "path" : binding.identityKind !== "native")
      || (!binding.resourceAssetId && !binding.solutionAssetId)
      || (binding.resourceScope === "portfolio" ? binding.exerciseId !== null || binding.solutionAssetId !== null || binding.variantId !== null : !binding.exerciseId)
      || (!!binding.solutionAssetId !== !!binding.variantId)) throw conflict();
    const key = identityKey(binding);
    const row = previousByKey.get(key);
    const previous = planned.get(key) ?? (row ? movedBinding(fromRow(row)) : undefined);
    if (previous && (previous.portfolioId !== binding.portfolioId || previous.exerciseId !== binding.exerciseId
      || previous.identityKind !== binding.identityKind
      || (["resourceAssetId", "solutionAssetId", "variantId"] as const).some((field) => previous[field] && binding[field] && previous[field] !== binding[field]))) throw conflict();
    planned.set(key, { ...binding, resourceAssetId: binding.resourceAssetId ?? previous?.resourceAssetId ?? null,
      solutionAssetId: binding.solutionAssetId ?? previous?.solutionAssetId ?? null, variantId: binding.variantId ?? previous?.variantId ?? null });
  }
  const statements: InStatement[] = [];
  // Copy proven parent results from the existing Fase-2 plan, including historical source contexts.
  for (const row of rows) {
    const before = fromRow(row); const after = movedBinding(before);
    if (before.exerciseId !== after.exerciseId || before.variantId !== after.variantId) statements.push({
      sql: "UPDATE source_asset_bindings SET exercise_id = ?, variant_id = ?, updated_at = ? WHERE id = ?",
      args: [after.exerciseId, after.variantId, timestamp, String(row.id)],
    });
  }
  for (const [key, binding] of planned) {
    const previous = previousByKey.get(key);
    if (!previous) statements.push({
      sql: `INSERT INTO source_asset_bindings (id, learning_space_id, learning_space_source_id, provider_type, provider_namespace,
        identity_kind, native_item_id, resource_scope, resource_id, portfolio_id, exercise_id, resource_asset_id,
        solution_asset_id, variant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), binding.learningSpaceId, binding.configuredSourceId, binding.providerType, binding.providerNamespace,
        binding.identityKind, binding.nativeItemId, binding.resourceScope, binding.resourceId, binding.portfolioId,
        binding.exerciseId, binding.resourceAssetId, binding.solutionAssetId, binding.variantId, timestamp, timestamp],
    });
    else if (previous.resource_asset_id !== binding.resourceAssetId || previous.solution_asset_id !== binding.solutionAssetId || previous.variant_id !== binding.variantId) statements.push({
      sql: "UPDATE source_asset_bindings SET resource_asset_id = ?, solution_asset_id = ?, variant_id = ?, updated_at = ? WHERE id = ?",
      args: [binding.resourceAssetId, binding.solutionAssetId, binding.variantId, timestamp, String(previous.id)],
    });
  }
  return statements;
}
