import { randomUUID } from "node:crypto";
import { z } from "zod";

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
import { uniqueSourceProfileName } from "@/lib/source-profile-name";
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

export interface SourceProfileTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  configVersion: number;
  isDefault: boolean;
}

export interface SourceProfileTemplateMetadataInput {
  name: string;
  description?: string | null;
}

const sourceProfileTemplateNameSchema = z.string().trim().min(1, "Geef het bronprofielsjabloon een naam.").max(80, "Een sjabloonnaam mag maximaal 80 tekens bevatten.");
const sourceProfileTemplateDescriptionSchema = z.string().trim().max(240, "Een sjabloonbeschrijving mag maximaal 240 tekens bevatten.").optional().nullable();

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

export async function listSourceProfileTemplates(user: AppUser): Promise<SourceProfileTemplateSummary[]> {
  requireSourceProfileTemplateManagement(user);
  const result = await (await getDatabase()).execute(`SELECT source_profile_templates.id, source_profile_templates.name,
      source_profile_templates.description, source_profile_templates.config_version,
      CASE WHEN source_profile_template_defaults.default_template_id = source_profile_templates.id THEN 1 ELSE 0 END AS is_default
    FROM source_profile_templates
    LEFT JOIN source_profile_template_defaults ON source_profile_template_defaults.singleton_id = 1
    ORDER BY LOWER(source_profile_templates.name), source_profile_templates.id`);
  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    configVersion: Number(row.config_version),
    isDefault: Number(row.is_default) === 1,
  }));
}

export async function createSourceProfileTemplate(
  user: AppUser,
  input: SourceProfileTemplateMetadataInput & { sourceTemplateId?: string | null },
): Promise<SourceProfileTemplate> {
  requireSourceProfileTemplateManagement(user);
  const source = input.sourceTemplateId ? await getSourceProfileTemplate(input.sourceTemplateId) : await getDefaultSourceProfileTemplate();
  const metadata = await validatedUniqueTemplateMetadata(input);
  return insertIndependentTemplateSnapshot(source, metadata);
}

export async function updateSourceProfileTemplateMetadata(
  user: AppUser,
  templateId: string,
  input: SourceProfileTemplateMetadataInput,
): Promise<void> {
  requireSourceProfileTemplateManagement(user);
  await getSourceProfileTemplate(templateId);
  const metadata = await validatedUniqueTemplateMetadata(input, templateId);
  await (await getDatabase()).execute({
    sql: "UPDATE source_profile_templates SET name = ?, description = ?, updated_at = ? WHERE id = ?",
    args: [metadata.name, metadata.description, new Date().toISOString(), templateId],
  });
}

export async function duplicateSourceProfileTemplate(user: AppUser, templateId: string): Promise<SourceProfileTemplate> {
  requireSourceProfileTemplateManagement(user);
  const source = await getSourceProfileTemplate(templateId);
  const name = await availableTemplateCopyName(source.name);
  return insertIndependentTemplateSnapshot(source, { name, description: source.description });
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
  await uniqueSourceProfileName(learningSpaceId, template.name);
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

async function insertIndependentTemplateSnapshot(
  source: SourceProfileTemplate,
  metadata: { name: string; description: string | null },
): Promise<SourceProfileTemplate> {
  const configJson = JSON.stringify(getSourceProfileTemplateConfig(source));
  const config = parseStoredSourceProfileConfig(source.config.configVersion, configJson);
  const id = `source-profile-template-${randomUUID()}`;
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: `INSERT INTO source_profile_templates
      (id, name, description, config_version, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, metadata.name, metadata.description, config.configVersion, JSON.stringify(config), now, now],
  });
  return { id, name: metadata.name, description: metadata.description, config, createdAt: now, updatedAt: now };
}

async function validatedUniqueTemplateMetadata(
  input: SourceProfileTemplateMetadataInput,
  excludeTemplateId?: string,
): Promise<{ name: string; description: string | null }> {
  const parsedName = sourceProfileTemplateNameSchema.safeParse(input.name);
  if (!parsedName.success) throw new Error(parsedName.error.issues[0]?.message ?? "Ongeldige sjabloonnaam.");
  const parsedDescription = sourceProfileTemplateDescriptionSchema.safeParse(input.description);
  if (!parsedDescription.success) throw new Error(parsedDescription.error.issues[0]?.message ?? "Ongeldige sjabloonbeschrijving.");
  const duplicate = await (await getDatabase()).execute({
    sql: `SELECT 1 FROM source_profile_templates
      WHERE LOWER(TRIM(name)) = LOWER(?) AND (? IS NULL OR id <> ?) LIMIT 1`,
    args: [parsedName.data, excludeTemplateId ?? null, excludeTemplateId ?? null],
  });
  if (duplicate.rows[0]) throw new Error("Er bestaat al een appbreed bronprofielsjabloon met deze naam.");
  return { name: parsedName.data, description: parsedDescription.data || null };
}

async function availableTemplateCopyName(sourceName: string): Promise<string> {
  const prefix = "Kopie van ";
  const names = (await (await getDatabase()).execute("SELECT name FROM source_profile_templates")).rows
    .map((row) => String(row.name).trim().toLocaleLowerCase("nl"));
  for (let number = 1; number <= names.length + 1; number += 1) {
    const suffix = number === 1 ? "" : ` (${number})`;
    const name = `${prefix}${sourceName}`.slice(0, 80 - suffix.length).trimEnd() + suffix;
    if (!names.includes(name.toLocaleLowerCase("nl"))) return name;
  }
  throw new Error("Er kon geen unieke naam voor de sjabloonkopie worden gemaakt.");
}
