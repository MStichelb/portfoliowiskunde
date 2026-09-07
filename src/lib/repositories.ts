import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_LOCAL_SOURCE_PATH } from "@/lib/app-config";
import type { DatabaseRow, InStatement } from "@/lib/database";
import { executeBatch, getDatabase } from "@/lib/database";
import type { IndexedPortfolio } from "@/lib/domain";
import { canPermanentlyDeleteLearningSpace } from "@/lib/learning-space-lifecycle";
import { comparePortfolioIds, comparePortfolioRelativePaths, portfolioCodeFromRelativePath } from "@/lib/parser";
import type { PortfolioCustomTextPosition } from "@/lib/portfolio-custom-message";
import type { SourceManifestEntry } from "@/lib/source-comparison";
import { DEFAULT_LEARNING_SPACE_COLOR, DEFAULT_LEARNING_SPACE_DESCRIPTION } from "@/lib/ui-colors";
import {
  resolveChildPublication,
  resolvePortfolioPublication,
  type ChildVisibilityMode,
  type EffectivePublication,
  type PortfolioVisibilityMode,
} from "@/lib/publication";

export interface AdminAsset {
  id: string;
  fileName: string;
  extension: string;
  step: number;
  variant: "standard" | "alternative";
  isIndexed: boolean;
  lastModifiedAt: string | null;
}

export interface AdminExercise {
  id: string;
  code: string;
  visible: boolean;
  visibilityMode: ChildVisibilityMode;
  publishFrom: string | null;
  publishUntil: string | null;
  effectiveStatus: EffectivePublication;
  effectivePublished: boolean;
  isIndexed: boolean;
  showAlternativeToStudents: boolean;
  standardAssets: number;
  alternativeAssets: number;
  missingAssets: number;
  assets: AdminAsset[];
}

export interface AdminSection {
  id: string;
  order: number;
  title: string;
  visibilityMode: ChildVisibilityMode;
  publishFrom: string | null;
  publishUntil: string | null;
  limited: boolean;
  effectiveStatus: EffectivePublication;
  effectivePublished: boolean;
  isIndexed: boolean;
  exercises: AdminExercise[];
}

export interface AdminPortfolio {
  id: string;
  code: string;
  title: string;
  detectedTitle: string;
  visible: boolean;
  publishFrom: string | null;
  publishUntil: string | null;
  limited: boolean;
  effectiveStatus: EffectivePublication;
  effectivePublished: boolean;
  isIndexed: boolean;
  assignmentPdfPath: string | null;
  hintsDocumentPath: string | null;
  finalSolutionsPdfPath: string | null;
  learningSpaceId: string;
  themeId: string | null;
  themeName: string | null;
  cardColor: string;
  customText: string | null;
  customTextPosition: PortfolioCustomTextPosition;
  sections: AdminSection[];
}

export interface StudentPortfolio {
  id: string;
  code: string;
  title: string;
  themeId: string | null;
  themeName: string | null;
  cardColor: string;
  customText: string | null;
  customTextPosition: PortfolioCustomTextPosition;
  hintsDocumentPath: string | null;
  sections: Array<{
    id: string;
    title: string;
    order: number;
    exercises: Array<{ id: string; code: string; visible: boolean }>;
  }>;
}

export interface LocalStorageSettings {
  sourcePath: string;
  sourcePathOrigin: "database" | "environment" | "default";
}

export interface SyncSummary {
  startedAt: string;
  finishedAt: string | null;
  portfolioCount: number;
  warningCount: number;
  status: string;
  providerType: string | null;
  addedCount: number;
  updatedCount: number;
  missingCount: number;
  failureMessage: string | null;
}

export interface LearningSpace {
  id: string;
  name: string;
  slug: string;
  shortLabel: string;
  description: string;
  cardColor: string;
  sortOrder: number;
  isActive: boolean;
  archivedAt: string | null;
  editorsCanManageAccess: boolean;
  sourceType: StorageSourceType;
  localSourcePath: string | null;
  oneDriveDriveId: string | null;
  oneDriveFolderId: string | null;
  oneDriveFolderPath: string | null;
  googleDriveFolderId: string | null;
  googleDriveFolderLabel: string | null;
  sources: LearningSpaceSource[];
  activeSourceId: string | null;
  primarySource: LearningSpaceSource | null;
  mirrorSource: LearningSpaceSource | null;
}

export type StorageSourceType = "local" | "onedrive" | "google_drive";
export type LearningSpaceSourceRole = "primary" | "mirror";

export interface LearningSpaceSource {
  id: string;
  learningSpaceId: string;
  role: LearningSpaceSourceRole;
  providerType: StorageSourceType;
  storageConnectionId: string | null;
  isActive: boolean;
  localSourcePath: string | null;
  oneDriveDriveId: string | null;
  oneDriveFolderId: string | null;
  oneDriveFolderPath: string | null;
  googleDriveFolderId: string | null;
  googleDriveFolderLabel: string | null;
  lastValidatedAt: string | null;
  lastValidationStatus: "valid" | "invalid" | null;
  lastValidationMessage: string | null;
  mirrorCompletedAt: string | null;
}

export interface LearningSpaceSourceInput {
  providerType: StorageSourceType;
  storageConnectionId?: string | null;
  localSourcePath?: string | null;
  oneDriveDriveId?: string | null;
  oneDriveFolderId?: string | null;
  oneDriveFolderPath?: string | null;
  googleDriveFolderId?: string | null;
  googleDriveFolderLabel?: string | null;
}

export interface LearningSpaceInput {
  name: string;
  slug: string;
  shortLabel: string;
  description?: string;
  cardColor?: string;
  sortOrder: number;
  sourceType: StorageSourceType;
  storageConnectionId?: string | null;
  localSourcePath?: string | null;
  oneDriveDriveId?: string | null;
  oneDriveFolderId?: string | null;
  oneDriveFolderPath?: string | null;
  googleDriveFolderId?: string | null;
  googleDriveFolderLabel?: string | null;
  primarySource?: LearningSpaceSourceInput;
  mirrorSource?: LearningSpaceSourceInput | null;
}

export interface Theme {
  id: string;
  learningSpaceId: string;
  name: string;
  sortOrder: number;
}

const bool = (value: unknown) => value === true || Number(value) === 1;
const text = (row: DatabaseRow, field: string) => String(row[field] ?? "");
const nullableText = (row: DatabaseRow, field: string): string | null => {
  const value = row[field];
  return typeof value === "string" && value ? value : null;
};

function childMode(row: DatabaseRow): ChildVisibilityMode {
  const value = text(row, "visibility_mode");
  return value === "hidden" ? "hidden" : "visible";
}

function stableId(prefix: string, ...parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("\u0000")).digest("base64url").slice(0, 30);
  return `${prefix}-${hash}`;
}

function learningSpaceSourceFromRow(row: DatabaseRow): LearningSpaceSource {
  const validationStatus = nullableText(row, "last_validation_status");
  return {
    id: text(row, "id"), learningSpaceId: text(row, "learning_space_id"),
    role: text(row, "role") === "mirror" ? "mirror" : "primary",
    providerType: storageSourceType(text(row, "provider_type")), storageConnectionId: nullableText(row, "storage_connection_id"), isActive: bool(row.is_active),
    localSourcePath: nullableText(row, "local_source_path"), oneDriveDriveId: nullableText(row, "onedrive_drive_id"),
    oneDriveFolderId: nullableText(row, "onedrive_folder_id"), oneDriveFolderPath: nullableText(row, "onedrive_folder_path"),
    googleDriveFolderId: nullableText(row, "google_drive_folder_id"), googleDriveFolderLabel: nullableText(row, "google_drive_folder_label"),
    lastValidatedAt: nullableText(row, "last_validated_at"),
    lastValidationStatus: validationStatus === "valid" || validationStatus === "invalid" ? validationStatus : null,
    lastValidationMessage: nullableText(row, "last_validation_message"), mirrorCompletedAt: nullableText(row, "mirror_completed_at"),
  };
}

function learningSpaceFromRow(row: DatabaseRow, sources: LearningSpaceSource[]): LearningSpace {
  const activeSource = sources.find((source) => source.isActive) ?? null;
  const primarySource = sources.find((source) => source.role === "primary") ?? null;
  const mirrorSource = sources.find((source) => source.role === "mirror") ?? null;
  const sourceType = activeSource?.providerType ?? storageSourceType(nullableText(row, "source_type") ?? text(row, "storage_provider"));
  const providerSource = (provider: StorageSourceType) => sources.find((source) => source.providerType === provider) ?? null;
  const localSource = providerSource("local");
  const oneDriveSource = providerSource("onedrive");
  const googleDriveSource = providerSource("google_drive");
  const archivedAt = nullableText(row, "archived_at");
  return {
    id: text(row, "id"), name: text(row, "name"), slug: text(row, "slug"), shortLabel: text(row, "short_label"),
    description: text(row, "description"), cardColor: text(row, "card_color"),
    sortOrder: Number(row.sort_order), isActive: bool(row.is_active) && archivedAt === null, archivedAt,
    editorsCanManageAccess: bool(row.editors_can_manage_access), sourceType,
    localSourcePath: localSource?.localSourcePath ?? nullableText(row, "local_source_path"),
    oneDriveDriveId: oneDriveSource?.oneDriveDriveId ?? nullableText(row, "onedrive_drive_id"),
    oneDriveFolderId: oneDriveSource?.oneDriveFolderId ?? nullableText(row, "onedrive_folder_id"),
    oneDriveFolderPath: oneDriveSource?.oneDriveFolderPath ?? nullableText(row, "onedrive_folder_path"),
    googleDriveFolderId: googleDriveSource?.googleDriveFolderId ?? nullableText(row, "google_drive_folder_id"),
    googleDriveFolderLabel: googleDriveSource?.googleDriveFolderLabel ?? nullableText(row, "google_drive_folder_label"),
    sources, activeSourceId: activeSource?.id ?? null, primarySource, mirrorSource,
  };
}

function storageSourceType(value: string): StorageSourceType {
  if (value === "onedrive" || value === "google_drive") return value;
  return "local";
}

export async function getLearningSpaces(activeOnly = false): Promise<LearningSpace[]> {
  const database = await getDatabase();
  const result = await database.execute(`SELECT * FROM learning_spaces${activeOnly ? " WHERE is_active = 1 AND archived_at IS NULL" : ""} ORDER BY sort_order, name`);
  return hydrateLearningSpaces(result.rows);
}

export async function getLearningSpaceBySlug(slug: string): Promise<LearningSpace | null> {
  const database = await getDatabase();
  const result = await database.execute({ sql: "SELECT * FROM learning_spaces WHERE slug = ? AND is_active = 1 AND archived_at IS NULL", args: [slug] });
  return (await hydrateLearningSpaces(result.rows))[0] ?? null;
}

export async function getAdminLearningSpaceBySlug(slug: string): Promise<LearningSpace | null> {
  const database = await getDatabase();
  const result = await database.execute({ sql: "SELECT * FROM learning_spaces WHERE slug = ?", args: [slug] });
  return (await hydrateLearningSpaces(result.rows))[0] ?? null;
}

export async function getLearningSpace(id: string): Promise<LearningSpace | null> {
  const database = await getDatabase();
  const result = await database.execute({ sql: "SELECT * FROM learning_spaces WHERE id = ?", args: [id] });
  return (await hydrateLearningSpaces(result.rows))[0] ?? null;
}

async function hydrateLearningSpaces(rows: DatabaseRow[]): Promise<LearningSpace[]> {
  if (rows.length === 0) return [];
  const sourceRows = await (await getDatabase()).execute("SELECT * FROM learning_space_sources ORDER BY learning_space_id, role");
  const sourcesBySpace = new Map<string, LearningSpaceSource[]>();
  for (const row of sourceRows.rows) {
    const source = learningSpaceSourceFromRow(row);
    const sources = sourcesBySpace.get(source.learningSpaceId) ?? [];
    sources.push(source);
    sourcesBySpace.set(source.learningSpaceId, sources);
  }
  return rows.map((row) => learningSpaceFromRow(row, sourcesBySpace.get(text(row, "id")) ?? []));
}

export async function getLearningSpaceSource(id: string): Promise<LearningSpaceSource | null> {
  const result = await (await getDatabase()).execute({ sql: "SELECT * FROM learning_space_sources WHERE id = ?", args: [id] });
  return result.rows[0] ? learningSpaceSourceFromRow(result.rows[0]) : null;
}

export async function getActiveLearningSpaceSource(learningSpaceId: string): Promise<LearningSpaceSource | null> {
  const result = await (await getDatabase()).execute({ sql: "SELECT * FROM learning_space_sources WHERE learning_space_id = ? AND is_active = 1", args: [learningSpaceId] });
  return result.rows[0] ? learningSpaceSourceFromRow(result.rows[0]) : null;
}

async function defaultLearningSpaceId(): Promise<string> {
  const spaces = await getLearningSpaces(true);
  if (!spaces[0]) throw new Error("Er is nog geen actieve leeromgeving.");
  return spaces.at(-1)!.id;
}

export async function createLearningSpace(input: LearningSpaceInput): Promise<LearningSpace> {
  return createLearningSpaceWithOwner(input, null);
}

export async function createLearningSpaceForOwner(input: LearningSpaceInput, ownerUserId: string): Promise<LearningSpace> {
  return createLearningSpaceWithOwner(input, ownerUserId);
}

async function createLearningSpaceWithOwner(input: LearningSpaceInput, ownerUserId: string | null): Promise<LearningSpace> {
  const now = new Date().toISOString();
  const id = stableId("space", input.slug);
  const primary = input.primarySource ?? sourceFromLegacyInput(input);
  const mirror = input.mirrorSource ?? null;
  const statements: InStatement[] = [{ sql: `INSERT INTO learning_spaces (id, name, slug, short_label, description, card_color, sort_order, is_active, storage_provider, source_type,
    local_source_path, onedrive_drive_id, onedrive_folder_id, onedrive_folder_path, google_drive_folder_id, google_drive_folder_label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [id, input.name, input.slug, input.shortLabel, input.description ?? DEFAULT_LEARNING_SPACE_DESCRIPTION, input.cardColor ?? DEFAULT_LEARNING_SPACE_COLOR, input.sortOrder,
      legacyStorageProvider(primary.providerType), primary.providerType, primary.localSourcePath ?? null, primary.oneDriveDriveId ?? null,
      primary.oneDriveFolderId ?? null, primary.oneDriveFolderPath ?? null, primary.googleDriveFolderId ?? null, primary.googleDriveFolderLabel ?? null, now, now] }];
  statements.push(sourceUpsertStatement(id, "primary", primary, true, now));
  if (mirror) statements.push(sourceUpsertStatement(id, "mirror", mirror, false, now));
  if (ownerUserId) {
    statements.push({
      sql: "INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at) VALUES (?, ?, 'owner', ?, ?)",
      args: [id, ownerUserId, now, now],
    });
  }
  await executeBatch(statements);
  return (await getLearningSpace(id))!;
}

export async function updateLearningSpace(id: string, input: LearningSpaceInput): Promise<void> {
  const existing = await getLearningSpace(id);
  if (!existing) throw new Error("Leeromgeving niet gevonden.");
  const primary = preserveStorageConnection(input.primarySource ?? sourceFromLegacyInput(input), existing.primarySource);
  const mirror = input.mirrorSource === undefined ? sourceToInput(existing.mirrorSource) : preserveStorageConnection(input.mirrorSource, existing.mirrorSource);
  if (existing.mirrorSource?.isActive && !mirror) throw new Error("Schakel eerst terug naar de primaire bron voordat je de actieve mirror verwijdert.");
  const active = existing.mirrorSource?.isActive ? mirror! : primary;
  const configured = [primary, mirror].filter((source): source is LearningSpaceSourceInput => Boolean(source));
  const local = configured.find((source) => source.providerType === "local");
  const oneDrive = configured.find((source) => source.providerType === "onedrive");
  const googleDrive = configured.find((source) => source.providerType === "google_drive");
  const now = new Date().toISOString();
  const statements: InStatement[] = [{ sql: `UPDATE learning_spaces SET name = ?, slug = ?, short_label = ?, description = ?, card_color = ?, sort_order = ?, storage_provider = ?, source_type = ?,
    local_source_path = ?, onedrive_drive_id = ?, onedrive_folder_id = ?, onedrive_folder_path = ?, google_drive_folder_id = ?, google_drive_folder_label = ?, updated_at = ? WHERE id = ?`,
    args: [input.name, input.slug, input.shortLabel, input.description ?? existing.description, input.cardColor ?? existing.cardColor, input.sortOrder,
      legacyStorageProvider(active.providerType), active.providerType,
      local?.localSourcePath ?? existing.localSourcePath,
      oneDrive?.oneDriveDriveId ?? existing.oneDriveDriveId, oneDrive?.oneDriveFolderId ?? existing.oneDriveFolderId,
      oneDrive?.oneDriveFolderPath ?? existing.oneDriveFolderPath, googleDrive?.googleDriveFolderId ?? existing.googleDriveFolderId,
      googleDrive?.googleDriveFolderLabel ?? existing.googleDriveFolderLabel, now, id] }];
  statements.push(sourceUpsertStatement(id, "primary", primary, existing.primarySource?.isActive ?? !existing.mirrorSource?.isActive, now));
  if (mirror) statements.push(sourceUpsertStatement(id, "mirror", mirror, existing.mirrorSource?.isActive ?? false, now));
  else statements.push({ sql: "DELETE FROM learning_space_sources WHERE learning_space_id = ? AND role = 'mirror' AND is_active = 0", args: [id] });
  await executeBatch(statements);
}

export async function setLearningSpaceEditorsCanManageAccess(id: string, enabled: boolean): Promise<void> {
  await (await getDatabase()).execute({
    sql: "UPDATE learning_spaces SET editors_can_manage_access = ?, updated_at = ? WHERE id = ?",
    args: [enabled ? 1 : 0, new Date().toISOString(), id],
  });
}

function sourceFromLegacyInput(input: LearningSpaceInput): LearningSpaceSourceInput {
  return {
    providerType: input.sourceType, storageConnectionId: input.storageConnectionId, localSourcePath: input.localSourcePath,
    oneDriveDriveId: input.oneDriveDriveId, oneDriveFolderId: input.oneDriveFolderId, oneDriveFolderPath: input.oneDriveFolderPath,
    googleDriveFolderId: input.googleDriveFolderId, googleDriveFolderLabel: input.googleDriveFolderLabel,
  };
}

function sourceToInput(source: LearningSpaceSource | null): LearningSpaceSourceInput | null {
  if (!source) return null;
  return {
    providerType: source.providerType, storageConnectionId: source.storageConnectionId, localSourcePath: source.localSourcePath,
    oneDriveDriveId: source.oneDriveDriveId, oneDriveFolderId: source.oneDriveFolderId, oneDriveFolderPath: source.oneDriveFolderPath,
    googleDriveFolderId: source.googleDriveFolderId, googleDriveFolderLabel: source.googleDriveFolderLabel,
  };
}

function preserveStorageConnection(source: LearningSpaceSourceInput, existing: LearningSpaceSource | null): LearningSpaceSourceInput;
function preserveStorageConnection(source: LearningSpaceSourceInput | null, existing: LearningSpaceSource | null): LearningSpaceSourceInput | null;
function preserveStorageConnection(source: LearningSpaceSourceInput | null, existing: LearningSpaceSource | null): LearningSpaceSourceInput | null {
  if (!source) return null;
  return {
    ...source,
    storageConnectionId: source.storageConnectionId === undefined && source.providerType === existing?.providerType
      ? existing.storageConnectionId
      : source.storageConnectionId ?? null,
  };
}

function sourceUpsertStatement(
  learningSpaceId: string,
  role: LearningSpaceSourceRole,
  source: LearningSpaceSourceInput,
  activeOnInsert: boolean,
  now: string,
): InStatement {
  return {
    sql: `INSERT INTO learning_space_sources (id, learning_space_id, role, provider_type, storage_connection_id, is_active, local_source_path,
      onedrive_drive_id, onedrive_folder_id, onedrive_folder_path, google_drive_folder_id, google_drive_folder_label, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(learning_space_id, role) DO UPDATE SET provider_type = excluded.provider_type,
        storage_connection_id = excluded.storage_connection_id,
        local_source_path = excluded.local_source_path, onedrive_drive_id = excluded.onedrive_drive_id,
        onedrive_folder_id = excluded.onedrive_folder_id, onedrive_folder_path = excluded.onedrive_folder_path,
        google_drive_folder_id = excluded.google_drive_folder_id, google_drive_folder_label = excluded.google_drive_folder_label,
        last_validated_at = NULL, last_validation_status = NULL, last_validation_message = NULL, mirror_completed_at = NULL,
        updated_at = excluded.updated_at`,
    args: [`${learningSpaceId}:${role}`, learningSpaceId, role, source.providerType, source.storageConnectionId ?? null, activeOnInsert ? 1 : 0,
      source.localSourcePath ?? null, source.oneDriveDriveId ?? null, source.oneDriveFolderId ?? null, source.oneDriveFolderPath ?? null,
      source.googleDriveFolderId ?? null, source.googleDriveFolderLabel ?? null, now, now],
  };
}

function legacyStorageProvider(sourceType: StorageSourceType): "local" | "onedrive" {
  return sourceType === "onedrive" ? "onedrive" : "local";
}

export async function archiveLearningSpace(id: string): Promise<boolean> {
  const database = await getDatabase();
  const existing = await database.execute({ sql: "SELECT id FROM learning_spaces WHERE id = ?", args: [id] });
  if (!existing.rows[0]) return false;
  const now = new Date().toISOString();
  await database.execute({ sql: "UPDATE learning_spaces SET is_active = 0, archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE id = ?", args: [now, now, id] });
  return true;
}

export async function restoreLearningSpace(id: string): Promise<boolean> {
  const database = await getDatabase();
  const existing = await database.execute({ sql: "SELECT id FROM learning_spaces WHERE id = ?", args: [id] });
  if (!existing.rows[0]) return false;
  await database.execute({ sql: "UPDATE learning_spaces SET is_active = 1, archived_at = NULL, updated_at = ? WHERE id = ?", args: [new Date().toISOString(), id] });
  return true;
}

export async function permanentlyDeleteLearningSpace(id: string): Promise<boolean> {
  const database = await getDatabase();
  const existing = await database.execute({ sql: "SELECT id, is_active, archived_at FROM learning_spaces WHERE id = ?", args: [id] });
  const row = existing.rows[0];
  if (!row || !canPermanentlyDeleteLearningSpace({ isActive: bool(row.is_active), archivedAt: nullableText(row, "archived_at") })) return false;
  const portfolioIds = "SELECT id FROM portfolios WHERE learning_space_id = ?";
  const exerciseIds = `SELECT id FROM exercises WHERE portfolio_id IN (${portfolioIds})`;
  const variantIds = `SELECT id FROM solution_variants WHERE exercise_id IN (${exerciseIds})`;
  const syncRunIds = "SELECT id FROM sync_runs WHERE learning_space_id = ?";
  await executeBatch([
    { sql: `DELETE FROM error_reports WHERE portfolio_id IN (${portfolioIds})`, args: [id] },
    { sql: `DELETE FROM solution_assets WHERE variant_id IN (${variantIds})`, args: [id] },
    { sql: `DELETE FROM solution_variants WHERE exercise_id IN (${exerciseIds})`, args: [id] },
    { sql: `DELETE FROM exercises WHERE portfolio_id IN (${portfolioIds})`, args: [id] },
    { sql: `DELETE FROM sections WHERE portfolio_id IN (${portfolioIds})`, args: [id] },
    { sql: `DELETE FROM sync_warnings WHERE sync_run_id IN (${syncRunIds})`, args: [id] },
    { sql: "DELETE FROM sync_runs WHERE learning_space_id = ?", args: [id] },
    { sql: "DELETE FROM sync_leases WHERE learning_space_id = ?", args: [id] },
    { sql: "DELETE FROM portfolios WHERE learning_space_id = ?", args: [id] },
    { sql: "DELETE FROM themes WHERE learning_space_id = ?", args: [id] },
    { sql: "DELETE FROM app_settings WHERE key = 'legacy_default_learning_space_id' AND value = ?", args: [id] },
    { sql: "DELETE FROM learning_space_sources WHERE learning_space_id = ?", args: [id] },
    { sql: "DELETE FROM learning_spaces WHERE id = ?", args: [id] },
  ]);
  return true;
}

export async function getThemes(learningSpaceId: string): Promise<Theme[]> {
  const database = await getDatabase();
  const result = await database.execute({ sql: "SELECT * FROM themes WHERE learning_space_id = ? ORDER BY sort_order, name", args: [learningSpaceId] });
  return result.rows.map((row) => ({ id: text(row, "id"), learningSpaceId: text(row, "learning_space_id"), name: text(row, "name"), sortOrder: Number(row.sort_order) }));
}

export async function createTheme(learningSpaceId: string, name: string, sortOrder: number): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.execute({ sql: "INSERT INTO themes (id, learning_space_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", args: [randomUUID(), learningSpaceId, name, sortOrder, now, now] });
}

export async function updateTheme(id: string, learningSpaceId: string, name: string, sortOrder: number): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE themes SET name = ?, sort_order = ?, updated_at = ? WHERE id = ? AND learning_space_id = ?", args: [name, sortOrder, new Date().toISOString(), id, learningSpaceId] });
}

export async function deleteTheme(id: string, learningSpaceId: string): Promise<void> {
  await executeBatch([{ sql: "UPDATE portfolios SET theme_id = NULL WHERE theme_id = ? AND learning_space_id = ?", args: [id, learningSpaceId] }, { sql: "DELETE FROM themes WHERE id = ? AND learning_space_id = ?", args: [id, learningSpaceId] }]);
}

export async function setPortfolioTheme(id: string, learningSpaceId: string, themeId: string | null): Promise<void> {
  const database = await getDatabase();
  if (themeId) {
    const theme = await database.execute({ sql: "SELECT id FROM themes WHERE id = ? AND learning_space_id = ?", args: [themeId, learningSpaceId] });
    if (!theme.rows[0]) throw new Error("Thema niet gevonden.");
  }
  await database.execute({ sql: "UPDATE portfolios SET theme_id = ? WHERE id = ? AND learning_space_id = ?", args: [themeId, id, learningSpaceId] });
}

export async function getLocalStorageSettings(): Promise<LocalStorageSettings> {
  const sourcePath = await getSetting("local_source_path");
  if (sourcePath) return { sourcePath, sourcePathOrigin: "database" };
  if (process.env.PORTFOLIO_SOURCE_PATH?.trim()) {
    return { sourcePath: process.env.PORTFOLIO_SOURCE_PATH.trim(), sourcePathOrigin: "environment" };
  }
  return { sourcePath: DEFAULT_LOCAL_SOURCE_PATH, sourcePathOrigin: "default" };
}

export async function getLocalSourcePath(): Promise<string> {
  return (await getLocalStorageSettings()).sourcePath;
}

export async function setLocalSourcePath(sourcePath: string): Promise<void> {
  const normalizedPath = path.resolve(sourcePath.trim());
  const sourceStats = await stat(normalizedPath);
  if (!sourceStats.isDirectory()) throw new Error("De opgegeven bronmap bestaat niet of is geen map.");
  await setSetting("local_source_path", normalizedPath);
}

export async function resetLocalSourcePath(): Promise<void> {
  await deleteSetting("local_source_path");
}

export async function getStorageProviderType(): Promise<"local" | "onedrive"> {
  return (await getSetting("storage_provider")) === "onedrive" ? "onedrive" : "local";
}

export async function setStorageProviderType(provider: "local" | "onedrive"): Promise<void> {
  await setSetting("storage_provider", provider);
}

export async function getSetting(key: string): Promise<string | null> {
  const database = await getDatabase();
  const result = await database.execute({ sql: "SELECT value FROM app_settings WHERE key = ?", args: [key] });
  return result.rows[0] ? nullableText(result.rows[0], "value") : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({
    sql: `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, value, new Date().toISOString()],
  });
}

export async function deleteSetting(key: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "DELETE FROM app_settings WHERE key = ?", args: [key] });
}

export async function getLatestSyncSummary(learningSpaceId?: string): Promise<SyncSummary | null> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const result = await database.execute({ sql: "SELECT * FROM sync_runs WHERE learning_space_id = ? ORDER BY started_at DESC LIMIT 1", args: [spaceId] });
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    startedAt: text(row, "started_at"),
    finishedAt: nullableText(row, "finished_at"),
    portfolioCount: Number(row.portfolio_count),
    warningCount: Number(row.warning_count),
    status: text(row, "status"),
    providerType: nullableText(row, "provider_type"),
    addedCount: Number(row.added_count ?? 0),
    updatedCount: Number(row.updated_count ?? 0),
    missingCount: Number(row.missing_count ?? 0),
    failureMessage: nullableText(row, "failure_message"),
  };
}

export async function hasValidLearningSpaceIndex(learningSpaceId: string): Promise<boolean> {
  const result = await (await getDatabase()).execute({
    sql: `SELECT CASE WHEN
      EXISTS(SELECT 1 FROM sync_runs WHERE learning_space_id = ? AND status = 'completed')
      OR EXISTS(SELECT 1 FROM portfolios WHERE learning_space_id = ? AND is_indexed = 1)
      THEN 1 ELSE 0 END AS has_valid_index`,
    args: [learningSpaceId, learningSpaceId],
  });
  return Number(result.rows[0]?.has_valid_index ?? 0) === 1;
}

export async function tryAcquireSyncLease(learningSpaceId: string, ownerId: string, now = new Date(), leaseSeconds = 600): Promise<boolean> {
  const database = await getDatabase();
  const acquiredUntil = new Date(now.getTime() + Math.max(60, leaseSeconds) * 1000).toISOString();
  const result = await database.execute({
    sql: `INSERT INTO sync_leases (learning_space_id, owner_id, acquired_until) VALUES (?, ?, ?)
      ON CONFLICT(learning_space_id) DO UPDATE SET owner_id = excluded.owner_id, acquired_until = excluded.acquired_until
      WHERE sync_leases.acquired_until <= ?
      RETURNING owner_id`,
    args: [learningSpaceId, ownerId, acquiredUntil, now.toISOString()],
  });
  return result.rows.some((row) => text(row, "owner_id") === ownerId);
}

export async function releaseSyncLease(learningSpaceId: string, ownerId: string): Promise<void> {
  await (await getDatabase()).execute({ sql: "DELETE FROM sync_leases WHERE learning_space_id = ? AND owner_id = ?", args: [learningSpaceId, ownerId] });
}

export interface PersistIndexOptions {
  sourceId?: string;
  activateSourceId?: string;
  mirrorCompletedAt?: string;
}

export async function persistIndex(
  portfolios: IndexedPortfolio[],
  providerType: string,
  learningSpaceId?: string,
  options: PersistIndexOptions = {},
): Promise<{ warnings: number; added: number; updated: number; missing: number }> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const sourceId = options.sourceId ?? options.activateSourceId;
  const source = sourceId ? await getLearningSpaceSource(sourceId) : null;
  if (sourceId && (!source || source.learningSpaceId !== spaceId || source.providerType !== providerType)) {
    throw new Error("De synchronisatiebron hoort niet bij deze leeromgeving.");
  }
  if (options.activateSourceId && source?.id !== options.activateSourceId) throw new Error("Het switchdoel is ongeldig.");
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const warnings = [...portfolios.flatMap((portfolio) => portfolio.warnings)];
  const existingAssets = await database.execute({ sql: `SELECT solution_assets.id, solution_assets.variant_id, solution_assets.relative_path, solution_assets.file_name, solution_assets.source_version, solution_variants.kind
    FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
    JOIN exercises ON exercises.id = solution_variants.exercise_id JOIN portfolios ON portfolios.id = exercises.portfolio_id
    WHERE solution_assets.is_indexed = 1 AND portfolios.learning_space_id = ?`, args: [spaceId] });
  const existingPortfolios = await database.execute({ sql: "SELECT id, portfolio_code FROM portfolios WHERE learning_space_id = ?", args: [spaceId] });
  const portfolioIds = new Map(existingPortfolios.rows.map((row) => [text(row, "portfolio_code"), text(row, "id")]));
  const legacyDefaultSpaceId = await getSetting("legacy_default_learning_space_id");
  const assetKey = (variantId: string, relativePath: string) => `${variantId}\u0000${relativePath}`;
  const existingAssetVersions = new Map(existingAssets.rows.map((row) => [
    assetKey(text(row, "variant_id"), text(row, "relative_path")),
    { id: text(row, "id"), fileName: text(row, "file_name"), variant: text(row, "kind"), sourceVersion: nullableText(row, "source_version") },
  ]));
  const seenAssetKeys = new Set<string>();
  const seenVariantIds = new Set<string>();
  let added = 0;
  let updated = 0;

  const statements: InStatement[] = [
    {
      sql: `INSERT INTO sync_runs (id, learning_space_id, source_id, started_at, portfolio_count, warning_count, status, provider_type)
        VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
      args: [runId, spaceId, sourceId ?? null, startedAt, portfolios.length, warnings.length, providerType],
    },
    { sql: "UPDATE portfolios SET is_indexed = 0 WHERE learning_space_id = ?", args: [spaceId] },
    { sql: "UPDATE sections SET is_indexed = 0 WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)", args: [spaceId] },
    { sql: "UPDATE exercises SET is_indexed = 0 WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)", args: [spaceId] },
    { sql: "UPDATE solution_variants SET is_indexed = 0 WHERE exercise_id IN (SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?))", args: [spaceId] },
    { sql: "UPDATE solution_assets SET is_indexed = 0 WHERE variant_id IN (SELECT id FROM solution_variants WHERE exercise_id IN (SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)))", args: [spaceId] },
  ];

  for (const portfolio of portfolios) {
    const portfolioId = portfolioIds.get(portfolio.code) ?? (legacyDefaultSpaceId === spaceId ? `portfolio-${portfolio.code}` : stableId("portfolio", spaceId, portfolio.code));
    statements.push({
      sql: `INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, assignment_pdf_path, assignment_pdf_source_id,
        hints_document_path, hints_document_source_id, final_solutions_pdf_path, final_solutions_pdf_source_id, is_indexed, indexed_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET code = excluded.code, portfolio_code = excluded.portfolio_code, learning_space_id = excluded.learning_space_id, title = excluded.title, relative_path = excluded.relative_path,
          assignment_pdf_path = excluded.assignment_pdf_path, assignment_pdf_source_id = excluded.assignment_pdf_source_id,
          hints_document_path = excluded.hints_document_path, hints_document_source_id = excluded.hints_document_source_id,
          final_solutions_pdf_path = excluded.final_solutions_pdf_path, final_solutions_pdf_source_id = excluded.final_solutions_pdf_source_id,
          is_indexed = 1, archived_at = NULL, indexed_at = excluded.indexed_at, last_seen_at = excluded.last_seen_at`,
      args: [portfolioId, `${spaceId}:${portfolio.code}`, portfolio.code, spaceId, portfolio.title, portfolio.relativePath, portfolio.assignmentPdfPath,
        portfolio.assignmentPdfSourceId, portfolio.hintsDocumentPath, portfolio.hintsDocumentSourceId,
        portfolio.finalSolutionsPdfPath, portfolio.finalSolutionsPdfSourceId, startedAt, startedAt],
    });

    for (const section of portfolio.sections) {
      const sectionId = `${portfolioId}-section-${section.order}`;
      statements.push({
        sql: `INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path, visibility_mode, is_indexed, last_seen_at)
          VALUES (?, ?, ?, ?, ?, 'visible', 1, ?)
          ON CONFLICT(id) DO UPDATE SET title = excluded.title, relative_path = excluded.relative_path,
            is_indexed = 1, archived_at = NULL, last_seen_at = excluded.last_seen_at`,
        args: [sectionId, portfolioId, section.order, section.title, section.relativePath, startedAt],
      });

      for (const exercise of section.exercises) {
        const exerciseId = `${sectionId}-exercise-${exercise.code}`;
        statements.push({
          sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, visibility_mode, visible, is_indexed, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, 'visible', 1, 1, ?)
            ON CONFLICT(id) DO UPDATE SET exercise_number = excluded.exercise_number,
              exercise_suffix = excluded.exercise_suffix, is_indexed = 1, archived_at = NULL, last_seen_at = excluded.last_seen_at`,
          args: [exerciseId, portfolioId, sectionId, exercise.code, exercise.number, exercise.suffix, startedAt],
        });

        for (const variant of ["standard", "alternative"] as const) {
          const variantAssets = exercise.assets.filter((asset) => asset.parsed.variant === variant);
          if (variantAssets.length === 0) continue;
          const variantId = `${exerciseId}-${variant}`;
          seenVariantIds.add(variantId);
          statements.push({
            sql: `INSERT INTO solution_variants (id, exercise_id, kind, label, is_indexed) VALUES (?, ?, ?, ?, 1)
              ON CONFLICT(id) DO UPDATE SET label = excluded.label, is_indexed = 1, archived_at = NULL`,
            args: [variantId, exerciseId, variant, variant === "standard" ? "Standaard" : "Alternatief"],
          });
          for (const asset of variantAssets) {
            const assetId = stableId("asset", variantId, asset.relativePath);
            const logicalAssetKey = assetKey(variantId, asset.relativePath);
            seenAssetKeys.add(logicalAssetKey);
            const previousAsset = existingAssetVersions.get(logicalAssetKey);
            if (previousAsset === undefined) added += 1;
            else if (previousAsset.sourceVersion !== asset.sourceVersion) updated += 1;
            statements.push({
              sql: `INSERT INTO solution_assets (id, variant_id, relative_path, source_id, file_name, extension, step,
                last_modified_at, source_version, is_indexed, missing_since)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)
                ON CONFLICT(variant_id, relative_path) DO UPDATE SET source_id = excluded.source_id,
                  file_name = excluded.file_name, extension = excluded.extension, step = excluded.step,
                  last_modified_at = excluded.last_modified_at, source_version = excluded.source_version,
                  is_indexed = 1, archived_at = NULL, missing_since = NULL`,
              args: [assetId, variantId, asset.relativePath, asset.sourceId, asset.fileName, asset.parsed.extension,
                asset.parsed.step, asset.lastModifiedAt, asset.sourceVersion],
            });
          }
        }
      }
    }
  }

  const missing = [...existingAssetVersions.entries()].filter(([key]) => !seenAssetKeys.has(key)).map(([key, asset]) => {
    const [variantId, relativePath] = key.split("\u0000");
    return { id: asset.id, relativePath, fileName: asset.fileName, variant: asset.variant, variantStillPresent: seenVariantIds.has(variantId) };
  });
  if (missing.length > 0) {
    statements.push({
      sql: `UPDATE solution_assets SET missing_since = ? WHERE is_indexed = 0 AND missing_since IS NULL AND variant_id IN
        (SELECT id FROM solution_variants WHERE exercise_id IN (SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)))`,
      args: [startedAt, spaceId],
    });
    for (const asset of missing) {
      const label = asset.variant === "alternative" ? "Alternatieve uitwerking" : "Uitwerking";
      warnings.push({ severity: "warning", path: asset.relativePath, message: asset.variantStillPresent ? `${label} is onvolledig: bestand ontbreekt: ${asset.fileName}.` : `Bronbestand ontbreekt: ${asset.fileName}. Deze oefening blijft voorlopig herkenbaar in het beheer.` });
    }
  }
  for (const warning of warnings) {
    statements.push({
      sql: "INSERT INTO sync_warnings (id, sync_run_id, severity, relative_path, message) VALUES (?, ?, ?, ?, ?)",
      args: [randomUUID(), runId, warning.severity, warning.path, warning.message],
    });
  }
  statements.push({
    sql: `UPDATE sync_runs SET status = 'completed', finished_at = ?, warning_count = ?, added_count = ?, updated_count = ?, missing_count = ? WHERE id = ?`,
    args: [new Date().toISOString(), warnings.length, added, updated, missing.length, runId],
  });
  if (source) {
    statements.push({
      sql: `UPDATE learning_space_sources SET last_validated_at = ?, last_validation_status = 'valid',
        last_validation_message = NULL, mirror_completed_at = ?, updated_at = ? WHERE id = ? AND learning_space_id = ?`,
      args: [startedAt, options.mirrorCompletedAt ?? null, startedAt, source.id, spaceId],
    });
  }
  if (options.activateSourceId && source) {
    statements.push(
      { sql: "UPDATE learning_space_sources SET is_active = 0, updated_at = ? WHERE learning_space_id = ? AND is_active = 1", args: [startedAt, spaceId] },
      { sql: "UPDATE learning_space_sources SET is_active = 1, updated_at = ? WHERE id = ? AND learning_space_id = ?", args: [startedAt, source.id, spaceId] },
      { sql: "UPDATE learning_spaces SET source_type = ?, storage_provider = ?, updated_at = ? WHERE id = ?", args: [source.providerType, legacyStorageProvider(source.providerType), startedAt, spaceId] },
    );
  }

  await executeBatch(statements);
  return { warnings: warnings.length, added, updated, missing: missing.length };
}

export async function getIndexedSourceManifest(learningSpaceId: string): Promise<SourceManifestEntry[]> {
  const database = await getDatabase();
  const [portfolios, sections, assets] = await Promise.all([
    database.execute({ sql: `SELECT relative_path, assignment_pdf_path, hints_document_path, final_solutions_pdf_path FROM portfolios
      WHERE learning_space_id = ? AND is_indexed = 1`, args: [learningSpaceId] }),
    database.execute({ sql: `SELECT sections.relative_path FROM sections JOIN portfolios ON portfolios.id = sections.portfolio_id
      WHERE portfolios.learning_space_id = ? AND sections.is_indexed = 1 AND EXISTS (
        SELECT 1 FROM exercises
        JOIN solution_variants ON solution_variants.exercise_id = exercises.id
        JOIN solution_assets ON solution_assets.variant_id = solution_variants.id
        WHERE exercises.section_id = sections.id AND solution_assets.is_indexed = 1
      )`, args: [learningSpaceId] }),
    database.execute({ sql: `SELECT solution_assets.relative_path FROM solution_assets
      JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      JOIN exercises ON exercises.id = solution_variants.exercise_id
      JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE portfolios.learning_space_id = ? AND solution_assets.is_indexed = 1`, args: [learningSpaceId] }),
  ]);
  const manifest: SourceManifestEntry[] = [];
  for (const row of portfolios.rows) {
    manifest.push({ kind: "portfolio", relativePath: text(row, "relative_path") });
    const assignment = nullableText(row, "assignment_pdf_path");
    const hints = nullableText(row, "hints_document_path");
    const finalSolutions = nullableText(row, "final_solutions_pdf_path");
    if (assignment) manifest.push({ kind: "file", relativePath: assignment });
    if (hints) manifest.push({ kind: "file", relativePath: hints });
    if (finalSolutions) manifest.push({ kind: "file", relativePath: finalSolutions });
  }
  for (const row of sections.rows) manifest.push({ kind: "section", relativePath: text(row, "relative_path") });
  for (const row of assets.rows) manifest.push({ kind: "file", relativePath: text(row, "relative_path") });
  return manifest.sort((left, right) => comparePortfolioRelativePaths(left.relativePath, right.relativePath));
}

export async function recordLearningSpaceSourceValidation(
  sourceId: string,
  status: "valid" | "invalid",
  message: string | null,
  mirrorCompletedAt?: string,
): Promise<void> {
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: `UPDATE learning_space_sources SET last_validated_at = ?, last_validation_status = ?, last_validation_message = ?,
      mirror_completed_at = COALESCE(?, mirror_completed_at), updated_at = ? WHERE id = ?`,
    args: [now, status, message, mirrorCompletedAt ?? null, now, sourceId],
  });
}

export async function archiveMissingIndexItems(learningSpaceId: string): Promise<{ exercises: number; assets: number }> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const exerciseCount = await database.execute({ sql: "SELECT COUNT(*) AS count FROM exercises WHERE is_indexed = 0 AND archived_at IS NULL AND portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)", args: [learningSpaceId] });
  const assetCount = await database.execute({ sql: "SELECT COUNT(*) AS count FROM solution_assets WHERE is_indexed = 0 AND archived_at IS NULL AND variant_id IN (SELECT id FROM solution_variants WHERE exercise_id IN (SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)))", args: [learningSpaceId] });
  await executeBatch([
    { sql: `DELETE FROM sync_warnings WHERE sync_run_id = (SELECT id FROM sync_runs WHERE status = 'completed' AND learning_space_id = ? ORDER BY finished_at DESC LIMIT 1)
      AND relative_path IN (SELECT relative_path FROM solution_assets WHERE is_indexed = 0 AND archived_at IS NULL AND variant_id IN
        (SELECT id FROM solution_variants WHERE exercise_id IN (SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?))))`, args: [learningSpaceId, learningSpaceId] },
    { sql: "UPDATE solution_assets SET archived_at = ? WHERE is_indexed = 0 AND archived_at IS NULL AND variant_id IN (SELECT id FROM solution_variants WHERE exercise_id IN (SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)))", args: [now, learningSpaceId] },
    { sql: "UPDATE solution_variants SET archived_at = ? WHERE is_indexed = 0 AND archived_at IS NULL AND exercise_id IN (SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?))", args: [now, learningSpaceId] },
    { sql: "UPDATE exercises SET archived_at = ? WHERE is_indexed = 0 AND archived_at IS NULL AND portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)", args: [now, learningSpaceId] },
    { sql: "UPDATE sections SET archived_at = ? WHERE is_indexed = 0 AND archived_at IS NULL AND portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)", args: [now, learningSpaceId] },
    { sql: "UPDATE portfolios SET archived_at = ? WHERE is_indexed = 0 AND archived_at IS NULL AND learning_space_id = ?", args: [now, learningSpaceId] },
    { sql: `UPDATE sync_runs SET warning_count = (SELECT COUNT(*) FROM sync_warnings WHERE sync_run_id = sync_runs.id)
      WHERE id = (SELECT id FROM sync_runs WHERE status = 'completed' AND learning_space_id = ? ORDER BY finished_at DESC LIMIT 1)`, args: [learningSpaceId] },
  ]);
  return { exercises: Number(exerciseCount.rows[0]?.count ?? 0), assets: Number(assetCount.rows[0]?.count ?? 0) };
}

export async function getMissingIndexCounts(learningSpaceId: string): Promise<{ exercises: number; assets: number }> {
  const database = await getDatabase();
  const [exercises, assets] = await Promise.all([
    database.execute({ sql: "SELECT COUNT(*) AS count FROM exercises WHERE is_indexed = 0 AND archived_at IS NULL AND portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)", args: [learningSpaceId] }),
    database.execute({ sql: "SELECT COUNT(*) AS count FROM solution_assets WHERE is_indexed = 0 AND archived_at IS NULL AND variant_id IN (SELECT id FROM solution_variants WHERE exercise_id IN (SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)))", args: [learningSpaceId] }),
  ]);
  return { exercises: Number(exercises.rows[0]?.count ?? 0), assets: Number(assets.rows[0]?.count ?? 0) };
}

export async function recordFailedSync(providerType: string, error: unknown, learningSpaceId?: string): Promise<void> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const message = error instanceof Error ? error.message.slice(0, 1000) : "Onbekende synchronisatiefout.";
  await database.execute({
    sql: `INSERT INTO sync_runs (id, learning_space_id, started_at, finished_at, portfolio_count, warning_count, status, provider_type, failure_message)
      VALUES (?, ?, ?, ?, 0, 0, 'failed', ?, ?)`,
    args: [randomUUID(), spaceId, new Date().toISOString(), new Date().toISOString(), providerType, message],
  });
}

export async function getAdminPortfolios(learningSpaceId?: string): Promise<AdminPortfolio[]> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const [portfolios, sections, exercises, assets] = await Promise.all([
    database.execute({ sql: `SELECT portfolios.*, themes.name AS theme_name FROM portfolios LEFT JOIN themes ON themes.id = portfolios.theme_id
      WHERE portfolios.learning_space_id = ? AND portfolios.archived_at IS NULL`, args: [spaceId] }),
    database.execute({ sql: "SELECT * FROM sections WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?) AND archived_at IS NULL ORDER BY portfolio_id, sort_order", args: [spaceId] }),
    database.execute({ sql: "SELECT * FROM exercises WHERE archived_at IS NULL ORDER BY section_id, exercise_number, exercise_suffix" }),
    database.execute(`SELECT solution_assets.*, solution_variants.exercise_id, solution_variants.kind
      FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      WHERE solution_assets.archived_at IS NULL
      ORDER BY solution_assets.step, solution_assets.file_name`),
  ]);
  const now = new Date();

  return portfolios.rows.map((portfolio) => {
    const portfolioId = text(portfolio, "id");
    const portfolioStatus = resolvePortfolioPublication({
      visible: bool(portfolio.visible), limited: bool(portfolio.publication_limited), publishFrom: nullableText(portfolio, "publish_from"), publishUntil: nullableText(portfolio, "publish_until"),
    }, now);
    return {
      id: portfolioId,
      code: nullableText(portfolio, "portfolio_code") ?? text(portfolio, "code"),
      title: nullableText(portfolio, "title_override") ?? text(portfolio, "title"),
      detectedTitle: text(portfolio, "title"),
      visible: bool(portfolio.visible),
      publishFrom: nullableText(portfolio, "publish_from"),
      publishUntil: nullableText(portfolio, "publish_until"),
      limited: bool(portfolio.publication_limited),
      effectiveStatus: portfolioStatus,
      effectivePublished: portfolioStatus.state === "visible",
      isIndexed: bool(portfolio.is_indexed),
      assignmentPdfPath: nullableText(portfolio, "assignment_pdf_path"),
      hintsDocumentPath: nullableText(portfolio, "hints_document_path"),
      finalSolutionsPdfPath: nullableText(portfolio, "final_solutions_pdf_path"),
      learningSpaceId: text(portfolio, "learning_space_id"), themeId: nullableText(portfolio, "theme_id"), themeName: nullableText(portfolio, "theme_name"),
      cardColor: text(portfolio, "card_color"),
      customText: nullableText(portfolio, "custom_text"),
      customTextPosition: text(portfolio, "custom_text_position") as PortfolioCustomTextPosition,
      sections: sections.rows.filter((section) => text(section, "portfolio_id") === portfolioId).map((section) => {
        const sectionId = text(section, "id");
        const sectionPublication = { mode: childMode(section), limited: bool(section.publication_limited), publishFrom: nullableText(section, "publish_from"), publishUntil: nullableText(section, "publish_until") };
        const sectionStatus = resolveChildPublication(sectionPublication, portfolioStatus, now);
        return {
          id: sectionId,
          order: Number(section.sort_order),
          title: text(section, "title"),
          visibilityMode: sectionPublication.mode,
          publishFrom: sectionPublication.publishFrom,
          publishUntil: sectionPublication.publishUntil,
          limited: sectionPublication.limited,
          effectiveStatus: sectionStatus,
          effectivePublished: sectionStatus.state === "visible",
          isIndexed: bool(section.is_indexed),
          exercises: exercises.rows.filter((exercise) => text(exercise, "section_id") === sectionId).map((exercise) => {
            const exerciseId = text(exercise, "id");
            const exercisePublication = { mode: childMode(exercise), limited: false, publishFrom: null, publishUntil: null };
            const exerciseStatus = resolveChildPublication(exercisePublication, sectionStatus, now);
            return {
              id: exerciseId,
              code: text(exercise, "exercise_code"),
              visible: childMode(exercise) === "visible",
              visibilityMode: exercisePublication.mode,
              publishFrom: exercisePublication.publishFrom,
              publishUntil: exercisePublication.publishUntil,
              effectiveStatus: exerciseStatus,
              effectivePublished: exerciseStatus.state === "visible",
              isIndexed: bool(exercise.is_indexed),
              showAlternativeToStudents: bool(exercise.show_alternative_to_students),
              standardAssets: assets.rows.filter((asset) => text(asset, "exercise_id") === exerciseId && text(asset, "kind") === "standard" && bool(asset.is_indexed)).length,
              alternativeAssets: assets.rows.filter((asset) => text(asset, "exercise_id") === exerciseId && text(asset, "kind") === "alternative" && bool(asset.is_indexed)).length,
              missingAssets: assets.rows.filter((asset) => text(asset, "exercise_id") === exerciseId && !bool(asset.is_indexed)).length,
              assets: assets.rows.filter((asset) => text(asset, "exercise_id") === exerciseId).map((asset) => ({
                id: text(asset, "id"), fileName: text(asset, "file_name"), extension: text(asset, "extension"),
                step: Number(asset.step), variant: text(asset, "kind") as AdminAsset["variant"],
                isIndexed: bool(asset.is_indexed), lastModifiedAt: nullableText(asset, "last_modified_at"),
              })),
            };
          }),
        };
      }),
    };
  }).sort((left, right) => comparePortfolioIds(left.code, right.code));
}

export async function getAdminPortfolio(id: string, learningSpaceId?: string): Promise<AdminPortfolio | null> {
  return (await getAdminPortfolios(learningSpaceId)).find((portfolio) => portfolio.id === id) ?? null;
}

export async function getAdminPortfolioAny(id: string): Promise<AdminPortfolio | null> {
  const database = await getDatabase();
  const result = await database.execute({ sql: "SELECT learning_space_id FROM portfolios WHERE id = ?", args: [id] });
  const spaceId = nullableText(result.rows[0] ?? {}, "learning_space_id");
  return spaceId ? getAdminPortfolio(id, spaceId) : null;
}

export async function getLatestWarnings(learningSpaceId?: string) {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const result = await database.execute({ sql: `SELECT sync_warnings.severity, sync_warnings.relative_path, sync_warnings.message
    FROM sync_warnings JOIN sync_runs ON sync_runs.id = sync_warnings.sync_run_id
    WHERE sync_warnings.sync_run_id = (SELECT id FROM sync_runs WHERE status = 'completed' AND (learning_space_id = ? OR learning_space_id IS NULL) ORDER BY finished_at DESC LIMIT 1)
    ORDER BY sync_warnings.relative_path, sync_warnings.message`, args: [spaceId] });
  return result.rows.map((row) => ({ severity: text(row, "severity"), relativePath: text(row, "relative_path"), message: text(row, "message") }));
}

export async function getActiveWarningCounts(learningSpaceId?: string): Promise<Map<string, number>> {
  const warnings = await getLatestWarnings(learningSpaceId);
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const portfolios = await getAdminPortfolios(spaceId);
  const counts = new Map<string, number>();
  for (const warning of warnings) {
    const portfolioCode = portfolioCodeFromRelativePath(warning.relativePath);
    const portfolio = portfolios.find((item) => item.code === portfolioCode);
    if (portfolio) counts.set(portfolio.id, (counts.get(portfolio.id) ?? 0) + 1);
  }
  return counts;
}

export async function getPortfolioWarnings(portfolioId: string, learningSpaceId?: string) {
  const portfolio = await getAdminPortfolio(portfolioId, learningSpaceId);
  if (!portfolio) return [];
  return (await getLatestWarnings(portfolio.learningSpaceId))
    .filter((warning) => portfolioCodeFromRelativePath(warning.relativePath) === portfolio.code);
}

export async function setPortfolioPublication(id: string, mode: PortfolioVisibilityMode, limited: boolean, publishFrom: string | null, publishUntil: string | null): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE portfolios SET visible = ?, publication_limited = ?, publish_from = ?, publish_until = ? WHERE id = ?", args: [mode === "visible" ? 1 : 0, limited ? 1 : 0, publishFrom, publishUntil, id] });
}

export async function setPortfolioTitle(id: string, title: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE portfolios SET title_override = ? WHERE id = ?", args: [title.trim() || null, id] });
}

export async function setPortfolioCardColor(id: string, cardColor: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE portfolios SET card_color = ? WHERE id = ?", args: [cardColor, id] });
}

export async function setPortfolioCustomMessage(id: string, customText: string | null, customTextPosition: PortfolioCustomTextPosition): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE portfolios SET custom_text = ?, custom_text_position = ? WHERE id = ?", args: [customText, customTextPosition, id] });
}

export async function setSectionPublication(id: string, mode: ChildVisibilityMode, limited: boolean, publishFrom: string | null, publishUntil: string | null): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE sections SET visibility_mode = ?, publication_limited = ?, publish_from = ?, publish_until = ? WHERE id = ?", args: [mode, limited ? 1 : 0, publishFrom, publishUntil, id] });
}

export async function setSectionVisibility(id: string, visible: boolean): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE sections SET visibility_mode = ? WHERE id = ?", args: [visible ? "visible" : "hidden", id] });
}

export async function setExercisePublication(ids: string[], mode: ChildVisibilityMode, publishFrom: string | null, publishUntil: string | null): Promise<void> {
  if (ids.length === 0) return;
  const database = await getDatabase();
  await database.batch(ids.map((id) => ({
    sql: "UPDATE exercises SET visibility_mode = ?, visible = ?, publish_from = ?, publish_until = ? WHERE id = ?",
    args: [mode, mode === "visible" ? 1 : 0, publishFrom, publishUntil, id],
  })));
}

export async function setPortfolioVisibility(id: string, visible: boolean): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE portfolios SET visible = ? WHERE id = ?", args: [visible ? 1 : 0, id] });
}

export async function setExerciseVisibility(id: string, visible: boolean): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE exercises SET visibility_mode = ?, visible = ? WHERE id = ?", args: [visible ? "visible" : "hidden", visible ? 1 : 0, id] });
}

export async function setExerciseAlternativeVisibility(id: string, showAlternativeToStudents: boolean): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE exercises SET show_alternative_to_students = ? WHERE id = ?", args: [showAlternativeToStudents ? 1 : 0, id] });
}

export async function getStudentPortfolios(learningSpaceId?: string): Promise<StudentPortfolio[]> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const [portfolios, sections, exercises] = await Promise.all([
    database.execute({ sql: `SELECT portfolios.*, themes.name AS theme_name FROM portfolios LEFT JOIN themes ON themes.id = portfolios.theme_id
      WHERE portfolios.is_indexed = 1 AND portfolios.learning_space_id = ?`, args: [spaceId] }),
    database.execute({ sql: "SELECT * FROM sections WHERE is_indexed = 1 AND portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?) ORDER BY portfolio_id, sort_order", args: [spaceId] }),
    database.execute({ sql: "SELECT * FROM exercises WHERE is_indexed = 1 AND portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?) ORDER BY section_id, exercise_number, exercise_suffix", args: [spaceId] }),
  ]);
  const now = new Date();
  const result: StudentPortfolio[] = [];

  for (const portfolio of portfolios.rows) {
    const publication = resolvePortfolioPublication({ visible: bool(portfolio.visible), limited: bool(portfolio.publication_limited), publishFrom: nullableText(portfolio, "publish_from"), publishUntil: nullableText(portfolio, "publish_until") }, now);
    if (publication.state !== "visible") continue;
    const portfolioId = text(portfolio, "id");
    const studentPortfolio: StudentPortfolio = {
      id: portfolioId,
      code: nullableText(portfolio, "portfolio_code") ?? text(portfolio, "code"),
      title: nullableText(portfolio, "title_override") ?? text(portfolio, "title"),
      themeId: nullableText(portfolio, "theme_id"), themeName: nullableText(portfolio, "theme_name"),
      cardColor: text(portfolio, "card_color"),
      customText: nullableText(portfolio, "custom_text"),
      customTextPosition: text(portfolio, "custom_text_position") as PortfolioCustomTextPosition,
      hintsDocumentPath: nullableText(portfolio, "hints_document_path"),
      sections: [],
    };
    for (const section of sections.rows.filter((row) => text(row, "portfolio_id") === portfolioId)) {
      const sectionPublication = { mode: childMode(section), limited: bool(section.publication_limited), publishFrom: nullableText(section, "publish_from"), publishUntil: nullableText(section, "publish_until") };
      const sectionStatus = resolveChildPublication(sectionPublication, publication, now);
      const sectionId = text(section, "id");
      studentPortfolio.sections.push({
        id: sectionId, title: text(section, "title"), order: Number(section.sort_order),
        exercises: exercises.rows.filter((row) => text(row, "section_id") === sectionId).map((exercise) => {
          const exercisePublication = { mode: childMode(exercise), limited: false, publishFrom: null, publishUntil: null };
          return {
            id: text(exercise, "id"), code: text(exercise, "exercise_code"),
            visible: resolveChildPublication(exercisePublication, sectionStatus, now).state === "visible",
          };
        }),
      });
    }
    result.push(studentPortfolio);
  }
  return result.sort((left, right) => comparePortfolioIds(left.code, right.code));
}

export async function getStudentPortfolio(id: string, learningSpaceId?: string): Promise<StudentPortfolio | null> {
  return (await getStudentPortfolios(learningSpaceId)).find((portfolio) => portfolio.id === id) ?? null;
}

export async function getVisibleExercise(id: string, learningSpaceId?: string) {
  const database = await getDatabase();
  const exerciseResult = await database.execute({
    sql: `SELECT exercises.*, sections.title AS section_title, sections.visibility_mode AS section_visibility_mode,
      sections.publication_limited AS section_publication_limited, sections.publish_from AS section_publish_from, sections.publish_until AS section_publish_until,
      portfolios.id AS portfolio_id, portfolios.portfolio_code, portfolios.learning_space_id, portfolios.title AS portfolio_title, portfolios.title_override,
      portfolios.visible AS portfolio_visible, portfolios.publication_limited, portfolios.publish_from AS portfolio_publish_from, portfolios.publish_until AS portfolio_publish_until
      FROM exercises JOIN sections ON sections.id = exercises.section_id JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE exercises.id = ? AND exercises.is_indexed = 1 AND sections.is_indexed = 1 AND portfolios.is_indexed = 1${learningSpaceId ? " AND portfolios.learning_space_id = ?" : ""}`,
    args: learningSpaceId ? [id, learningSpaceId] : [id],
  });
  const exercise = exerciseResult.rows[0];
  if (!exercise) return null;
  const now = new Date();
  const portfolioStatus = resolvePortfolioPublication({ visible: bool(exercise.portfolio_visible), limited: bool(exercise.publication_limited), publishFrom: nullableText(exercise, "portfolio_publish_from"), publishUntil: nullableText(exercise, "portfolio_publish_until") }, now);
  const sectionStatus = resolveChildPublication({ mode: childMode({ visibility_mode: exercise.section_visibility_mode }), limited: bool(exercise.section_publication_limited), publishFrom: nullableText(exercise, "section_publish_from"), publishUntil: nullableText(exercise, "section_publish_until") }, portfolioStatus, now);
  const exerciseStatus = resolveChildPublication({ mode: childMode(exercise), limited: false, publishFrom: null, publishUntil: null }, sectionStatus, now);
  if (exerciseStatus.state !== "visible") return null;

  const assets = await database.execute({
    sql: `SELECT solution_assets.id, solution_assets.file_name, solution_assets.extension, solution_assets.step,
      solution_assets.last_modified_at, solution_variants.kind, solution_variants.label
      FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      WHERE solution_variants.exercise_id = ? AND solution_assets.is_indexed = 1 AND solution_variants.is_indexed = 1
      ORDER BY CASE solution_variants.kind WHEN 'standard' THEN 0 ELSE 1 END, solution_assets.step, solution_assets.file_name`,
    args: [id],
  });
  return {
    id, portfolioId: text(exercise, "portfolio_id"), learningSpaceId: text(exercise, "learning_space_id"), code: text(exercise, "exercise_code"), sectionTitle: text(exercise, "section_title"),
    portfolioCode: text(exercise, "portfolio_code"), portfolioTitle: nullableText(exercise, "title_override") ?? text(exercise, "portfolio_title"),
    assets: assets.rows.filter((asset) => text(asset, "kind") !== "alternative" || bool(exercise.show_alternative_to_students)).map((asset) => ({ id: text(asset, "id"), fileName: text(asset, "file_name"), extension: text(asset, "extension"), step: Number(asset.step), kind: text(asset, "kind") as "standard" | "alternative", label: text(asset, "label"), lastModifiedAt: nullableText(asset, "last_modified_at") })),
  };
}

export async function getAdminExercise(id: string, learningSpaceId?: string) {
  const database = await getDatabase();
  const result = await database.execute({ sql: `SELECT exercises.exercise_code, exercises.is_indexed AS exercise_is_indexed, exercises.archived_at AS exercise_archived_at,
    sections.title AS section_title, sections.is_indexed AS section_is_indexed, portfolios.id AS portfolio_id, portfolios.portfolio_code, portfolios.title AS portfolio_title, portfolios.title_override, portfolios.learning_space_id, portfolios.is_indexed AS portfolio_is_indexed
    FROM exercises JOIN sections ON sections.id = exercises.section_id JOIN portfolios ON portfolios.id = exercises.portfolio_id
    WHERE exercises.id = ? AND exercises.archived_at IS NULL${learningSpaceId ? " AND portfolios.learning_space_id = ?" : ""}`, args: learningSpaceId ? [id, learningSpaceId] : [id] });
  const exercise = result.rows[0];
  if (!exercise) return null;
  const assets = await database.execute({ sql: `SELECT solution_assets.id, solution_assets.file_name, solution_assets.extension, solution_assets.step, solution_variants.kind, solution_variants.label
    FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
    WHERE solution_variants.exercise_id = ? AND solution_assets.is_indexed = 1 AND solution_variants.is_indexed = 1
    ORDER BY CASE solution_variants.kind WHEN 'standard' THEN 0 ELSE 1 END, solution_assets.step, solution_assets.file_name`, args: [id] });
  const isIndexed = bool(exercise.exercise_is_indexed) && bool(exercise.section_is_indexed) && bool(exercise.portfolio_is_indexed);
  return { id, portfolioId: text(exercise, "portfolio_id"), learningSpaceId: text(exercise, "learning_space_id"), code: text(exercise, "exercise_code"), sectionTitle: text(exercise, "section_title"), portfolioCode: text(exercise, "portfolio_code"), portfolioTitle: nullableText(exercise, "title_override") ?? text(exercise, "portfolio_title"), isIndexed, assets: assets.rows.map((asset) => ({ id: text(asset, "id"), fileName: text(asset, "file_name"), extension: text(asset, "extension"), step: Number(asset.step), kind: text(asset, "kind") as "standard" | "alternative", label: text(asset, "label") })) };
}

export async function getAdminAsset(id: string, learningSpaceId?: string) {
  const database = await getDatabase();
  const result = await database.execute({ sql: `SELECT solution_assets.relative_path, solution_assets.source_id, solution_assets.file_name, solution_assets.extension, portfolios.learning_space_id
    FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id JOIN exercises ON exercises.id = solution_variants.exercise_id
    JOIN portfolios ON portfolios.id = exercises.portfolio_id WHERE solution_assets.id = ? AND solution_assets.is_indexed = 1 AND solution_variants.is_indexed = 1 AND exercises.is_indexed = 1${learningSpaceId ? " AND portfolios.learning_space_id = ?" : ""}`, args: learningSpaceId ? [id, learningSpaceId] : [id] });
  const row = result.rows[0];
  return row ? { learningSpaceId: text(row, "learning_space_id"), sourceId: nullableText(row, "source_id") ?? text(row, "relative_path"), fileName: text(row, "file_name"), extension: text(row, "extension") } : null;
}

export async function getPublicAsset(id: string, learningSpaceId?: string) {
  const database = await getDatabase();
  const result = await database.execute({
    sql: `SELECT solution_assets.relative_path, solution_assets.source_id, solution_assets.file_name, solution_assets.extension,
      exercises.*, solution_variants.kind AS variant_kind, sections.visibility_mode AS section_visibility_mode, sections.publication_limited AS section_publication_limited, sections.publish_from AS section_publish_from,
      sections.publish_until AS section_publish_until, sections.is_indexed AS section_is_indexed,
      portfolios.visible AS portfolio_visible, portfolios.publication_limited, portfolios.publish_from AS portfolio_publish_from,
      portfolios.publish_until AS portfolio_publish_until, portfolios.is_indexed AS portfolio_is_indexed, portfolios.learning_space_id
      FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      JOIN exercises ON exercises.id = solution_variants.exercise_id JOIN sections ON sections.id = exercises.section_id
      JOIN portfolios ON portfolios.id = exercises.portfolio_id WHERE solution_assets.id = ?
        AND solution_assets.is_indexed = 1 AND solution_variants.is_indexed = 1${learningSpaceId ? " AND portfolios.learning_space_id = ?" : ""}`,
    args: learningSpaceId ? [id, learningSpaceId] : [id],
  });
  const row = result.rows[0];
  if (!row || !bool(row.is_indexed) || !bool(row.section_is_indexed) || !bool(row.portfolio_is_indexed) || (text(row, "variant_kind") === "alternative" && !bool(row.show_alternative_to_students))) return null;
  const now = new Date();
  const portfolioStatus = resolvePortfolioPublication({ visible: bool(row.portfolio_visible), limited: bool(row.publication_limited), publishFrom: nullableText(row, "portfolio_publish_from"), publishUntil: nullableText(row, "portfolio_publish_until") }, now);
  const sectionStatus = resolveChildPublication({ mode: childMode({ visibility_mode: row.section_visibility_mode }), limited: bool(row.section_publication_limited), publishFrom: nullableText(row, "section_publish_from"), publishUntil: nullableText(row, "section_publish_until") }, portfolioStatus, now);
  if (resolveChildPublication({ mode: childMode(row), limited: false, publishFrom: null, publishUntil: null }, sectionStatus, now).state !== "visible") return null;
  return { learningSpaceId: text(row, "learning_space_id"), sourceId: nullableText(row, "source_id") ?? text(row, "relative_path"), fileName: text(row, "file_name"), extension: text(row, "extension") };
}

export type PortfolioDocumentKind = "assignment" | "hints" | "final-solutions";

export async function getPublicPortfolioDocument(portfolioId: string, kind: PortfolioDocumentKind, learningSpaceId?: string) {
  const database = await getDatabase();
  const result = await database.execute({ sql: `SELECT * FROM portfolios WHERE id = ? AND is_indexed = 1${learningSpaceId ? " AND learning_space_id = ?" : ""}`, args: learningSpaceId ? [portfolioId, learningSpaceId] : [portfolioId] });
  const portfolio = result.rows[0];
  if (!portfolio || resolvePortfolioPublication({ visible: bool(portfolio.visible), limited: bool(portfolio.publication_limited), publishFrom: nullableText(portfolio, "publish_from"), publishUntil: nullableText(portfolio, "publish_until") }).state !== "visible") return null;
  const columns = portfolioDocumentColumns(kind);
  const sourceId = nullableText(portfolio, columns.sourceId);
  const relativePath = nullableText(portfolio, columns.path);
  if (!sourceId && !relativePath) return null;
  return { learningSpaceId: text(portfolio, "learning_space_id"), sourceId: sourceId ?? relativePath!, fileName: (relativePath ?? "document.pdf").split("/").at(-1) ?? "document.pdf", extension: "pdf" };
}

export async function getAdminPortfolioDocument(portfolioId: string, kind: PortfolioDocumentKind, learningSpaceId?: string) {
  const database = await getDatabase();
  const result = await database.execute({ sql: `SELECT * FROM portfolios WHERE id = ?${learningSpaceId ? " AND learning_space_id = ?" : ""}`, args: learningSpaceId ? [portfolioId, learningSpaceId] : [portfolioId] });
  const portfolio = result.rows[0];
  if (!portfolio) return null;
  const columns = portfolioDocumentColumns(kind);
  const sourceId = nullableText(portfolio, columns.sourceId);
  const relativePath = nullableText(portfolio, columns.path);
  if (!sourceId && !relativePath) return null;
  return { learningSpaceId: text(portfolio, "learning_space_id"), sourceId: sourceId ?? relativePath!, fileName: (relativePath ?? "document.pdf").split("/").at(-1) ?? "document.pdf", extension: "pdf" };
}

function portfolioDocumentColumns(kind: PortfolioDocumentKind) {
  if (kind === "assignment") return { path: "assignment_pdf_path", sourceId: "assignment_pdf_source_id" } as const;
  if (kind === "hints") return { path: "hints_document_path", sourceId: "hints_document_source_id" } as const;
  return { path: "final_solutions_pdf_path", sourceId: "final_solutions_pdf_source_id" } as const;
}


export async function createErrorReport(input: { exerciseId: string; variant: "standard" | "alternative"; message: string; reporterName?: string; rateLimitKey: string }): Promise<void> {
  const exercise = await getVisibleExercise(input.exerciseId);
  if (!exercise || input.message.trim().length < 3 || input.message.trim().length > 2_000) throw new Error("De melding is ongeldig of de oplossing is niet beschikbaar.");
  const reporterName = input.reporterName?.trim() || null;
  if (reporterName && reporterName.length > 100) throw new Error("De naam mag maximaal 100 tekens bevatten.");
  const matchingAssets = exercise.assets.filter((asset) => asset.kind === input.variant);
  if (matchingAssets.length === 0) throw new Error("Deze oplossingsvariant bestaat niet.");
  const database = await getDatabase();
  const identifiers = await database.execute({ sql: "SELECT portfolio_id, section_id FROM exercises WHERE id = ?", args: [input.exerciseId] });
  const row = identifiers.rows[0];
  if (!row) throw new Error("Oefening niet gevonden.");
  const now = new Date();
  const windowStartedAt = new Date(Math.floor(now.getTime() / 600_000) * 600_000).toISOString();
  const current = await database.execute({ sql: "SELECT attempts FROM error_report_rate_limits WHERE key = ?", args: [input.rateLimitKey] });
  if (Number(current.rows[0]?.attempts ?? 0) >= 5) throw new Error("Probeer later opnieuw.");
  const snapshot = matchingAssets.map((asset) => ({ id: asset.id, fileName: asset.fileName, lastModifiedAt: asset.lastModifiedAt }));
  await database.batch([
    { sql: "DELETE FROM error_report_rate_limits WHERE window_started_at < ?", args: [new Date(now.getTime() - 3_600_000).toISOString()] },
    { sql: `INSERT INTO error_report_rate_limits (key, window_started_at, attempts) VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET attempts = error_report_rate_limits.attempts + 1, window_started_at = excluded.window_started_at`, args: [input.rateLimitKey, windowStartedAt] },
    { sql: `INSERT INTO error_reports (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, source_last_modified_at, message, reporter_name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'TODO', ?, ?)`, args: [randomUUID(), text(row, "portfolio_id"), text(row, "section_id"), input.exerciseId, input.variant, JSON.stringify(snapshot), matchingAssets.map((asset) => asset.lastModifiedAt).filter(Boolean).sort().at(-1) ?? null, input.message.trim(), reporterName, now.toISOString(), now.toISOString()] },
  ]);
}

export interface AdminErrorReport {
  id: string;
  portfolioId: string;
  portfolioCode: string;
  portfolioTitle: string;
  sectionTitle: string;
  exerciseId: string;
  exerciseCode: string;
  variant: string;
  message: string;
  reporterName: string | null;
  status: "TODO" | "DONE";
  pinned: boolean;
  adminNote: string;
  createdAt: string;
  completedAt: string | null;
  solutionConfiguredVisible: boolean;
  solutionStatus: EffectivePublication;
  solutionVisible: boolean;
}

export async function getOpenErrorReportCount(learningSpaceId?: string): Promise<number> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const result = await database.execute({ sql: "SELECT COUNT(*) AS count FROM error_reports JOIN portfolios ON portfolios.id = error_reports.portfolio_id WHERE error_reports.status = 'TODO' AND portfolios.learning_space_id = ?", args: [spaceId] });
  return Number(result.rows[0]?.count ?? 0);
}

export async function getAdminErrorReports(learningSpaceId?: string): Promise<AdminErrorReport[]> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const result = await database.execute({ sql: `SELECT error_reports.*, portfolios.portfolio_code, portfolios.title AS portfolio_title, portfolios.title_override,
    sections.title AS section_title, exercises.exercise_code, exercises.visibility_mode AS exercise_visibility_mode,
    exercises.publish_from AS exercise_publish_from, exercises.publish_until AS exercise_publish_until,
    sections.visibility_mode AS section_visibility_mode, sections.publication_limited AS section_publication_limited, sections.publish_from AS section_publish_from, sections.publish_until AS section_publish_until,
    portfolios.visible AS portfolio_visible, portfolios.publication_limited, portfolios.publish_from AS portfolio_publish_from, portfolios.publish_until AS portfolio_publish_until
    FROM error_reports JOIN portfolios ON portfolios.id = error_reports.portfolio_id JOIN sections ON sections.id = error_reports.section_id
    JOIN exercises ON exercises.id = error_reports.exercise_id WHERE portfolios.learning_space_id = ?`, args: [spaceId] });
  const now = new Date();
  return result.rows.map((row) => {
    const portfolioStatus = resolvePortfolioPublication({ visible: bool(row.portfolio_visible), limited: bool(row.publication_limited), publishFrom: nullableText(row, "portfolio_publish_from"), publishUntil: nullableText(row, "portfolio_publish_until") }, now);
    const sectionStatus = resolveChildPublication({ mode: childMode({ visibility_mode: row.section_visibility_mode }), limited: bool(row.section_publication_limited), publishFrom: nullableText(row, "section_publish_from"), publishUntil: nullableText(row, "section_publish_until") }, portfolioStatus, now);
    const solutionStatus = resolveChildPublication({ mode: childMode({ visibility_mode: row.exercise_visibility_mode }), limited: false, publishFrom: null, publishUntil: null }, sectionStatus, now);
    return { id: text(row, "id"), portfolioId: text(row, "portfolio_id"), portfolioCode: text(row, "portfolio_code"), portfolioTitle: nullableText(row, "title_override") ?? text(row, "portfolio_title"), sectionTitle: text(row, "section_title"), exerciseId: text(row, "exercise_id"), exerciseCode: text(row, "exercise_code"), variant: text(row, "variant_kind"), message: text(row, "message"), reporterName: nullableText(row, "reporter_name"), status: text(row, "status") === "DONE" ? "DONE" : "TODO", pinned: bool(row.pinned), adminNote: nullableText(row, "admin_note") ?? "", createdAt: text(row, "created_at"), completedAt: nullableText(row, "completed_at"), solutionConfiguredVisible: childMode({ visibility_mode: row.exercise_visibility_mode }) === "visible", solutionStatus, solutionVisible: solutionStatus.state === "visible" };
  });
}

export async function getErrorReportLearningSpaceId(id: string): Promise<string | null> {
  const row = (await (await getDatabase()).execute({
    sql: `SELECT portfolios.learning_space_id FROM error_reports
      JOIN portfolios ON portfolios.id = error_reports.portfolio_id WHERE error_reports.id = ?`,
    args: [id],
  })).rows[0];
  return row ? text(row, "learning_space_id") : null;
}

export async function setErrorReportStatus(id: string, status: "TODO" | "DONE"): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.execute({ sql: "UPDATE error_reports SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?", args: [status, status === "DONE" ? now : null, now, id] });
}

export async function toggleErrorReportPin(id: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE error_reports SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?", args: [new Date().toISOString(), id] });
}

export async function saveErrorReportNote(id: string, note: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE error_reports SET admin_note = ?, updated_at = ? WHERE id = ?", args: [note.slice(0, 4000), new Date().toISOString(), id] });
}

export async function deleteErrorReport(id: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "DELETE FROM error_reports WHERE id = ?", args: [id] });
}

export async function getOldDoneErrorReportCount(now = new Date(), learningSpaceId?: string): Promise<number> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const result = await database.execute({ sql: "SELECT COUNT(*) AS count FROM error_reports JOIN portfolios ON portfolios.id = error_reports.portfolio_id WHERE status = 'DONE' AND completed_at < ? AND portfolios.learning_space_id = ?", args: [cutoff, spaceId] });
  return Number(result.rows[0]?.count ?? 0);
}

export async function deleteOldDoneErrorReports(now = new Date(), learningSpaceId?: string): Promise<void> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  await database.execute({ sql: "DELETE FROM error_reports WHERE status = 'DONE' AND completed_at < ? AND portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)", args: [cutoff, spaceId] });
}
