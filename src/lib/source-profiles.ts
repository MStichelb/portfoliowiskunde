import "server-only";

import type { DatabaseRow, InStatement } from "@/lib/database";
import { getDatabase } from "@/lib/database";
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
  createdAt: string;
  updatedAt: string;
}

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
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
