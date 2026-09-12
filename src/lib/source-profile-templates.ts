import { randomUUID } from "node:crypto";
import { z } from "zod";

import { AuthorizationError, canAccessAdmin, requireLearningSpaceConfiguration, requireSourceProfileTemplateManagement } from "@/lib/authorization";
import type { DatabaseRow, InStatement } from "@/lib/database";
import { getDatabase } from "@/lib/database";
import type { AppUser } from "@/lib/identity";
import {
  BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG_JSON,
  INITIAL_SOURCE_PROFILE_TEMPLATE_DESCRIPTION,
  INITIAL_SOURCE_PROFILE_TEMPLATE_ID,
  INITIAL_SOURCE_PROFILE_TEMPLATE_NAME,
  INITIAL_SOURCE_PROFILE_TEMPLATE_TIMESTAMP,
  globalResourceListSchema,
  parseSourceProfileConfig,
  parseStoredSourceProfileConfig,
  type GlobalResourceConfig,
  type SourceProfileConfig,
} from "@/lib/source-profile-config";
import { availableSourceProfileName, uniqueSourceProfileName } from "@/lib/source-profile-name";
import type { SourceProfile } from "@/lib/source-profiles";

export interface SourceProfileTemplate {
  id: string;
  name: string;
  description: string | null;
  config: SourceProfileConfig;
  archivedAt: string | null;
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
  config?: SourceProfileConfig;
  isDefault: boolean;
  archivedAt: string | null;
  isArchived: boolean;
  canArchive: boolean;
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
    WHERE source_profile_template_defaults.singleton_id = 1 AND source_profile_templates.archived_at IS NULL`);
  if (!result.rows[0]) throw new Error("Er is geen geldig standaard-bronprofielsjabloon ingesteld.");
  return sourceProfileTemplateFromRow(result.rows[0]);
}

export function getSourceProfileTemplateConfig(template: SourceProfileTemplate): SourceProfileConfig {
  return template.config;
}

export async function listSourceProfileTemplates(user: AppUser, options: { archivedOnly?: boolean; includeConfig?: boolean } = {}): Promise<SourceProfileTemplateSummary[]> {
  if (!canAccessAdmin(user)) throw new AuthorizationError("Bronprofielsjablonen zijn alleen beschikbaar voor actieve beheerders.");
  const archivedOnly = user.role === "superadmin" && options.archivedOnly === true;
  const includeConfig = options.includeConfig === true;
  const result = await (await getDatabase()).execute(`SELECT source_profile_templates.id, source_profile_templates.name,
      source_profile_templates.description, source_profile_templates.config_version${includeConfig ? ", source_profile_templates.config_json" : ""}, source_profile_templates.archived_at,
      CASE WHEN source_profile_template_defaults.default_template_id = source_profile_templates.id THEN 1 ELSE 0 END AS is_default
    FROM source_profile_templates
    LEFT JOIN source_profile_template_defaults ON source_profile_template_defaults.singleton_id = 1
    WHERE source_profile_templates.archived_at ${archivedOnly ? "IS NOT NULL" : "IS NULL"}
    ORDER BY is_default DESC, LOWER(source_profile_templates.name), source_profile_templates.id`);
  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    configVersion: Number(row.config_version),
    ...(includeConfig ? { config: parseStoredSourceProfileConfig(Number(row.config_version), String(row.config_json)) } : {}),
    isDefault: Number(row.is_default) === 1,
    archivedAt: row.archived_at == null ? null : String(row.archived_at),
    isArchived: row.archived_at != null,
    canArchive: user.role === "superadmin" && Number(row.is_default) !== 1 && row.archived_at == null,
  }));
}

export async function copySourceProfileTemplateToLearningSpace(
  user: AppUser,
  templateId: string,
  learningSpaceId: string,
): Promise<SourceProfile> {
  await requireLearningSpaceConfiguration(user, learningSpaceId);
  const template = await getSourceProfileTemplate(templateId);
  const name = await availableSourceProfileName(user.id, template.name);
  const prepared = prepareSourceProfileTemplateClone({ ...template, name }, learningSpaceId, user.id);
  await (await getDatabase()).batch(prepared.statements);
  return prepared.profile;
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

export async function updateSourceProfileTemplateGlobalResources(
  user: AppUser,
  templateId: string,
  resources: unknown,
): Promise<void> {
  requireSourceProfileTemplateManagement(user);
  const template = await getSourceProfileTemplate(templateId);
  const globalResources: GlobalResourceConfig[] = globalResourceListSchema.parse(resources);
  const config = parseSourceProfileConfig({ ...template.config, globalResources });
  await (await getDatabase()).execute({
    sql: "UPDATE source_profile_templates SET config_version = ?, config_json = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL",
    args: [config.configVersion, JSON.stringify(config), new Date().toISOString(), template.id],
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

export async function archiveSourceProfileTemplate(user: AppUser, templateId: string): Promise<void> {
  requireSourceProfileTemplateManagement(user);
  const template = await getLifecycleSourceProfileTemplate(templateId);
  if (template.archivedAt) throw new Error("Dit bronprofielsjabloon is al gearchiveerd.");
  if (await isDefaultSourceProfileTemplate(template.id)) throw new Error("Het huidige standaardsjabloon kan niet worden gearchiveerd.");
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: `UPDATE source_profile_templates SET archived_at = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM source_profile_template_defaults WHERE default_template_id = source_profile_templates.id)`,
    args: [now, now, template.id],
  });
}

export async function restoreSourceProfileTemplate(user: AppUser, templateId: string): Promise<void> {
  requireSourceProfileTemplateManagement(user);
  const template = await getLifecycleSourceProfileTemplate(templateId);
  if (!template.archivedAt) throw new Error("Alleen een gearchiveerd bronprofielsjabloon kan worden hersteld.");
  await validatedUniqueTemplateMetadata({ name: template.name, description: template.description }, template.id);
  await (await getDatabase()).execute({
    sql: "UPDATE source_profile_templates SET archived_at = NULL, updated_at = ? WHERE id = ? AND archived_at IS NOT NULL",
    args: [new Date().toISOString(), template.id],
  });
}

export async function permanentlyDeleteSourceProfileTemplate(user: AppUser, templateId: string): Promise<void> {
  requireSourceProfileTemplateManagement(user);
  const template = await getLifecycleSourceProfileTemplate(templateId);
  if (!template.archivedAt) throw new Error("Alleen een gearchiveerd bronprofielsjabloon kan permanent worden verwijderd.");
  if (await isDefaultSourceProfileTemplate(template.id)) throw new Error("Het huidige standaardsjabloon kan niet permanent worden verwijderd.");
  await (await getDatabase()).execute({
    sql: `DELETE FROM source_profile_templates WHERE id = ? AND archived_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM source_profile_template_defaults WHERE default_template_id = source_profile_templates.id)`,
    args: [template.id],
  });
}

export async function cloneSourceProfileTemplateToLearningSpace(
  template: SourceProfileTemplate,
  learningSpaceId: string,
  ownerUserId: string,
): Promise<SourceProfile> {
  await uniqueSourceProfileName(ownerUserId, template.name);
  const prepared = prepareSourceProfileTemplateClone(template, learningSpaceId, ownerUserId);
  await (await getDatabase()).batch(prepared.statements);
  return prepared.profile;
}

export function prepareSourceProfileTemplateClone(
  template: SourceProfileTemplate,
  learningSpaceId: string,
  ownerUserId: string,
  now = new Date().toISOString(),
  activate = true,
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
    ownerUserId,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  return {
    profile,
    statements: [
      {
        sql: `INSERT INTO source_profiles
          (id, type, name, description, config_version, config_json, created_at, updated_at, management_learning_space_id, owner_user_id)
          VALUES (?, 'custom', ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [profile.id, profile.name, profile.description, config.configVersion, JSON.stringify(config), now, now, learningSpaceId, ownerUserId],
      },
      ...(activate ? [{
        sql: `INSERT INTO learning_space_source_profiles (learning_space_id, source_profile_id, assigned_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(learning_space_id) DO UPDATE SET source_profile_id = excluded.source_profile_id, updated_at = excluded.updated_at`,
        args: [learningSpaceId, profile.id, now, now],
      }] : []),
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
    archivedAt: row.archived_at == null ? null : String(row.archived_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function getSourceProfileTemplate(templateId: string): Promise<SourceProfileTemplate> {
  const result = await (await getDatabase()).execute({ sql: "SELECT * FROM source_profile_templates WHERE id = ? AND archived_at IS NULL", args: [templateId] });
  if (!result.rows[0]) throw new Error("Bronprofielsjabloon niet gevonden.");
  return sourceProfileTemplateFromRow(result.rows[0]);
}

async function getLifecycleSourceProfileTemplate(templateId: string): Promise<SourceProfileTemplate> {
  const result = await (await getDatabase()).execute({ sql: "SELECT * FROM source_profile_templates WHERE id = ?", args: [templateId] });
  if (!result.rows[0]) throw new Error("Bronprofielsjabloon niet gevonden.");
  return sourceProfileTemplateFromRow(result.rows[0]);
}

async function isDefaultSourceProfileTemplate(templateId: string): Promise<boolean> {
  const result = await (await getDatabase()).execute({
    sql: "SELECT 1 FROM source_profile_template_defaults WHERE singleton_id = 1 AND default_template_id = ?",
    args: [templateId],
  });
  return Boolean(result.rows[0]);
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
  return { id, name: metadata.name, description: metadata.description, config, archivedAt: null, createdAt: now, updatedAt: now };
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
