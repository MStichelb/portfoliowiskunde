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
  membershipType?: "direct" | "parent";
}

export interface ExternalIdentityRecord {
  id: string;
  userId: string;
  provider: string;
  providerSubject: string;
  providerPlatform: string | null;
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

export function userFirstName(user: Pick<AppUser, "displayName">): string {
  return user.displayName.trim().split(/\s+/)[0] || "Gebruiker";
}

export async function updateUserFromExternalIdentity(userId: string, identity: NormalizedExternalIdentity): Promise<AppUser> {
  const displayName = identity.displayName.trim();
  if (!displayName) throw new Error("De externe identiteit bevat geen geldige naam.");
  await (await getDatabase()).execute({
    sql: "UPDATE users SET display_name = ?, email = COALESCE(?, email), updated_at = ? WHERE id = ?",
    args: [displayName, identity.email?.trim() || null, new Date().toISOString(), userId],
  });
  const user = await getUser(userId);
  if (!user) throw new Error("Gebruiker niet gevonden.");
  return user;
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
    args: [id, userId, normalizeProvider(identity.provider), identity.providerSubject.trim(), normalizePlatform(identity.providerPlatform), now, now],
  });
  return id;
}

export async function findExternalIdentity(identity: Pick<NormalizedExternalIdentity, "provider" | "providerSubject" | "providerPlatform">): Promise<ExternalIdentityRecord | null> {
  const row = (await (await getDatabase()).execute({
    sql: "SELECT * FROM external_identities WHERE provider = ? AND provider_subject = ? AND provider_platform = ?",
    args: [normalizeProvider(identity.provider), identity.providerSubject.trim(), normalizePlatform(identity.providerPlatform)],
  })).rows[0];
  return row ? externalIdentityFromRow(row) : null;
}

export async function findOrCreateExternalUser(identity: NormalizedExternalIdentity): Promise<{ user: AppUser; identity: ExternalIdentityRecord; created: boolean }> {
  const existing = await findExternalIdentity(identity);
  if (existing) return { user: (await getUser(existing.userId))!, identity: existing, created: false };

  const userId = randomUUID();
  const identityId = randomUUID();
  const now = new Date().toISOString();
  try {
    await (await getDatabase()).batch([
      {
        sql: "INSERT INTO users (id, display_name, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'student', 'active', ?, ?)",
        args: [userId, identity.displayName.trim() || "Smartschoolgebruiker", identity.email?.trim() || null, now, now],
      },
      {
        sql: `INSERT INTO external_identities (id, user_id, provider, provider_subject, provider_platform, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [identityId, userId, normalizeProvider(identity.provider), identity.providerSubject.trim(), normalizePlatform(identity.providerPlatform), now, now],
      },
    ]);
    return {
      user: (await getUser(userId))!,
      identity: (await findExternalIdentity(identity))!,
      created: true,
    };
  } catch (error) {
    const racedIdentity = await findExternalIdentity(identity);
    if (!racedIdentity) throw error;
    return { user: (await getUser(racedIdentity.userId))!, identity: racedIdentity, created: false };
  }
}

export async function linkExternalIdentityToUser(userId: string, identity: NormalizedExternalIdentity): Promise<ExternalIdentityRecord> {
  const existing = await findExternalIdentity(identity);
  if (existing) {
    if (existing.userId !== userId) throw new Error("Deze Smartschoolidentiteit is al aan een andere gebruiker gekoppeld.");
    return existing;
  }
  await linkExternalIdentity(userId, identity);
  return (await findExternalIdentity(identity))!;
}

export async function replaceExternalIdentityGroups(identityId: string, groups: NormalizedGroupMembership[]): Promise<void> {
  const identity = (await (await getDatabase()).execute({ sql: "SELECT provider FROM external_identities WHERE id = ?", args: [identityId] })).rows[0];
  if (!identity) throw new Error("Externe identiteit niet gevonden.");
  const provider = normalizeProvider(String(identity.provider));
  const now = new Date().toISOString();
  const uniqueGroups = [...new Map(groups
    .filter((group) => normalizeProvider(group.provider) === provider && group.externalGroupId.trim())
    .map((group) => [`${group.membershipType ?? "direct"}\u0000${group.externalGroupId}`, group] as const)).values()];
  await (await getDatabase()).batch([
    { sql: "DELETE FROM external_identity_groups WHERE identity_id = ?", args: [identityId] },
    ...uniqueGroups.map((group) => ({
      sql: `INSERT INTO external_identity_groups
        (identity_id, external_group_id, external_group_name, membership_type, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [identityId, group.externalGroupId, group.externalGroupName?.trim() || null, group.membershipType ?? "direct", now],
    })),
  ]);
}

export async function resolveStoredUserGroupAccess(userId: string): Promise<LearningSpaceAccessResolution> {
  const rows = (await (await getDatabase()).execute({
    sql: `SELECT external_identities.provider, external_identity_groups.external_group_id, external_identity_groups.external_group_name,
      external_identity_groups.membership_type
      FROM external_identity_groups JOIN external_identities ON external_identities.id = external_identity_groups.identity_id
      WHERE external_identities.user_id = ?`,
    args: [userId],
  })).rows;
  return resolveStoredGroupAccess(rows.map((row) => ({
    provider: String(row.provider),
    externalGroupId: String(row.external_group_id),
    externalGroupName: typeof row.external_group_name === "string" ? row.external_group_name : null,
    membershipType: row.membership_type === "parent" ? "parent" : "direct",
  })));
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

function normalizePlatform(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function externalIdentityFromRow(row: Record<string, unknown>): ExternalIdentityRecord {
  const platform = String(row.provider_platform ?? "");
  return {
    id: String(row.id),
    userId: String(row.user_id),
    provider: String(row.provider),
    providerSubject: String(row.provider_subject),
    providerPlatform: platform || null,
  };
}

function groupKey(provider: string, externalGroupId: string): string {
  return `${normalizeProvider(provider)}\u0000${externalGroupId}`;
}
