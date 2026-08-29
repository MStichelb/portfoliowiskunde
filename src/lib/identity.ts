import { randomUUID } from "node:crypto";

import { getDatabase } from "@/lib/database";

export const LEGACY_SUPERADMIN_USER_ID = "user-legacy-superadmin";

export type UserRole = "superadmin" | "teacher" | "student";
export type UserStatus = "active" | "disabled";
export type LearningSpaceMemberRole = "owner" | "editor";

export interface AppUser {
  id: string;
  displayName: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
}

export interface NormalizedExternalIdentity {
  provider: string;
  providerSubject: string;
  providerPlatform?: string | null;
  displayName: string;
  email?: string | null;
}

export interface NormalizedGroupMembership {
  provider: string;
  externalGroupId: string;
  externalGroupName?: string | null;
}

export interface LearningSpaceGroupMapping {
  learningSpaceId: string;
  provider: string;
  externalGroupId: string;
}

export interface LearningSpaceAccessResolution {
  learningSpaceIds: string[];
  destination: "none" | "automatic" | "selection";
  automaticLearningSpaceId: string | null;
}

export async function getUser(id: string): Promise<AppUser | null> {
  const row = (await (await getDatabase()).execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] })).rows[0];
  return row ? userFromRow(row) : null;
}

export async function createUser(input: { displayName: string; email?: string | null; role: UserRole; status?: UserStatus }): Promise<AppUser> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: "INSERT INTO users (id, display_name, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [id, input.displayName.trim(), input.email?.trim() || null, input.role, input.status ?? "active", now, now],
  });
  return (await getUser(id))!;
}

export async function linkExternalIdentity(userId: string, identity: Pick<NormalizedExternalIdentity, "provider" | "providerSubject" | "providerPlatform">): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: `INSERT INTO external_identities (id, user_id, provider, provider_subject, provider_platform, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, userId, normalizeProvider(identity.provider), identity.providerSubject, identity.providerPlatform?.trim() || null, now, now],
  });
  return id;
}

export async function setLearningSpaceMember(learningSpaceId: string, userId: string, role: LearningSpaceMemberRole): Promise<void> {
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: `INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(learning_space_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
    args: [learningSpaceId, userId, role, now, now],
  });
}

export async function createLearningSpaceGroupMapping(input: {
  learningSpaceId: string;
  provider: string;
  externalGroupId: string;
  externalGroupName?: string | null;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: `INSERT INTO learning_space_group_mappings
      (id, learning_space_id, provider, external_group_id, external_group_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, input.learningSpaceId, normalizeProvider(input.provider), input.externalGroupId, input.externalGroupName?.trim() || null, now, now],
  });
  return id;
}

export async function resolveStoredGroupAccess(memberships: NormalizedGroupMembership[]): Promise<LearningSpaceAccessResolution> {
  const rows = (await (await getDatabase()).execute("SELECT learning_space_id, provider, external_group_id FROM learning_space_group_mappings")).rows;
  return resolveLearningSpaceAccess(memberships, rows.map((row) => ({
    learningSpaceId: String(row.learning_space_id),
    provider: String(row.provider),
    externalGroupId: String(row.external_group_id),
  })));
}

export function resolveLearningSpaceAccess(
  memberships: NormalizedGroupMembership[],
  mappings: LearningSpaceGroupMapping[],
): LearningSpaceAccessResolution {
  const membershipKeys = new Set(memberships.map((membership) => groupKey(membership.provider, membership.externalGroupId)));
  const learningSpaceIds = [...new Set(mappings
    .filter((mapping) => membershipKeys.has(groupKey(mapping.provider, mapping.externalGroupId)))
    .map((mapping) => mapping.learningSpaceId))].sort();
  return {
    learningSpaceIds,
    destination: learningSpaceIds.length === 0 ? "none" : learningSpaceIds.length === 1 ? "automatic" : "selection",
    automaticLearningSpaceId: learningSpaceIds.length === 1 ? learningSpaceIds[0] : null,
  };
}

function userFromRow(row: Record<string, unknown>): AppUser {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    email: typeof row.email === "string" && row.email ? row.email : null,
    role: userRole(String(row.role)),
    status: row.status === "disabled" ? "disabled" : "active",
  };
}

function userRole(value: string): UserRole {
  if (value === "teacher" || value === "student") return value;
  return "superadmin";
}

function normalizeProvider(value: string): string {
  return value.trim().toLowerCase();
}

function groupKey(provider: string, externalGroupId: string): string {
  return `${normalizeProvider(provider)}\u0000${externalGroupId}`;
}
