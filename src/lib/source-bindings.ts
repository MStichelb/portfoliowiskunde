import { randomUUID } from "node:crypto";

import type { DatabaseClient, DatabaseRow, InStatement } from "@/lib/database";
import { sourceBindingContextKey, type SourceEntityBinding } from "@/lib/source-identity";
import { SourceConfigurationError } from "@/lib/source-errors";

function contextKey(binding: SourceEntityBinding): string {
  return sourceBindingContextKey(binding);
}

function entityKey(binding: SourceEntityBinding): string {
  return JSON.stringify([contextKey(binding), binding.entityType, binding.entityId]);
}

function nativeKey(binding: SourceEntityBinding): string {
  return JSON.stringify([contextKey(binding), binding.nativeItemId]);
}

function bindingFromRow(row: DatabaseRow): SourceEntityBinding {
  const entityType = String(row.entity_type) as SourceEntityBinding["entityType"];
  return {
    learningSpaceId: String(row.learning_space_id), configuredSourceId: String(row.learning_space_source_id),
    providerType: String(row.provider_type) as SourceEntityBinding["providerType"],
    providerNamespace: String(row.provider_namespace), identityKind: String(row.identity_kind) as SourceEntityBinding["identityKind"],
    nativeItemId: String(row.native_item_id), entityType,
    entityId: String(entityType === "portfolio" ? row.portfolio_id : row.section_id), portfolioId: String(row.portfolio_id),
  };
}

export async function getSourceEntityBindings(database: DatabaseClient, learningSpaceId: string): Promise<SourceEntityBinding[]> {
  const result = await database.execute({ sql: "SELECT * FROM source_entity_bindings WHERE learning_space_id = ?", args: [learningSpaceId] });
  return result.rows.map(bindingFromRow);
}

/** Store already resolved entities only. This never chooses an entity by native ID. */
export async function prepareSourceBindingWrites(
  database: DatabaseClient,
  learningSpaceId: string,
  bindings: readonly SourceEntityBinding[],
  timestamp: string,
): Promise<InStatement[]> {
  if (bindings.length === 0) return [];
  const existing = await database.execute({ sql: "SELECT * FROM source_entity_bindings WHERE learning_space_id = ?", args: [learningSpaceId] });
  const existingByEntity = new Map(existing.rows.map((row) => [entityKey(bindingFromRow(row)), row]));
  const claims = new Map(existing.rows.map((row) => [nativeKey(bindingFromRow(row)), entityKey(bindingFromRow(row))]));
  const incomingByEntity = new Map<string, SourceEntityBinding>();
  const statements: InStatement[] = [];
  const conflict = () => new SourceConfigurationError("De bronidentiteit claimt verschillende portfolio's of onderdelen. De bestaande index is behouden; automatische koppeling is niet uitgevoerd.");

  for (const binding of bindings) {
    if (binding.learningSpaceId !== learningSpaceId || !binding.configuredSourceId || !binding.entityId
      || !binding.portfolioId || !binding.providerNamespace.trim() || !binding.nativeItemId.trim()
      || (binding.providerType === "local" ? binding.identityKind !== "path" : binding.identityKind !== "native")
      || (binding.entityType === "portfolio" && binding.entityId !== binding.portfolioId)) throw conflict();
    const key = entityKey(binding);
    const previousIncoming = incomingByEntity.get(key);
    if (previousIncoming && (previousIncoming.nativeItemId !== binding.nativeItemId
      || previousIncoming.portfolioId !== binding.portfolioId || previousIncoming.identityKind !== binding.identityKind)) throw conflict();
    const previous = existingByEntity.get(key);
    if (previous && (String(previous.portfolio_id) !== binding.portfolioId || String(previous.identity_kind) !== binding.identityKind
      || (binding.identityKind === "native" && String(previous.native_item_id) !== binding.nativeItemId))) throw conflict();
    const claimedEntity = claims.get(nativeKey(binding));
    if (claimedEntity && claimedEntity !== key) throw conflict();
    incomingByEntity.set(key, binding);
    claims.set(nativeKey(binding), key);
  }

  for (const [key, binding] of incomingByEntity) {
    const previous = existingByEntity.get(key);
    if (previous) {
      // Path identities can follow the entity chosen by existing code matching.
      // Reconciliation may retain the entity, but never overwrite its native identity.
      if (String(previous.native_item_id) !== binding.nativeItemId) statements.push({
        sql: "UPDATE source_entity_bindings SET native_item_id = ?, updated_at = ? WHERE id = ? AND identity_kind = 'path'",
        args: [binding.nativeItemId, timestamp, String(previous.id)],
      });
    } else statements.push({
      sql: `INSERT INTO source_entity_bindings (id, learning_space_id, learning_space_source_id, provider_type,
        provider_namespace, identity_kind, entity_type, portfolio_id, section_id, native_item_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), binding.learningSpaceId, binding.configuredSourceId, binding.providerType, binding.providerNamespace,
        binding.identityKind, binding.entityType, binding.portfolioId, binding.entityType === "section" ? binding.entityId : null,
        binding.nativeItemId, timestamp, timestamp],
    });
  }
  return statements;
}
