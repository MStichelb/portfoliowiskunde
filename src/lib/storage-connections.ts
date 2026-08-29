import { createHash, randomUUID } from "node:crypto";

import { getDatabase } from "@/lib/database";
import { LEGACY_SUPERADMIN_USER_ID } from "@/lib/identity";

export type StorageConnectionProvider = "onedrive" | "google_drive";

export interface StorageConnection {
  id: string;
  ownerUserId: string;
  provider: StorageConnectionProvider;
  displayName: string;
  status: "active" | "disconnected";
}

export const LEGACY_ONEDRIVE_CONNECTION_ID = "connection-onedrive-user-legacy-superadmin";

export async function getStorageConnection(id: string): Promise<StorageConnection | null> {
  const row = (await (await getDatabase()).execute({ sql: "SELECT * FROM storage_connections WHERE id = ?", args: [id] })).rows[0];
  return row ? connectionFromRow(row) : null;
}

export async function getOwnedStorageConnection(userId: string, connectionId: string): Promise<StorageConnection | null> {
  const row = (await (await getDatabase()).execute({
    sql: "SELECT * FROM storage_connections WHERE id = ? AND owner_user_id = ?",
    args: [connectionId, userId],
  })).rows[0];
  return row ? connectionFromRow(row) : null;
}

export async function getDefaultStorageConnection(userId: string, provider: StorageConnectionProvider): Promise<StorageConnection | null> {
  const row = (await (await getDatabase()).execute({
    sql: `SELECT * FROM storage_connections WHERE owner_user_id = ? AND provider = ?
      ORDER BY created_at, id LIMIT 1`,
    args: [userId, provider],
  })).rows[0];
  return row ? connectionFromRow(row) : null;
}

export async function ensureStorageConnection(userId: string, provider: StorageConnectionProvider): Promise<StorageConnection> {
  const existing = await getDefaultStorageConnection(userId, provider);
  if (existing) return existing;
  const id = connectionId(userId, provider);
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: `INSERT INTO storage_connections
      (id, owner_user_id, provider, display_name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'disconnected', ?, ?)`,
    args: [id, userId, provider, defaultDisplayName(provider), now, now],
  });
  return (await getStorageConnection(id))!;
}

export async function createStorageConnection(
  ownerUserId: string,
  provider: StorageConnectionProvider,
  displayName = defaultDisplayName(provider),
): Promise<StorageConnection> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: `INSERT INTO storage_connections
      (id, owner_user_id, provider, display_name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'disconnected', ?, ?)`,
    args: [id, ownerUserId, provider, displayName.trim() || defaultDisplayName(provider), now, now],
  });
  return (await getStorageConnection(id))!;
}

export async function readStorageCredentials(connectionId: string): Promise<string | null> {
  const row = (await (await getDatabase()).execute({
    sql: "SELECT encrypted_credentials FROM storage_connections WHERE id = ? AND status = 'active'",
    args: [connectionId],
  })).rows[0];
  return typeof row?.encrypted_credentials === "string" && row.encrypted_credentials ? row.encrypted_credentials : null;
}

export async function saveStorageCredentials(input: {
  ownerUserId: string;
  provider: StorageConnectionProvider;
  connectionId?: string;
  encryptedCredentials: string;
  displayName?: string;
}): Promise<string> {
  const id = input.connectionId ?? connectionId(input.ownerUserId, input.provider);
  if (input.connectionId) {
    const existing = await getOwnedStorageConnection(input.ownerUserId, input.connectionId);
    if (!existing || existing.provider !== input.provider) throw new Error("Storageverbinding behoort niet aan deze gebruiker.");
  }
  const now = new Date().toISOString();
  await (await getDatabase()).batch([
    {
      sql: `INSERT INTO storage_connections
        (id, owner_user_id, provider, display_name, encrypted_credentials, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
        ON CONFLICT(id) DO UPDATE SET encrypted_credentials = excluded.encrypted_credentials,
          display_name = excluded.display_name, status = 'active', updated_at = excluded.updated_at
        WHERE storage_connections.owner_user_id = excluded.owner_user_id AND storage_connections.provider = excluded.provider`,
      args: [id, input.ownerUserId, input.provider, input.displayName ?? defaultDisplayName(input.provider), input.encryptedCredentials, now, now],
    },
    ...(input.ownerUserId === LEGACY_SUPERADMIN_USER_ID && input.provider === "onedrive" ? [{
      sql: "UPDATE learning_space_sources SET storage_connection_id = ? WHERE provider_type = 'onedrive' AND storage_connection_id IS NULL",
      args: [id],
    }] : []),
  ]);
  return id;
}

export async function disconnectStorageConnection(userId: string, connectionId: string): Promise<boolean> {
  const result = await (await getDatabase()).execute({
    sql: `UPDATE storage_connections SET encrypted_credentials = NULL, status = 'disconnected', updated_at = ?
      WHERE id = ? AND owner_user_id = ?`,
    args: [new Date().toISOString(), connectionId, userId],
  });
  return result.rows.length > 0 || Boolean(await getOwnedStorageConnection(userId, connectionId));
}

export function connectionId(userId: string, provider: StorageConnectionProvider): string {
  if (userId === LEGACY_SUPERADMIN_USER_ID && provider === "onedrive") return LEGACY_ONEDRIVE_CONNECTION_ID;
  const hash = createHash("sha256").update(`${provider}\u0000${userId}`).digest("base64url").slice(0, 30);
  return `connection-${hash}`;
}

function connectionFromRow(row: Record<string, unknown>): StorageConnection {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    provider: row.provider === "google_drive" ? "google_drive" : "onedrive",
    displayName: String(row.display_name),
    status: row.status === "disconnected" ? "disconnected" : "active",
  };
}

function defaultDisplayName(provider: StorageConnectionProvider): string {
  return provider === "onedrive" ? "Persoonlijke OneDrive" : "Google Drive";
}
