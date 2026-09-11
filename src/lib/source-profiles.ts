import "server-only";

import { randomUUID } from "node:crypto";

import { AuthorizationError, canConfigureLearningSpace, getManageableLearningSpaceIds, requireLearningSpaceConfiguration, requireLearningSpaceManagement } from "@/lib/authorization";
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

export interface SourceProfile {
  id: string;
  type: SourceProfileType;
  name: string;
  description: string | null;
  config: SourceProfileConfig;
  managementLearningSpaceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailableSourceProfile extends SourceProfile {
  managementLearningSpaceName: string | null;
  managementLearningSpaceShortLabel: string | null;
  usages: SourceProfileUsage[];
  usageCount: number;
  isInactive: boolean;
  canRename: boolean;
  ownerNames: string[];
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

export interface SourceProfileAdminModel {
  activeProfile: SourceProfile;
  availableProfiles: AvailableSourceProfile[];
  copyTargets: SourceProfileCopyTarget[];
}

export interface SourceProfileCopyResult {
  profile: SourceProfile;
  activated: boolean;
}

export type SourceProfileRenameScope = "all" | "current";

export async function ensureBuiltInDefaultSourceProfile(): Promise<void> {
  const database = await getDatabase();
  await database.batch(builtInDefaultSourceProfileBootstrapStatements());
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

export async function getSourceProfileAdminModel(user: AppUser, learningSpaceId: string): Promise<SourceProfileAdminModel> {
  await requireLearningSpaceManagement(user, learningSpaceId);
  const { managementLearningSpaceIds, configurableIds } = await getSourceProfileVisibilityScope(user);
  const database = await getDatabase();
  const [activeResult, managedProfiles, copyTargets] = await Promise.all([
    database.execute({
      sql: `SELECT source_profiles.* FROM learning_space_source_profiles
        JOIN source_profiles ON source_profiles.id = learning_space_source_profiles.source_profile_id
        WHERE learning_space_source_profiles.learning_space_id = ?`,
      args: [learningSpaceId],
    }),
    getManagedSourceProfilesForManagementIds(managementLearningSpaceIds, configurableIds),
    getSourceProfileCopyTargetsForIds(managementLearningSpaceIds, configurableIds),
  ]);
  const activeProfile = activeResult.rows[0] ? sourceProfileFromRow(activeResult.rows[0]) : null;
  if (!activeProfile) throw new Error("Deze leeromgeving heeft geen actief bronprofiel.");
  return {
    activeProfile,
    availableProfiles: managedProfiles,
    copyTargets,
  };
}

export async function getSourceProfileCopyTargets(user: AppUser): Promise<SourceProfileCopyTarget[]> {
  const { managementLearningSpaceIds, configurableIds } = await getSourceProfileVisibilityScope(user);
  return getSourceProfileCopyTargetsForIds(managementLearningSpaceIds, configurableIds);
}

export async function getManagedSourceProfiles(user: AppUser): Promise<ManagedSourceProfile[]> {
  const { managementLearningSpaceIds, configurableIds } = await getSourceProfileVisibilityScope(user);
  return getManagedSourceProfilesForManagementIds(managementLearningSpaceIds, configurableIds, true);
}

async function getManagedSourceProfilesForManagementIds(manageableSpaceIds: string[], configurableIds?: Set<string>, includeOwners = false): Promise<ManagedSourceProfile[]> {
  if (manageableSpaceIds.length === 0) return [];
  const placeholders = manageableSpaceIds.map(() => "?").join(", ");
  const database = await getDatabase();
  const [result, ownerResult] = await Promise.all([
    database.execute({
      sql: `SELECT source_profiles.*,
        management_space.name AS management_learning_space_name,
        management_space.short_label AS management_learning_space_short_label,
        usage_space.id AS usage_learning_space_id,
        usage_space.name AS usage_learning_space_name,
        usage_space.short_label AS usage_learning_space_short_label,
        usage_space.sort_order AS usage_learning_space_sort_order
      FROM source_profiles
      JOIN learning_spaces AS management_space ON management_space.id = source_profiles.management_learning_space_id
      LEFT JOIN learning_space_source_profiles ON learning_space_source_profiles.source_profile_id = source_profiles.id
      LEFT JOIN learning_spaces AS usage_space ON usage_space.id = learning_space_source_profiles.learning_space_id
      WHERE source_profiles.type = 'custom'
        AND source_profiles.management_learning_space_id IN (${placeholders})
      ORDER BY LOWER(source_profiles.name), source_profiles.id, usage_space.sort_order, usage_space.name, usage_space.id`,
      args: manageableSpaceIds,
    }),
    includeOwners ? database.execute({
      sql: `SELECT learning_space_members.learning_space_id, users.display_name
        FROM learning_space_members
        JOIN users ON users.id = learning_space_members.user_id
        WHERE learning_space_members.role = 'owner'
          AND learning_space_members.learning_space_id IN (${placeholders})
      ORDER BY learning_space_members.learning_space_id, LOWER(users.display_name), users.id`,
      args: manageableSpaceIds,
    }) : Promise.resolve({ rows: [] }),
  ]);
  const ownerNamesBySpace = new Map<string, string[]>();
  for (const row of ownerResult.rows) {
    const learningSpaceId = String(row.learning_space_id);
    const names = ownerNamesBySpace.get(learningSpaceId) ?? [];
    names.push(String(row.display_name));
    ownerNamesBySpace.set(learningSpaceId, names);
  }
  const profiles = new Map<string, ManagedSourceProfile>();
  for (const row of result.rows) {
    const id = String(row.id);
    let profile = profiles.get(id);
    if (!profile) {
      const parsed = trySourceProfileFromRow(row);
      if (!parsed) continue;
      profile = {
        ...parsed,
        managementLearningSpaceName: String(row.management_learning_space_name),
        managementLearningSpaceShortLabel: String(row.management_learning_space_short_label),
        usages: [],
        usageCount: 0,
        isInactive: true,
        canRename: configurableIds?.has(parsed.managementLearningSpaceId ?? "") ?? true,
        ownerNames: ownerNamesBySpace.get(parsed.managementLearningSpaceId ?? "") ?? [],
      };
      profiles.set(id, profile);
    }
    if (row.usage_learning_space_id != null) {
      profile.usages.push({
        learningSpaceId: String(row.usage_learning_space_id),
        learningSpaceName: String(row.usage_learning_space_name),
        learningSpaceShortLabel: String(row.usage_learning_space_short_label),
      });
      profile.usageCount = profile.usages.length;
      profile.isInactive = false;
    }
  }
  return [...profiles.values()].sort((first, second) =>
    Number(!isStandardPortfolioName(first.name)) - Number(!isStandardPortfolioName(second.name))
      || first.name.localeCompare(second.name, "nl", { sensitivity: "base" })
      || first.id.localeCompare(second.id));
}

function isStandardPortfolioName(name: string): boolean {
  return name.trim().toLocaleLowerCase("nl") === "standaard portfolio";
}

export async function switchActiveSourceProfile(user: AppUser, learningSpaceId: string, sourceProfileId: string): Promise<void> {
  await requireLearningSpaceConfiguration(user, learningSpaceId);
  const profile = await requireAllowedSourceProfile(user, sourceProfileId);
  // Parsing the row above is deliberate: malformed or unsupported configs are never activated.
  getSourceProfileConfig(profile);
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: `INSERT INTO learning_space_source_profiles (learning_space_id, source_profile_id, assigned_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(learning_space_id) DO UPDATE SET source_profile_id = excluded.source_profile_id, updated_at = excluded.updated_at`,
    args: [learningSpaceId, profile.id, now, now],
  });
}

export async function createOwnSourceProfile(user: AppUser, learningSpaceId: string): Promise<SourceProfile> {
  await requireLearningSpaceConfiguration(user, learningSpaceId);
  const active = await getActiveSourceProfileForLearningSpace(learningSpaceId);
  if (!active || active.type !== "built_in") throw new Error("Een eigen profiel kan hier alleen vanuit het ingebouwde profiel worden gemaakt.");
  return createIndependentCopy(active, learningSpaceId, "Eigen profiel", true);
}

export async function copySourceProfileToLearningSpace(
  user: AppUser,
  sourceProfileId: string,
  targetLearningSpaceId: string,
): Promise<SourceProfileCopyResult> {
  await requireLearningSpaceManagement(user, targetLearningSpaceId);
  const source = await requireCopyableSourceProfile(user, sourceProfileId);
  const activated = await canConfigureLearningSpace(user, targetLearningSpaceId);
  return { profile: await createIndependentCopy(source, targetLearningSpaceId, copyName(source.name), activated), activated };
}

export async function copyActiveSourceProfileToLearningSpace(
  user: AppUser,
  sourceLearningSpaceId: string,
  targetLearningSpaceId: string,
): Promise<SourceProfileCopyResult> {
  await requireLearningSpaceManagement(user, sourceLearningSpaceId);
  await requireLearningSpaceManagement(user, targetLearningSpaceId);
  const source = await getActiveSourceProfileForLearningSpace(sourceLearningSpaceId);
  if (!source || source.type === "built_in") throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  await requireVisibleSourceProfile(user, source.id);
  const activated = await canConfigureLearningSpace(user, targetLearningSpaceId);
  return { profile: await createIndependentCopy(source, targetLearningSpaceId, copyName(source.name), activated), activated };
}

export async function linkSourceProfileToLearningSpace(user: AppUser, sourceProfileId: string, targetLearningSpaceId: string): Promise<void> {
  await requireLearningSpaceConfiguration(user, targetLearningSpaceId);
  const profile = await requireAllowedSourceProfile(user, sourceProfileId);
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: `INSERT INTO learning_space_source_profiles (learning_space_id, source_profile_id, assigned_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(learning_space_id) DO UPDATE SET source_profile_id = excluded.source_profile_id, updated_at = excluded.updated_at`,
    args: [targetLearningSpaceId, profile.id, now, now],
  });
}

export async function renameSourceProfile(
  user: AppUser,
  learningSpaceId: string,
  sourceProfileId: string,
  name: string,
  scope?: SourceProfileRenameScope,
): Promise<void> {
  await requireLearningSpaceConfiguration(user, learningSpaceId);
  const profile = await requireAllowedSourceProfile(user, sourceProfileId);
  if (profile.type !== "custom") throw new Error("Het ingebouwde bronprofiel kan niet worden hernoemd.");
  const assignment = await (await getDatabase()).execute({
    sql: "SELECT 1 FROM learning_space_source_profiles WHERE learning_space_id = ? AND source_profile_id = ?",
    args: [learningSpaceId, sourceProfileId],
  });
  if (!assignment.rows[0]) throw new AuthorizationError("Dit bronprofiel is niet actief voor deze leeromgeving.");
  const usageCount = Number((await (await getDatabase()).execute({
    sql: "SELECT COUNT(*) AS count FROM learning_space_source_profiles WHERE source_profile_id = ?",
    args: [profile.id],
  })).rows[0]?.count ?? 0);
  if (usageCount > 1) {
    if (scope === "current") {
      await createIndependentCopy(profile, learningSpaceId, name, true);
      return;
    }
    if (scope !== "all") throw new Error("Kies of je dit gedeelde profiel voor alle gekoppelde leeromgevingen of alleen voor deze leeromgeving wilt wijzigen.");
  }
  await renameAllowedSourceProfile(profile, name);
}

export async function renameManagedSourceProfile(user: AppUser, sourceProfileId: string, name: string, confirmShared?: "all"): Promise<void> {
  const profile = await requireAllowedSourceProfile(user, sourceProfileId);
  if (!profile.managementLearningSpaceId) throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  await requireLearningSpaceConfiguration(user, profile.managementLearningSpaceId);
  const usageCount = Number((await (await getDatabase()).execute({
    sql: "SELECT COUNT(*) AS count FROM learning_space_source_profiles WHERE source_profile_id = ?",
    args: [profile.id],
  })).rows[0]?.count ?? 0);
  if (usageCount > 1 && confirmShared !== "all") throw new Error("Bevestig dat je dit profiel voor alle gekoppelde leeromgevingen wilt aanpassen.");
  await renameAllowedSourceProfile(profile, name);
}

async function renameAllowedSourceProfile(profile: SourceProfile, name: string): Promise<void> {
  if (profile.type !== "custom" || !profile.managementLearningSpaceId) throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  const validName = await uniqueSourceProfileName(profile.managementLearningSpaceId, name, profile.id);
  await (await getDatabase()).execute({
    sql: "UPDATE source_profiles SET name = ?, updated_at = ? WHERE id = ? AND type = 'custom'",
    args: [validName, new Date().toISOString(), profile.id],
  });
}

export function getSourceProfileConfig(profile: SourceProfile): SourceProfileConfig {
  return profile.config;
}

export function canDeleteSourceProfile(profile: Pick<SourceProfile, "type">): boolean {
  return profile.type === "custom";
}

export function builtInDefaultSourceProfileBootstrapStatements(): InStatement[] {
  return [
    {
      sql: `INSERT INTO source_profiles
        (id, type, name, description, config_version, config_json, created_at, updated_at)
        VALUES (?, 'built_in', ?, ?, 1, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`,
      args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID, BUILT_IN_DEFAULT_SOURCE_PROFILE_NAME,
        BUILT_IN_DEFAULT_SOURCE_PROFILE_DESCRIPTION, BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG_JSON,
        BUILT_IN_DEFAULT_SOURCE_PROFILE_TIMESTAMP, BUILT_IN_DEFAULT_SOURCE_PROFILE_TIMESTAMP],
    },
  ];
}

function sourceProfileFromRow(row: DatabaseRow): SourceProfile {
  const type = String(row.type);
  if (type !== "built_in" && type !== "custom") throw new Error("Bronprofiel heeft een ongeldig type.");
  return {
    id: String(row.id),
    type,
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    config: parseStoredSourceProfileConfig(Number(row.config_version), String(row.config_json)),
    managementLearningSpaceId: row.management_learning_space_id == null ? null : String(row.management_learning_space_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function requireAllowedSourceProfile(user: AppUser, sourceProfileId: string): Promise<SourceProfile> {
  return requireVisibleSourceProfile(user, sourceProfileId);
}

async function requireVisibleSourceProfile(user: AppUser, sourceProfileId: string): Promise<SourceProfile> {
  const result = await (await getDatabase()).execute({ sql: "SELECT * FROM source_profiles WHERE id = ?", args: [sourceProfileId] });
  if (!result.rows[0]) throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  const profile = sourceProfileFromRow(result.rows[0]);
  if (profile.type === "built_in") throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  const managementLearningSpaceIds = await getVisibleManagementLearningSpaceIds(user);
  if (!profile.managementLearningSpaceId || !managementLearningSpaceIds.includes(profile.managementLearningSpaceId)) {
    throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  }
  return profile;
}

async function requireCopyableSourceProfile(user: AppUser, sourceProfileId: string): Promise<SourceProfile> {
  return requireVisibleSourceProfile(user, sourceProfileId);
}

function trySourceProfileFromRow(row: DatabaseRow): SourceProfile | null {
  try {
    return sourceProfileFromRow(row);
  } catch {
    return null;
  }
}

async function createIndependentCopy(source: SourceProfile, learningSpaceId: string, requestedName: string, activate: boolean): Promise<SourceProfile> {
  const config = getSourceProfileConfig(source);
  const configJson = JSON.stringify(config);
  // Round-trip validation makes the snapshot boundary explicit and rejects unsupported versions.
  const validatedConfig = parseStoredSourceProfileConfig(config.configVersion, configJson);
  const id = `source-profile-${randomUUID()}`;
  const now = new Date().toISOString();
  const name = await availableSourceProfileName(learningSpaceId, requestedName);
  await (await getDatabase()).batch([
    {
      sql: `INSERT INTO source_profiles
        (id, type, name, description, config_version, config_json, created_at, updated_at, management_learning_space_id)
        VALUES (?, 'custom', ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, name, source.description, validatedConfig.configVersion, JSON.stringify(validatedConfig), now, now, learningSpaceId],
    },
    ...(activate ? [{
      sql: `INSERT INTO learning_space_source_profiles (learning_space_id, source_profile_id, assigned_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(learning_space_id) DO UPDATE SET source_profile_id = excluded.source_profile_id, updated_at = excluded.updated_at`,
      args: [learningSpaceId, id, now, now],
    }] : []),
  ]);
  return {
    id,
    type: "custom",
    name,
    description: source.description,
    config: validatedConfig,
    managementLearningSpaceId: learningSpaceId,
    createdAt: now,
    updatedAt: now,
  };
}

async function configurableLearningSpaceIds(user: AppUser, manageableIds: string[]): Promise<string[]> {
  if (user.role === "superadmin") return manageableIds;
  if (manageableIds.length === 0) return [];
  const rows = await (await getDatabase()).execute({
    sql: "SELECT learning_space_id FROM learning_space_members WHERE user_id = ? AND role = 'owner'",
    args: [user.id],
  });
  return rows.rows.map((row) => String(row.learning_space_id));
}

async function getSourceProfileVisibilityScope(user: AppUser): Promise<{ managementLearningSpaceIds: string[]; configurableIds: Set<string> }> {
  const managementLearningSpaceIds = await getVisibleManagementLearningSpaceIds(user);
  return {
    managementLearningSpaceIds,
    configurableIds: new Set(await configurableLearningSpaceIds(user, managementLearningSpaceIds)),
  };
}

async function getVisibleManagementLearningSpaceIds(user: AppUser): Promise<string[]> {
  return getManageableLearningSpaceIds(user);
}

async function getSourceProfileCopyTargetsForIds(manageableSpaceIds: string[], configurableIds: Set<string>): Promise<SourceProfileCopyTarget[]> {
  if (manageableSpaceIds.length === 0) return [];
  const placeholders = manageableSpaceIds.map(() => "?").join(", ");
  const result = await (await getDatabase()).execute({
    sql: `SELECT source_profiles.*, learning_spaces.id AS target_learning_space_id,
        learning_spaces.name AS target_learning_space_name,
        learning_spaces.short_label AS target_learning_space_short_label
      FROM learning_space_source_profiles
      JOIN learning_spaces ON learning_spaces.id = learning_space_source_profiles.learning_space_id
      JOIN source_profiles ON source_profiles.id = learning_space_source_profiles.source_profile_id
      WHERE learning_spaces.id IN (${placeholders})
      ORDER BY learning_spaces.sort_order, learning_spaces.name`,
    args: manageableSpaceIds,
  });
  return result.rows.flatMap((row) => {
    const profile = trySourceProfileFromRow(row);
    return profile ? [{
      learningSpaceId: String(row.target_learning_space_id),
      learningSpaceName: String(row.target_learning_space_name),
      learningSpaceShortLabel: String(row.target_learning_space_short_label),
      profile,
      canConfigure: configurableIds.has(String(row.target_learning_space_id)),
    }] : [];
  });
}

function copyName(sourceName: string): string {
  const prefix = "Kopie van ";
  return `${prefix}${sourceName}`.slice(0, 80).trim();
}
