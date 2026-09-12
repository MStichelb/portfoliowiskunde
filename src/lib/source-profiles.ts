import "server-only";

import { randomUUID } from "node:crypto";

import { AuthorizationError, canAccessAdmin, requireLearningSpaceConfiguration, requireLearningSpaceManagement } from "@/lib/authorization";
import type { DatabaseRow, InStatement } from "@/lib/database";
import { getDatabase } from "@/lib/database";
import type { AppUser } from "@/lib/identity";
import {
  BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG_JSON,
  BUILT_IN_DEFAULT_SOURCE_PROFILE_DESCRIPTION,
  BUILT_IN_DEFAULT_SOURCE_PROFILE_ID,
  BUILT_IN_DEFAULT_SOURCE_PROFILE_NAME,
  BUILT_IN_DEFAULT_SOURCE_PROFILE_TIMESTAMP,
  parseStoredSourceProfileConfig,
  type SourceProfileConfig,
} from "@/lib/source-profile-config";
import { availableSourceProfileName, uniqueSourceProfileName } from "@/lib/source-profile-name";
export { sourceProfileUsageLabel } from "@/lib/source-profile-usage";
export { sourceProfileNameSchema } from "@/lib/source-profile-name";

export type SourceProfileType = "built_in" | "custom";
export type SourceProfileAccess = "owner" | "editor" | "superadmin" | "context";

export interface SourceProfile {
  id: string;
  type: SourceProfileType;
  name: string;
  description: string | null;
  config: SourceProfileConfig;
  managementLearningSpaceId: string | null;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailableSourceProfile extends SourceProfile {
  managementLearningSpaceName: string | null;
  managementLearningSpaceShortLabel: string | null;
  ownerName: string | null;
  usages: SourceProfileUsage[];
  usageCount: number;
  isInactive: boolean;
  access: SourceProfileAccess;
  canRename: boolean;
  canCopy: boolean;
  canLink: boolean;
  linkTargets: SourceProfileCopyTarget[];
}

export interface SourceProfileUsage {
  learningSpaceId: string;
  learningSpaceName: string;
  learningSpaceShortLabel: string;
}

export type ManagedSourceProfile = AvailableSourceProfile;

export interface SourceProfileCopyTarget {
  learningSpaceId: string;
  learningSpaceName: string;
  learningSpaceShortLabel: string;
  profile: SourceProfile;
  canConfigure: boolean;
}

export interface SourceProfileOverview {
  ownedProfiles: ManagedSourceProfile[];
  editorAccessibleActiveProfiles: ManagedSourceProfile[];
  otherUserProfiles: ManagedSourceProfile[];
  otherProfileOwners: SourceProfileOwnerOption[];
  copyTargets: SourceProfileCopyTarget[];
}

export interface SourceProfileOwnerOption {
  id: string;
  label: string;
}

export interface SourceProfileCopyResult {
  profile: SourceProfile;
  activated: boolean;
}

export type SourceProfileRenameScope = "all" | "current";

export async function ensureBuiltInDefaultSourceProfile(): Promise<void> {
  await (await getDatabase()).batch(builtInDefaultSourceProfileBootstrapStatements());
}

export async function getActiveSourceProfileForLearningSpace(learningSpaceId: string): Promise<SourceProfile | null> {
  const result = await (await getDatabase()).execute({
    sql: `SELECT source_profiles.* FROM learning_space_source_profiles
      INNER JOIN source_profiles ON source_profiles.id = learning_space_source_profiles.source_profile_id
      WHERE learning_space_source_profiles.learning_space_id = ?`,
    args: [learningSpaceId],
  });
  return result.rows[0] ? sourceProfileFromRow(result.rows[0]) : null;
}

export async function getSourceProfileOverview(user: AppUser): Promise<SourceProfileOverview> {
  if (!canAccessAdmin(user)) throw new AuthorizationError("Bronprofielen zijn alleen beschikbaar voor actieve beheerders.");
  const [targetRows, profileRows] = await Promise.all([getSourceProfileTargetRows(user), getVisibleSourceProfileRows(user)]);
  const targets = sourceProfileTargetReadModel(targetRows);
  const profiles = sourceProfileDetailsFromRows(profileRows, user, targets.copyTargets.length > 0, targets.linkTargetsByOwner);
  const otherUserProfiles = user.role === "superadmin"
    ? profiles.filter((profile) => profile.ownerUserId !== user.id)
    : [];
  return {
    ownedProfiles: profiles.filter((profile) => profile.ownerUserId === user.id),
    editorAccessibleActiveProfiles: profiles.filter((profile) => profile.access === "editor"),
    otherUserProfiles,
    otherProfileOwners: sourceProfileOwnerOptions(otherUserProfiles),
    copyTargets: targets.copyTargets,
  };
}

export async function getSourceProfileForLearningSpaceCard(user: AppUser, learningSpaceId: string): Promise<AvailableSourceProfile> {
  await requireLearningSpaceManagement(user, learningSpaceId);
  const result = await (await getDatabase()).execute({
    sql: `${sourceProfileDetailsSelect()} WHERE source_profiles.id = (
      SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = ?
    ) ORDER BY usage_space.sort_order, usage_space.name, usage_space.id`,
    args: [learningSpaceId],
  });
  const profile = sourceProfileDetailsFromRows(result.rows, user, false, new Map(), true)[0];
  if (!profile) throw new Error("Deze leeromgeving heeft geen geldig actief bronprofiel.");
  return profile;
}

export async function getSourceProfileCopyTargets(user: AppUser): Promise<SourceProfileCopyTarget[]> {
  if (!canAccessAdmin(user)) return [];
  return sourceProfileTargetReadModel(await getSourceProfileTargetRows(user)).copyTargets;
}

export async function getManagedSourceProfiles(user: AppUser): Promise<ManagedSourceProfile[]> {
  const overview = await getSourceProfileOverview(user);
  return [...overview.ownedProfiles, ...overview.editorAccessibleActiveProfiles, ...overview.otherUserProfiles];
}

export async function canCopySourceProfile(user: AppUser, sourceProfileId: string): Promise<boolean> {
  try {
    await requireVisibleSourceProfile(user, sourceProfileId);
    return (await getSourceProfileCopyTargets(user)).length > 0;
  } catch {
    return false;
  }
}

export async function switchActiveSourceProfile(user: AppUser, learningSpaceId: string, sourceProfileId: string): Promise<void> {
  await requireLearningSpaceConfiguration(user, learningSpaceId);
  const profile = await requireOwnedSourceProfile(user, sourceProfileId);
  getSourceProfileConfig(profile);
  await requireProfileOwnerTarget(profile, learningSpaceId);
  await assignSourceProfile(learningSpaceId, profile.id);
}

export async function createOwnSourceProfile(user: AppUser, learningSpaceId: string): Promise<SourceProfile> {
  await requireLearningSpaceConfiguration(user, learningSpaceId);
  const active = await getActiveSourceProfileForLearningSpace(learningSpaceId);
  if (!active || active.type !== "built_in") throw new Error("Een eigen profiel kan hier alleen vanuit het ingebouwde profiel worden gemaakt.");
  return createIndependentCopy(active, learningSpaceId, "Eigen profiel", user.id, true);
}

export async function copySourceProfileToLearningSpace(user: AppUser, sourceProfileId: string, targetLearningSpaceId: string): Promise<SourceProfileCopyResult> {
  await requireOwnerCopyTarget(user, targetLearningSpaceId);
  const source = await requireVisibleSourceProfile(user, sourceProfileId);
  return { profile: await createIndependentCopy(source, targetLearningSpaceId, copyName(source.name), user.id, true), activated: true };
}

export async function copyActiveSourceProfileToLearningSpace(user: AppUser, sourceLearningSpaceId: string, targetLearningSpaceId: string): Promise<SourceProfileCopyResult> {
  await requireLearningSpaceManagement(user, sourceLearningSpaceId);
  await requireOwnerCopyTarget(user, targetLearningSpaceId);
  const source = await getActiveSourceProfileForLearningSpace(sourceLearningSpaceId);
  if (!source || source.type === "built_in") throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  await requireVisibleSourceProfile(user, source.id);
  return { profile: await createIndependentCopy(source, targetLearningSpaceId, copyName(source.name), user.id, true), activated: true };
}

export async function linkSourceProfileToLearningSpace(user: AppUser, sourceProfileId: string, targetLearningSpaceId: string): Promise<void> {
  await requireLearningSpaceConfiguration(user, targetLearningSpaceId);
  const profile = await requireOwnedSourceProfile(user, sourceProfileId);
  await requireProfileOwnerTarget(profile, targetLearningSpaceId);
  await assignSourceProfile(targetLearningSpaceId, profile.id);
}

export async function renameSourceProfile(user: AppUser, learningSpaceId: string, sourceProfileId: string, name: string, scope?: SourceProfileRenameScope): Promise<void> {
  await requireLearningSpaceConfiguration(user, learningSpaceId);
  const profile = await requireOwnedSourceProfile(user, sourceProfileId);
  const assignment = await (await getDatabase()).execute({
    sql: "SELECT 1 FROM learning_space_source_profiles WHERE learning_space_id = ? AND source_profile_id = ?",
    args: [learningSpaceId, sourceProfileId],
  });
  if (!assignment.rows[0]) throw new AuthorizationError("Dit bronprofiel is niet actief voor deze leeromgeving.");
  const usageCount = await sourceProfileUsageCount(profile.id);
  if (usageCount > 1) {
    if (scope === "current") {
      await createIndependentCopy(profile, learningSpaceId, name, user.id, true);
      return;
    }
    if (scope !== "all") throw new Error("Kies of je dit gedeelde profiel voor alle gekoppelde leeromgevingen of alleen voor deze leeromgeving wilt wijzigen.");
  }
  await renameAllowedSourceProfile(profile, name);
}

export async function renameManagedSourceProfile(user: AppUser, sourceProfileId: string, name: string, confirmShared?: "all"): Promise<void> {
  const profile = await requireOwnedSourceProfile(user, sourceProfileId);
  const usageCount = await sourceProfileUsageCount(profile.id);
  if (usageCount > 1 && confirmShared !== "all") throw new Error("Bevestig dat je dit profiel voor alle gekoppelde leeromgevingen wilt aanpassen.");
  await renameAllowedSourceProfile(profile, name);
}

export function getSourceProfileConfig(profile: SourceProfile): SourceProfileConfig {
  return profile.config;
}

export function canDeleteSourceProfile(profile: Pick<SourceProfile, "type">): boolean {
  return profile.type === "custom";
}

export function builtInDefaultSourceProfileBootstrapStatements(): InStatement[] {
  return [{
    sql: `INSERT INTO source_profiles
      (id, type, name, description, config_version, config_json, created_at, updated_at)
      VALUES (?, 'built_in', ?, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING`,
    args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID, BUILT_IN_DEFAULT_SOURCE_PROFILE_NAME, BUILT_IN_DEFAULT_SOURCE_PROFILE_DESCRIPTION,
      BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG_JSON, BUILT_IN_DEFAULT_SOURCE_PROFILE_TIMESTAMP, BUILT_IN_DEFAULT_SOURCE_PROFILE_TIMESTAMP],
  }];
}

function sourceProfileFromRow(row: DatabaseRow): SourceProfile {
  const type = String(row.type);
  if (type !== "built_in" && type !== "custom") throw new Error("Bronprofiel heeft een ongeldig type.");
  const ownerUserId = row.owner_user_id == null ? null : String(row.owner_user_id);
  if (type === "custom" && !ownerUserId) throw new Error("Bronprofiel heeft geen geldige eigenaar.");
  return {
    id: String(row.id), type, name: String(row.name), description: row.description == null ? null : String(row.description),
    config: parseStoredSourceProfileConfig(Number(row.config_version), String(row.config_json)),
    managementLearningSpaceId: row.management_learning_space_id == null ? null : String(row.management_learning_space_id),
    ownerUserId, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

async function getVisibleSourceProfileRows(user: AppUser): Promise<DatabaseRow[]> {
  const visibility = user.role === "superadmin" ? { sql: "", args: [] } : {
    sql: `AND (source_profiles.owner_user_id = ? OR EXISTS (
      SELECT 1 FROM learning_space_source_profiles AS visible_assignment
      JOIN learning_space_members AS visible_membership ON visible_membership.learning_space_id = visible_assignment.learning_space_id
      JOIN learning_spaces AS visible_space ON visible_space.id = visible_assignment.learning_space_id
      WHERE visible_assignment.source_profile_id = source_profiles.id
        AND visible_membership.user_id = ? AND visible_membership.role = 'editor'
        AND visible_space.is_active = 1 AND visible_space.archived_at IS NULL
    ))`, args: [user.id, user.id],
  };
  const result = await (await getDatabase()).execute({
    sql: `${sourceProfileDetailsSelect()} WHERE source_profiles.type = 'custom' ${visibility.sql}
      ORDER BY LOWER(source_profiles.name), source_profiles.id, usage_space.sort_order, usage_space.name, usage_space.id`,
    args: visibility.args,
  });
  return result.rows;
}

function sourceProfileDetailsSelect(): string {
  return `SELECT source_profiles.*, management_space.name AS management_learning_space_name,
      management_space.short_label AS management_learning_space_short_label, owner.display_name AS owner_name,
      usage_space.id AS usage_learning_space_id, usage_space.name AS usage_learning_space_name,
      usage_space.short_label AS usage_learning_space_short_label, usage_space.sort_order AS usage_learning_space_sort_order
    FROM source_profiles
    LEFT JOIN learning_spaces AS management_space ON management_space.id = source_profiles.management_learning_space_id
    LEFT JOIN users AS owner ON owner.id = source_profiles.owner_user_id
    LEFT JOIN learning_space_source_profiles ON learning_space_source_profiles.source_profile_id = source_profiles.id
    LEFT JOIN learning_spaces AS usage_space ON usage_space.id = learning_space_source_profiles.learning_space_id`;
}

function sourceProfileDetailsFromRows(
  rows: DatabaseRow[],
  user: AppUser,
  hasCopyTargets: boolean,
  linkTargetsByOwner: Map<string, SourceProfileCopyTarget[]>,
  contextual = false,
): ManagedSourceProfile[] {
  const profiles = new Map<string, ManagedSourceProfile>();
  for (const row of rows) {
    const id = String(row.id);
    let profile = profiles.get(id);
    if (!profile) {
      const parsed = trySourceProfileFromRow(row);
      if (!parsed) continue;
      const access: SourceProfileAccess = user.role === "superadmin" ? "superadmin"
        : parsed.ownerUserId === user.id ? "owner" : contextual ? "context" : "editor";
      const canMutate = access === "owner" || access === "superadmin";
      const linkTargets = canMutate && parsed.ownerUserId
        ? (linkTargetsByOwner.get(parsed.ownerUserId) ?? []).filter((target) => target.profile.id !== parsed.id)
        : [];
      profile = {
        ...parsed,
        managementLearningSpaceName: row.management_learning_space_name == null ? null : String(row.management_learning_space_name),
        managementLearningSpaceShortLabel: row.management_learning_space_short_label == null ? null : String(row.management_learning_space_short_label),
        ownerName: row.owner_name == null ? null : String(row.owner_name),
        usages: [], usageCount: 0, isInactive: true, access,
        canRename: canMutate,
        canCopy: parsed.type === "custom" && hasCopyTargets && (canMutate || access === "editor"),
        canLink: parsed.type === "custom" && linkTargets.length > 0,
        linkTargets,
      };
      profiles.set(id, profile);
    }
    if (row.usage_learning_space_id != null) {
      profile.usages.push({
        learningSpaceId: String(row.usage_learning_space_id), learningSpaceName: String(row.usage_learning_space_name),
        learningSpaceShortLabel: String(row.usage_learning_space_short_label),
      });
      profile.usageCount = profile.usages.length;
      profile.isInactive = false;
    }
  }
  return [...profiles.values()].sort(compareSourceProfiles);
}

function sourceProfileOwnerOptions(profiles: ManagedSourceProfile[]): SourceProfileOwnerOption[] {
  const owners = new Map<string, SourceProfileOwnerOption>();
  for (const profile of profiles) {
    if (!profile.ownerUserId) continue;
    owners.set(profile.ownerUserId, { id: profile.ownerUserId, label: profile.ownerName ?? profile.ownerUserId });
  }
  return [...owners.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "nl-BE", { sensitivity: "base" }) || left.id.localeCompare(right.id),
  );
}

async function requireVisibleSourceProfile(user: AppUser, sourceProfileId: string): Promise<SourceProfile> {
  if (!canAccessAdmin(user)) throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  const result = await (await getDatabase()).execute({ sql: "SELECT * FROM source_profiles WHERE id = ?", args: [sourceProfileId] });
  if (!result.rows[0]) throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  const profile = sourceProfileFromRow(result.rows[0]);
  if (profile.type === "built_in") throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  if (user.role === "superadmin" || profile.ownerUserId === user.id) return profile;
  const editorUsage = await (await getDatabase()).execute({
    sql: `SELECT 1 FROM learning_space_source_profiles
      JOIN learning_space_members ON learning_space_members.learning_space_id = learning_space_source_profiles.learning_space_id
      JOIN learning_spaces ON learning_spaces.id = learning_space_source_profiles.learning_space_id
      WHERE learning_space_source_profiles.source_profile_id = ?
        AND learning_space_members.user_id = ? AND learning_space_members.role = 'editor'
        AND learning_spaces.is_active = 1 AND learning_spaces.archived_at IS NULL LIMIT 1`,
    args: [profile.id, user.id],
  });
  if (!editorUsage.rows[0]) throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  return profile;
}

async function requireOwnedSourceProfile(user: AppUser, sourceProfileId: string): Promise<SourceProfile> {
  if (!canAccessAdmin(user)) throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  const result = await (await getDatabase()).execute({ sql: "SELECT * FROM source_profiles WHERE id = ?", args: [sourceProfileId] });
  if (!result.rows[0]) throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  const profile = sourceProfileFromRow(result.rows[0]);
  if (profile.type === "built_in" || (user.role !== "superadmin" && profile.ownerUserId !== user.id)) {
    throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  }
  return profile;
}

async function requireOwnerCopyTarget(user: AppUser, learningSpaceId: string): Promise<void> {
  if (!canAccessAdmin(user)) throw new AuthorizationError("Kopiëren kan alleen naar een leeromgeving waarvan je eigenaar bent.");
  const membershipCheck = user.role === "superadmin" ? { sql: "", args: [] } : {
    sql: `AND EXISTS (SELECT 1 FROM learning_space_members
      WHERE learning_space_members.learning_space_id = learning_spaces.id
        AND learning_space_members.user_id = ? AND learning_space_members.role = 'owner')`,
    args: [user.id],
  };
  const result = await (await getDatabase()).execute({
    sql: `SELECT 1 FROM learning_spaces WHERE learning_spaces.id = ?
      AND learning_spaces.is_active = 1 AND learning_spaces.archived_at IS NULL ${membershipCheck.sql}`,
    args: [learningSpaceId, ...membershipCheck.args],
  });
  if (!result.rows[0]) {
    throw new AuthorizationError("Kopiëren kan alleen naar een leeromgeving waarvan je eigenaar bent.");
  }
}

async function requireProfileOwnerTarget(profile: SourceProfile, learningSpaceId: string): Promise<void> {
  if (!profile.ownerUserId) throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  const result = await (await getDatabase()).execute({
    sql: `SELECT 1 FROM learning_space_members
      JOIN learning_spaces ON learning_spaces.id = learning_space_members.learning_space_id
      WHERE learning_space_members.learning_space_id = ? AND learning_space_members.user_id = ?
        AND learning_space_members.role = 'owner' AND learning_spaces.is_active = 1
        AND learning_spaces.archived_at IS NULL LIMIT 1`,
    args: [learningSpaceId, profile.ownerUserId],
  });
  if (!result.rows[0]) {
    throw new AuthorizationError("Dit bronprofiel kan alleen worden gekoppeld aan een leeromgeving waarvan de profieleigenaar ook eigenaar is.");
  }
}

async function getSourceProfileTargetRows(user: AppUser): Promise<DatabaseRow[]> {
  const scope = user.role === "superadmin" ? { sql: "", args: [] } : {
    sql: `AND EXISTS (SELECT 1 FROM learning_space_members AS current_owner
      WHERE current_owner.learning_space_id = learning_spaces.id
        AND current_owner.user_id = ? AND current_owner.role = 'owner')`,
    args: [user.id],
  };
  return (await (await getDatabase()).execute({
    sql: `SELECT active_profile.*, learning_spaces.id AS target_learning_space_id,
        learning_spaces.name AS target_learning_space_name,
        learning_spaces.short_label AS target_learning_space_short_label,
        target_owner.user_id AS target_owner_user_id
      FROM learning_spaces
      JOIN learning_space_source_profiles ON learning_space_source_profiles.learning_space_id = learning_spaces.id
      JOIN source_profiles AS active_profile ON active_profile.id = learning_space_source_profiles.source_profile_id
      LEFT JOIN learning_space_members AS target_owner ON target_owner.learning_space_id = learning_spaces.id
        AND target_owner.role = 'owner'
      WHERE learning_spaces.is_active = 1 AND learning_spaces.archived_at IS NULL ${scope.sql}
      ORDER BY learning_spaces.sort_order, learning_spaces.name, target_owner.user_id`,
    args: scope.args,
  })).rows;
}

function sourceProfileTargetReadModel(rows: DatabaseRow[]): {
  copyTargets: SourceProfileCopyTarget[];
  linkTargetsByOwner: Map<string, SourceProfileCopyTarget[]>;
} {
  const copyTargets = new Map<string, SourceProfileCopyTarget>();
  const linkTargetsByOwner = new Map<string, Map<string, SourceProfileCopyTarget>>();
  for (const row of rows) {
    const profile = trySourceProfileFromRow(row);
    if (!profile) continue;
    const target: SourceProfileCopyTarget = {
      learningSpaceId: String(row.target_learning_space_id),
      learningSpaceName: String(row.target_learning_space_name),
      learningSpaceShortLabel: String(row.target_learning_space_short_label),
      profile,
      canConfigure: true,
    };
    copyTargets.set(target.learningSpaceId, target);
    if (row.target_owner_user_id != null) {
      const ownerUserId = String(row.target_owner_user_id);
      const ownerTargets = linkTargetsByOwner.get(ownerUserId) ?? new Map<string, SourceProfileCopyTarget>();
      ownerTargets.set(target.learningSpaceId, target);
      linkTargetsByOwner.set(ownerUserId, ownerTargets);
    }
  }
  return {
    copyTargets: [...copyTargets.values()],
    linkTargetsByOwner: new Map([...linkTargetsByOwner].map(([ownerUserId, targets]) => [ownerUserId, [...targets.values()]])),
  };
}

async function createIndependentCopy(source: SourceProfile, managementLearningSpaceId: string, requestedName: string, ownerUserId: string, activate: boolean): Promise<SourceProfile> {
  const configJson = JSON.stringify(getSourceProfileConfig(source));
  const config = parseStoredSourceProfileConfig(source.config.configVersion, configJson);
  const id = `source-profile-${randomUUID()}`;
  const now = new Date().toISOString();
  const name = await availableSourceProfileName(ownerUserId, requestedName);
  await (await getDatabase()).batch([{
    sql: `INSERT INTO source_profiles
      (id, type, name, description, config_version, config_json, created_at, updated_at, management_learning_space_id, owner_user_id)
      VALUES (?, 'custom', ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, name, source.description, config.configVersion, JSON.stringify(config), now, now, managementLearningSpaceId, ownerUserId],
  }, ...(activate ? [assignmentStatement(managementLearningSpaceId, id, now)] : [])]);
  return { id, type: "custom", name, description: source.description, config, managementLearningSpaceId, ownerUserId, createdAt: now, updatedAt: now };
}

async function renameAllowedSourceProfile(profile: SourceProfile, name: string): Promise<void> {
  if (profile.type !== "custom" || !profile.ownerUserId) throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  const validName = await uniqueSourceProfileName(profile.ownerUserId, name, profile.id);
  await (await getDatabase()).execute({ sql: "UPDATE source_profiles SET name = ?, updated_at = ? WHERE id = ? AND type = 'custom'", args: [validName, new Date().toISOString(), profile.id] });
}

async function assignSourceProfile(learningSpaceId: string, sourceProfileId: string): Promise<void> {
  await (await getDatabase()).execute(assignmentStatement(learningSpaceId, sourceProfileId, new Date().toISOString()));
}

function assignmentStatement(learningSpaceId: string, sourceProfileId: string, now: string): InStatement {
  return {
    sql: `INSERT INTO learning_space_source_profiles (learning_space_id, source_profile_id, assigned_at, updated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(learning_space_id) DO UPDATE SET source_profile_id = excluded.source_profile_id, updated_at = excluded.updated_at`,
    args: [learningSpaceId, sourceProfileId, now, now],
  };
}

async function sourceProfileUsageCount(sourceProfileId: string): Promise<number> {
  return Number((await (await getDatabase()).execute({ sql: "SELECT COUNT(*) AS count FROM learning_space_source_profiles WHERE source_profile_id = ?", args: [sourceProfileId] })).rows[0]?.count ?? 0);
}

function trySourceProfileFromRow(row: DatabaseRow): SourceProfile | null {
  try { return sourceProfileFromRow(row); } catch { return null; }
}

function compareSourceProfiles(first: SourceProfile, second: SourceProfile): number {
  return Number(!isStandardPortfolioName(first.name)) - Number(!isStandardPortfolioName(second.name))
    || first.name.localeCompare(second.name, "nl", { sensitivity: "base" }) || first.id.localeCompare(second.id);
}

function isStandardPortfolioName(name: string): boolean {
  return name.trim().toLocaleLowerCase("nl") === "standaard portfolio";
}

function copyName(sourceName: string): string {
  return `Kopie van ${sourceName}`.slice(0, 80).trim();
}
