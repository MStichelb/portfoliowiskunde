import { randomUUID } from "node:crypto";

import { requireSourceProfileTemplateManagement } from "@/lib/authorization";
import type { DatabaseRow, InStatement } from "@/lib/database";
import { getDatabase } from "@/lib/database";
import type { AppUser } from "@/lib/identity";
import {
  BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG_JSON,
  INITIAL_SOURCE_PROFILE_TEMPLATE_DESCRIPTION,
  INITIAL_SOURCE_PROFILE_TEMPLATE_ID,
  INITIAL_SOURCE_PROFILE_TEMPLATE_NAME,
  INITIAL_SOURCE_PROFILE_TEMPLATE_TIMESTAMP,
  parseStoredSourceProfileConfig,
  type SourceProfileConfig,
} from "@/lib/source-profile-config";
import type { SourceProfile } from "@/lib/source-profiles";

export interface SourceProfileTemplate {
  id: string;
  name: string;
  description: string | null;
  config: SourceProfileConfig;
  createdAt: string;
  updatedAt: string;
}

export interface PreparedSourceProfileTemplateClone {
  profile: SourceProfile;
  statements: InStatement[];
}

export async function ensureInitialSourceProfileTemplate(): Promise<void> {
  await (await getDatabase()).batch(initialSourceProfileTemplateBootstrapStatements());
}

export async function getDefaultSourceProfileTemplate(): Promise<SourceProfileTemplate> {
  const result = await (await getDatabase()).execute(`SELECT source_profile_templates.*
    FROM source_profile_template_defaults
    JOIN source_profile_templates ON source_profile_templates.id = source_profile_template_defaults.default_template_id
    WHERE source_profile_template_defaults.singleton_id = 1`);
  if (!result.rows[0]) throw new Error("Er is geen geldig standaard-bronprofielsjabloon ingesteld.");
  return sourceProfileTemplateFromRow(result.rows[0]);
}

export function getSourceProfileTemplateConfig(template: SourceProfileTemplate): SourceProfileConfig {
  return template.config;
}

export async function setDefaultSourceProfileTemplate(user: AppUser, templateId: string): Promise<void> {
  requireSourceProfileTemplateManagement(user);
  const template = await getSourceProfileTemplate(templateId);
  getSourceProfileTemplateConfig(template);
  await (await getDatabase()).execute({
    sql: `INSERT INTO source_profile_template_defaults (singleton_id, default_template_id, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(singleton_id) DO UPDATE SET default_template_id = excluded.default_template_id, updated_at = excluded.updated_at`,
    args: [template.id, new Date().toISOString()],
  });
}

export async function cloneSourceProfileTemplateToLearningSpace(
  template: SourceProfileTemplate,
  learningSpaceId: string,
): Promise<SourceProfile> {
  const prepared = prepareSourceProfileTemplateClone(template, learningSpaceId);
  await (await getDatabase()).batch(prepared.statements);
  return prepared.profile;
}

export function prepareSourceProfileTemplateClone(
  template: SourceProfileTemplate,
  learningSpaceId: string,
  now = new Date().toISOString(),
): PreparedSourceProfileTemplateClone {
  const configJson = JSON.stringify(getSourceProfileTemplateConfig(template));
  const config = parseStoredSourceProfileConfig(template.config.configVersion, configJson);
  const profile: SourceProfile = {
    id: `source-profile-${randomUUID()}`,
    type: "custom",
    name: template.name,
    description: template.description,
    config,
    managementLearningSpaceId: learningSpaceId,
    createdAt: now,
    updatedAt: now,
  };
  return {
    profile,
    statements: [
      {
        sql: `INSERT INTO source_profiles
          (id, type, name, description, config_version, config_json, created_at, updated_at, management_learning_space_id)
          VALUES (?, 'custom', ?, ?, ?, ?, ?, ?, ?)`,
        args: [profile.id, profile.name, profile.description, config.configVersion, JSON.stringify(config), now, now, learningSpaceId],
      },
      {
        sql: `INSERT INTO learning_space_source_profiles (learning_space_id, source_profile_id, assigned_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(learning_space_id) DO UPDATE SET source_profile_id = excluded.source_profile_id, updated_at = excluded.updated_at`,
        args: [learningSpaceId, profile.id, now, now],
      },
    ],
  };
}

export function initialSourceProfileTemplateBootstrapStatements(): InStatement[] {
  return [
    {
      sql: `INSERT INTO source_profile_templates
        (id, name, description, config_version, config_json, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`,
      args: [INITIAL_SOURCE_PROFILE_TEMPLATE_ID, INITIAL_SOURCE_PROFILE_TEMPLATE_NAME, INITIAL_SOURCE_PROFILE_TEMPLATE_DESCRIPTION,
        BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG_JSON, INITIAL_SOURCE_PROFILE_TEMPLATE_TIMESTAMP, INITIAL_SOURCE_PROFILE_TEMPLATE_TIMESTAMP],
    },
    {
      sql: `INSERT INTO source_profile_template_defaults (singleton_id, default_template_id, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(singleton_id) DO NOTHING`,
      args: [INITIAL_SOURCE_PROFILE_TEMPLATE_ID, INITIAL_SOURCE_PROFILE_TEMPLATE_TIMESTAMP],
    },
  ];
}

function sourceProfileTemplateFromRow(row: DatabaseRow): SourceProfileTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    config: parseStoredSourceProfileConfig(Number(row.config_version), String(row.config_json)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function getSourceProfileTemplate(templateId: string): Promise<SourceProfileTemplate> {
  const result = await (await getDatabase()).execute({ sql: "SELECT * FROM source_profile_templates WHERE id = ?", args: [templateId] });
  if (!result.rows[0]) throw new Error("Bronprofielsjabloon niet gevonden.");
  return sourceProfileTemplateFromRow(result.rows[0]);
}
