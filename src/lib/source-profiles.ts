import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { AuthorizationError, canManageLearningSpace, getManageableLearningSpaceIds, requireLearningSpaceManagement } from "@/lib/authorization";
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
}

export interface SourceProfileCopySource {
  learningSpaceId: string;
  learningSpaceName: string;
  learningSpaceShortLabel: string;
  profile: SourceProfile;
}

export interface SourceProfileAdminModel {
  activeProfile: SourceProfile;
  availableProfiles: AvailableSourceProfile[];
  copySources: SourceProfileCopySource[];
}

export const sourceProfileNameSchema = z.string().trim().min(1, "Geef het bronprofiel een naam.").max(80, "Een profielnaam mag maximaal 80 tekens bevatten.");

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
  const manageableSpaceIds = await getManageableLearningSpaceIds(user);
  if (!manageableSpaceIds.includes(learningSpaceId)) manageableSpaceIds.push(learningSpaceId);
  const database = await getDatabase();
  const placeholders = manageableSpaceIds.map(() => "?").join(", ");
  const [activeResult, availableResult, copyResult] = await Promise.all([
    database.execute({
      sql: `SELECT source_profiles.* FROM learning_space_source_profiles
        JOIN source_profiles ON source_profiles.id = learning_space_source_profiles.source_profile_id
        WHERE learning_space_source_profiles.learning_space_id = ?`,
      args: [learningSpaceId],
    }),
    database.execute({
      sql: `SELECT source_profiles.*, learning_spaces.name AS management_learning_space_name,
          learning_spaces.short_label AS management_learning_space_short_label
        FROM source_profiles
        LEFT JOIN learning_spaces ON learning_spaces.id = source_profiles.management_learning_space_id
        WHERE source_profiles.type = 'built_in'
          OR source_profiles.management_learning_space_id IN (${placeholders})
        ORDER BY source_profiles.type, source_profiles.name, learning_spaces.name`,
      args: manageableSpaceIds,
    }),
    database.execute({
      sql: `SELECT source_profiles.*, learning_spaces.id AS source_learning_space_id,
          learning_spaces.name AS source_learning_space_name,
          learning_spaces.short_label AS source_learning_space_short_label
        FROM learning_space_source_profiles
        JOIN learning_spaces ON learning_spaces.id = learning_space_source_profiles.learning_space_id
        JOIN source_profiles ON source_profiles.id = learning_space_source_profiles.source_profile_id
        WHERE learning_spaces.id IN (${placeholders}) AND learning_spaces.id <> ?
        ORDER BY learning_spaces.sort_order, learning_spaces.name`,
      args: [...manageableSpaceIds, learningSpaceId],
    }),
  ]);
  const activeProfile = activeResult.rows[0] ? sourceProfileFromRow(activeResult.rows[0]) : null;
  if (!activeProfile) throw new Error("Deze leeromgeving heeft geen actief bronprofiel.");
  return {
    activeProfile,
    availableProfiles: availableResult.rows.flatMap((row) => {
      const profile = trySourceProfileFromRow(row);
      return profile ? [{
        ...profile,
        managementLearningSpaceName: row.management_learning_space_name == null ? null : String(row.management_learning_space_name),
        managementLearningSpaceShortLabel: row.management_learning_space_short_label == null ? null : String(row.management_learning_space_short_label),
      }] : [];
    }),
    copySources: copyResult.rows.flatMap((row) => {
      const profile = trySourceProfileFromRow(row);
      return profile ? [{
        learningSpaceId: String(row.source_learning_space_id),
        learningSpaceName: String(row.source_learning_space_name),
        learningSpaceShortLabel: String(row.source_learning_space_short_label),
        profile,
      }] : [];
    }),
  };
}

export async function switchActiveSourceProfile(user: AppUser, learningSpaceId: string, sourceProfileId: string): Promise<void> {
  await requireLearningSpaceManagement(user, learningSpaceId);
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
  await requireLearningSpaceManagement(user, learningSpaceId);
  const active = await getActiveSourceProfileForLearningSpace(learningSpaceId);
  if (!active || active.type !== "built_in") throw new Error("Een eigen profiel kan hier alleen vanuit het ingebouwde profiel worden gemaakt.");
  return createIndependentCopy(active, learningSpaceId, "Eigen profiel");
}

export async function copyActiveSourceProfile(
  user: AppUser,
  targetLearningSpaceId: string,
  sourceLearningSpaceId: string,
): Promise<SourceProfile> {
  await requireLearningSpaceManagement(user, targetLearningSpaceId);
  if (sourceLearningSpaceId === targetLearningSpaceId) throw new Error("Kies een andere leeromgeving als bron.");
  await requireLearningSpaceManagement(user, sourceLearningSpaceId);
  const source = await getActiveSourceProfileForLearningSpace(sourceLearningSpaceId);
  if (!source) throw new Error("Het bronprofiel van de gekozen leeromgeving bestaat niet.");
  return createIndependentCopy(source, targetLearningSpaceId, copyName(source.name));
}

export async function renameSourceProfile(
  user: AppUser,
  learningSpaceId: string,
  sourceProfileId: string,
  name: string,
): Promise<void> {
  await requireLearningSpaceManagement(user, learningSpaceId);
  const profile = await requireAllowedSourceProfile(user, sourceProfileId);
  if (profile.type !== "custom") throw new Error("Het ingebouwde bronprofiel kan niet worden hernoemd.");
  const assignment = await (await getDatabase()).execute({
    sql: "SELECT 1 FROM learning_space_source_profiles WHERE learning_space_id = ? AND source_profile_id = ?",
    args: [learningSpaceId, sourceProfileId],
  });
  if (!assignment.rows[0]) throw new AuthorizationError("Dit bronprofiel is niet actief voor deze leeromgeving.");
  const validName = validSourceProfileName(name);
  await (await getDatabase()).execute({
    sql: "UPDATE source_profiles SET name = ?, updated_at = ? WHERE id = ? AND type = 'custom'",
    args: [validName, new Date().toISOString(), sourceProfileId],
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
    {
      sql: `INSERT INTO learning_space_source_profiles
        (learning_space_id, source_profile_id, assigned_at, updated_at)
        SELECT id, ?, ?, ? FROM learning_spaces WHERE TRUE
        ON CONFLICT(learning_space_id) DO NOTHING`,
      args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID, BUILT_IN_DEFAULT_SOURCE_PROFILE_TIMESTAMP, BUILT_IN_DEFAULT_SOURCE_PROFILE_TIMESTAMP],
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
  const result = await (await getDatabase()).execute({ sql: "SELECT * FROM source_profiles WHERE id = ?", args: [sourceProfileId] });
  if (!result.rows[0]) throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  const profile = sourceProfileFromRow(result.rows[0]);
  if (profile.type === "built_in") return profile;
  if (!profile.managementLearningSpaceId || !await canManageLearningSpace(user, profile.managementLearningSpaceId)) {
    throw new AuthorizationError("Bronprofiel niet beschikbaar.");
  }
  return profile;
}

function trySourceProfileFromRow(row: DatabaseRow): SourceProfile | null {
  try {
    return sourceProfileFromRow(row);
  } catch {
    return null;
  }
}

async function createIndependentCopy(source: SourceProfile, learningSpaceId: string, requestedName: string): Promise<SourceProfile> {
  const config = getSourceProfileConfig(source);
  const configJson = JSON.stringify(config);
  // Round-trip validation makes the snapshot boundary explicit and rejects unsupported versions.
  const validatedConfig = parseStoredSourceProfileConfig(config.configVersion, configJson);
  const id = `source-profile-${randomUUID()}`;
  const now = new Date().toISOString();
  const name = validSourceProfileName(requestedName);
  await (await getDatabase()).batch([
    {
      sql: `INSERT INTO source_profiles
        (id, type, name, description, config_version, config_json, created_at, updated_at, management_learning_space_id)
        VALUES (?, 'custom', ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, name, source.description, validatedConfig.configVersion, JSON.stringify(validatedConfig), now, now, learningSpaceId],
    },
    {
      sql: `INSERT INTO learning_space_source_profiles (learning_space_id, source_profile_id, assigned_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(learning_space_id) DO UPDATE SET source_profile_id = excluded.source_profile_id, updated_at = excluded.updated_at`,
      args: [learningSpaceId, id, now, now],
    },
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

function copyName(sourceName: string): string {
  const prefix = "Kopie van ";
  return `${prefix}${sourceName}`.slice(0, 80).trim();
}

function validSourceProfileName(value: string): string {
  const result = sourceProfileNameSchema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Ongeldige profielnaam.");
  return result.data;
}
