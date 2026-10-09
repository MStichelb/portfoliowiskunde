import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_LOCAL_SOURCE_PATH } from "@/lib/app-config";
import type { DatabaseRow, InStatement } from "@/lib/database";
import { executeBatch, executeGuardedBatch, getDatabase } from "@/lib/database";
import type { IndexedPortfolio, IndexedSourceTheme } from "@/lib/domain";
import { listErrorReportExerciseIdentities, normalizeErrorReportExerciseCode } from "@/lib/error-report-exercise-code";
import { ErrorReportRateLimitError } from "@/lib/error-report-rate-limit";
import {
  exerciseLevelMetadata,
  validateExerciseLevelOverrideInput,
  type ExerciseLevelMetadata,
  type ExerciseLevelOverrideInput,
} from "@/lib/exercise-level";
import {
  DEFAULT_EXERCISE_LEVEL_PRESENTATION,
  exerciseLevelPresentationFromRows,
  validateExerciseLevelPresentation,
  type ExerciseLevelPresentation,
} from "@/lib/exercise-level-presentation";
import { canPermanentlyDeleteLearningSpace } from "@/lib/learning-space-lifecycle";
import type { IndexedLearningSpaceHeader } from "@/lib/learning-space-header";
import { getLearningSpaceTerminology, initialLearningSpaceDescription, normalizeCollectionTerminology, normalizeExerciseShortLabel, normalizeExerciseTerminology, normalizeSectionTerminology, normalizeThemeTerminology } from "@/lib/collection-terminology";
import { comparePortfolioIds, comparePortfolioRelativePaths, normalizeSectionCode, relativePathBelongsToDirectory } from "@/lib/parser";
import type { PortfolioCustomTextPosition } from "@/lib/portfolio-custom-message";
import type { ExerciseNotePosition } from "@/lib/exercise-note";
import { getUser, LEGACY_SUPERADMIN_USER_ID } from "@/lib/identity";
import { prepareCreationSourceProfile } from "@/lib/source-profiles";
import type { CreationProfileChoice } from "@/lib/learning-space-creation-wizard";
import type { SourceManifestEntry } from "@/lib/source-comparison";
import { getDefaultSourceProfileTemplate, prepareSourceProfileTemplateClone } from "@/lib/source-profile-templates";
import {
  availableSourceProfileName,
  rethrowUniqueNameConflict,
  SOURCE_PROFILE_NAME_CONFLICT_MESSAGE,
  SOURCE_PROFILE_NAME_UNIQUE_INDEX,
} from "@/lib/source-profile-name";
import {
  BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
  firstExerciseResourceBySemanticRole,
  firstSourceFileGlobalResourceBySemanticRole,
  parseStoredSourceProfileConfig,
  sortExerciseResources,
  sortGlobalResources,
  type ExerciseResourceConfig,
  type ExerciseResourceSemanticRole,
  type GlobalResourceConfig,
  type GlobalResourceFileRecognition,
  type GlobalResourceIcon,
  type GlobalResourceSemanticRole,
  type SourceProfileConfig,
} from "@/lib/source-profile-config";
import { getActiveSourceProfileConfigForLearningSpace, getSourceProfileIndexContextForLearningSpace } from "@/lib/source-profiles";
import { SourceConfigurationError, StaleSynchronizationError } from "@/lib/source-errors";
import { prepareSourceBindingWrites } from "@/lib/source-bindings";
import type { SourceEntityBinding } from "@/lib/source-identity";
import { requireActiveSubject } from "@/lib/subjects";
import { DEFAULT_LEARNING_SPACE_COLOR } from "@/lib/ui-colors";
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

export interface ExerciseResourceAsset {
  id: string;
  fileName: string;
  extension: string;
  step: number;
  lastModifiedAt: string | null;
  source: "solution" | "resource";
}

export interface ExerciseResource {
  id: string;
  kind: "source_file";
  label: string;
  icon: GlobalResourceIcon;
  semanticRole: ExerciseResourceSemanticRole;
  displayMode: ExerciseResourceConfig["displayMode"];
  legacyVariant: "standard" | "alternative" | null;
  available: boolean;
  assets: ExerciseResourceAsset[];
}

export interface AdminExercise extends ExerciseLevelMetadata {
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
  hasNote: boolean;
  noteLabel: string | null;
  customNote: string | null;
  notePosition: ExerciseNotePosition;
  resources: ExerciseResource[];
  assets: AdminAsset[];
}

export interface AdminSection {
  id: string;
  code: string;
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

export type PortfolioDocumentKind = "assignment" | "hints" | "final-solutions";

export interface PortfolioGlobalResource {
  id: string;
  kind: "source_file" | "external_link";
  label: string;
  icon: GlobalResourceIcon;
  semanticRole: GlobalResourceSemanticRole;
  documentKind: PortfolioDocumentKind | null;
  assetId: string | null;
  url: string | null;
  available: boolean;
  recognition?: GlobalResourceFileRecognition | null;
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
  globalResources: PortfolioGlobalResource[];
  learningSpaceId: string;
  themeId: string | null;
  themeName: string | null;
  cardColor: string;
  customText: string | null;
  customTextPosition: PortfolioCustomTextPosition;
  sections: AdminSection[];
  /** Direct exercises; sectioned exercises remain under sections. */
  exercises?: AdminExercise[];
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
  assignmentPdfPath: string | null;
  hintsDocumentPath: string | null;
  finalSolutionsPdfPath: string | null;
  globalResources: PortfolioGlobalResource[];
  exercises?: Array<{ id: string; code: string; visible: boolean; hasAlternativeSolution: boolean } & ExerciseLevelMetadata>;
  sections: Array<{
    id: string;
    code: string;
    title: string;
    exercises: Array<{ id: string; code: string; visible: boolean; hasAlternativeSolution: boolean } & ExerciseLevelMetadata>;
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
  subjectId: string;
  subjectName: string;
  subjectIsActive: boolean;
  themeLabelSingular?: string;
  themeLabelPlural?: string;
  sectionLabelSingular?: string;
  sectionLabelPlural?: string;
  collectionLabelSingular: string;
  collectionLabelPlural: string;
  exerciseLabelSingular: string;
  exerciseLabelPlural: string;
  exerciseLabelShort?: string;
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
  levelPresentation?: ExerciseLevelPresentation;
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
  subjectId: string;
  creationProfileChoice?: CreationProfileChoice;
  skipSourceOnCreation?: boolean;
  themeLabelSingular?: string;
  themeLabelPlural?: string;
  sectionLabelSingular?: string;
  sectionLabelPlural?: string;
  collectionLabelSingular?: string;
  collectionLabelPlural?: string;
  exerciseLabelSingular?: string;
  exerciseLabelPlural?: string;
  exerciseLabelShort?: string;
  name: string;
  slug: string;
  shortLabel: string;
  description?: string;
  cardColor?: string;
  sortOrder?: number;
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
  levelPresentation?: ExerciseLevelPresentation;
}

export interface Theme {
  id: string;
  learningSpaceId: string;
  name: string;
  sortOrder: number;
  sourceTheme?: IndexedSourceTheme & { scope: string };
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

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function groupBy<T>(items: readonly T[], keyFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(keyFor(item), [...(groups.get(keyFor(item)) ?? []), item]);
  return groups;
}

function indexedSectionId(portfolioId: string, sectionCode: string): string {
  return `${portfolioId}-section-${normalizeSectionCode(sectionCode)}`;
}

function indexedExerciseId(portfolioId: string, sectionId: string | null, code: string): string {
  return `${sectionId ?? portfolioId}-exercise-${code}`;
}

// Persistence contexts describe real parent relationships, never synthetic sections.
function indexedExerciseContexts(portfolio: IndexedPortfolio, portfolioId: string) {
  return [
    { sectionId: null as string | null, relativePath: portfolio.relativePath, exercises: portfolio.exercises ?? [] },
    ...portfolio.sections.map((section) => ({ sectionId: indexedSectionId(portfolioId, section.code),
      relativePath: section.relativePath, exercises: section.exercises })),
  ];
}

interface ExerciseOwnedMetadata {
  visible: number;
  visibilityMode: string;
  publishFrom: string | null;
  publishUntil: string | null;
  showAlternativeToStudents: number;
  customNote: string | null;
  noteLabel: string | null;
  notePosition: string;
  levelOverrideMode: string;
  levelOverride: string | null;
}

interface ExistingVariantRow {
  id: string;
  exerciseId: string;
  kind: string;
  label: string;
}

interface ExistingSolutionAssetRow {
  id: string;
  variantId: string;
  exerciseId: string;
  relativePath: string;
  sourceId: string;
  fileName: string;
  extension: string;
  step: number;
  variant: string;
  lastModifiedAt: string | null;
  sourceVersion: string | null;
  isIndexed: boolean;
}

const EXERCISE_SCANNER_COLUMNS = new Set([
  "id", "portfolio_id", "section_id", "exercise_code", "exercise_number", "exercise_suffix",
  "level_source", "is_indexed", "last_seen_at", "archived_at",
]);
const EXERCISE_OWNED_COLUMNS = new Set([
  "visible", "visibility_mode", "publish_from", "publish_until", "show_alternative_to_students",
  "custom_note", "note_label", "note_position", "level_override_mode", "level_override",
]);

function normalizeExerciseIdentityCode(value: string): string {
  return value.trim().toLocaleLowerCase("nl");
}

function exerciseCodeKey(portfolioId: string, code: string): string {
  return `${portfolioId}\u0000${normalizeExerciseIdentityCode(code)}`;
}

function exerciseMoveConflictWarning(path: string, code: string) {
  return {
    severity: "warning" as const,
    path,
    message: `Oefening ${code} komt in meerdere mogelijke onderdelen voor of bevat conflicterende beheergegevens. De oefening is niet automatisch verplaatst.`,
  };
}

function mergeExerciseOwnedMetadata(retained: DatabaseRow, duplicate: DatabaseRow): { metadata: ExerciseOwnedMetadata; conflicts: string[] } {
  const conflicts: string[] = [];
  const choose = <T>(field: string, retainedValue: T, duplicateValue: T, defaultValue: T): T => {
    if (Object.is(retainedValue, duplicateValue)) return retainedValue;
    if (Object.is(retainedValue, defaultValue)) return duplicateValue;
    if (Object.is(duplicateValue, defaultValue)) return retainedValue;
    conflicts.push(field);
    return retainedValue;
  };
  const retainedVisibility = `${bool(retained.visible) ? 1 : 0}\u0000${text(retained, "visibility_mode")}`;
  const duplicateVisibility = `${bool(duplicate.visible) ? 1 : 0}\u0000${text(duplicate, "visibility_mode")}`;
  const visibility = choose("visibility", retainedVisibility, duplicateVisibility, "1\u0000visible").split("\u0000");
  const retainedOverride = `${text(retained, "level_override_mode")}\u0000${nullableText(retained, "level_override") ?? ""}`;
  const duplicateOverride = `${text(duplicate, "level_override_mode")}\u0000${nullableText(duplicate, "level_override") ?? ""}`;
  const levelOverride = choose("level_override", retainedOverride, duplicateOverride, "inherit\u0000").split("\u0000");

  for (const key of new Set([...Object.keys(retained), ...Object.keys(duplicate)])) {
    if (EXERCISE_SCANNER_COLUMNS.has(key) || EXERCISE_OWNED_COLUMNS.has(key)) continue;
    if (!Object.is(retained[key] ?? null, duplicate[key] ?? null)) conflicts.push(key);
  }

  return {
    metadata: {
      visible: Number(visibility[0]),
      visibilityMode: visibility[1],
      publishFrom: choose("publish_from", nullableText(retained, "publish_from"), nullableText(duplicate, "publish_from"), null),
      publishUntil: choose("publish_until", nullableText(retained, "publish_until"), nullableText(duplicate, "publish_until"), null),
      showAlternativeToStudents: choose("show_alternative_to_students", bool(retained.show_alternative_to_students) ? 1 : 0, bool(duplicate.show_alternative_to_students) ? 1 : 0, 1),
      customNote: choose("custom_note", nullableText(retained, "custom_note"), nullableText(duplicate, "custom_note"), null),
      noteLabel: choose("note_label", nullableText(retained, "note_label"), nullableText(duplicate, "note_label"), null),
      notePosition: choose("note_position", text(retained, "note_position"), text(duplicate, "note_position"), "above_solution"),
      levelOverrideMode: levelOverride[0],
      levelOverride: levelOverride[1] || null,
    },
    conflicts: [...new Set(conflicts)],
  };
}

function hasAmbiguousSolutionMerge(
  retainedExerciseId: string,
  duplicateExerciseId: string,
  variants: readonly ExistingVariantRow[],
  assets: readonly ExistingSolutionAssetRow[],
): boolean {
  for (const kind of ["standard", "alternative"]) {
    const retainedVariant = variants.find((variant) => variant.exerciseId === retainedExerciseId && variant.kind === kind);
    const duplicateVariant = variants.find((variant) => variant.exerciseId === duplicateExerciseId && variant.kind === kind);
    if (!duplicateVariant) continue;
    const retainedAssets = retainedVariant ? assets.filter((asset) => asset.variantId === retainedVariant.id) : [];
    const duplicateAssets = assets.filter((asset) => asset.variantId === duplicateVariant.id);
    const retainedByLogicalKey = groupBy(retainedAssets, (asset) => `${asset.step}\u0000${asset.extension.toLowerCase()}`);
    const duplicateByLogicalKey = groupBy(duplicateAssets, (asset) => `${asset.step}\u0000${asset.extension.toLowerCase()}`);
    if ([...retainedByLogicalKey.values(), ...duplicateByLogicalKey.values()].some((group) => group.length > 1)) return true;
    for (const duplicateAsset of duplicateAssets) {
      const logicalKey = `${duplicateAsset.step}\u0000${duplicateAsset.extension.toLowerCase()}`;
      if (retainedAssets.some((asset) => asset.relativePath === duplicateAsset.relativePath
        && `${asset.step}\u0000${asset.extension.toLowerCase()}` !== logicalKey)) return true;
    }
  }
  return false;
}

function planSolutionAssetMerge(
  reconciliations: ReadonlyMap<string, { retainedId: string }>,
  variants: readonly ExistingVariantRow[],
  sourceAssets: readonly ExistingSolutionAssetRow[],
  archivedAt: string,
): { rows: ExistingSolutionAssetRow[]; statements: InStatement[] } {
  let rows = sourceAssets.map((asset) => ({ ...asset }));
  const statements: InStatement[] = [];
  for (const [duplicateExerciseId, { retainedId }] of reconciliations) {
    for (const kind of ["standard", "alternative"] as const) {
      const retainedVariantId = `${retainedId}-${kind}`;
      const retainedVariant = variants.find((variant) => variant.exerciseId === retainedId && variant.kind === kind);
      const duplicateVariant = variants.find((variant) => variant.exerciseId === duplicateExerciseId && variant.kind === kind);
      if (!duplicateVariant) continue;
      if (!retainedVariant) statements.push({
        sql: "INSERT INTO solution_variants (id, exercise_id, kind, label, is_indexed) VALUES (?, ?, ?, ?, 0)",
        args: [retainedVariantId, retainedId, kind, duplicateVariant.label],
      });
      const actualRetainedVariantId = retainedVariant?.id ?? retainedVariantId;
      const retainedAssets = rows.filter((asset) => asset.variantId === actualRetainedVariantId);
      const duplicateAssets = rows.filter((asset) => asset.variantId === duplicateVariant.id);
      for (const duplicateAsset of duplicateAssets) {
        const retainedAsset = retainedAssets.find((asset) => asset.step === duplicateAsset.step
          && asset.extension.toLowerCase() === duplicateAsset.extension.toLowerCase());
        if (retainedAsset) {
          statements.push(
            { sql: "DELETE FROM solution_assets WHERE id = ?", args: [duplicateAsset.id] },
            {
              sql: `UPDATE solution_assets SET relative_path = ?, source_id = ?, file_name = ?, extension = ?, step = ?,
                last_modified_at = ?, source_version = ?, is_indexed = ?, missing_since = NULL, archived_at = NULL WHERE id = ?`,
              args: [duplicateAsset.relativePath, duplicateAsset.sourceId, duplicateAsset.fileName, duplicateAsset.extension,
                duplicateAsset.step, duplicateAsset.lastModifiedAt, duplicateAsset.sourceVersion,
                duplicateAsset.isIndexed || retainedAsset.isIndexed ? 1 : 0, retainedAsset.id],
            },
          );
          rows = rows.filter((asset) => asset.id !== duplicateAsset.id).map((asset) => asset.id === retainedAsset.id ? {
            ...duplicateAsset,
            id: retainedAsset.id,
            variantId: actualRetainedVariantId,
            exerciseId: retainedId,
            isIndexed: duplicateAsset.isIndexed || retainedAsset.isIndexed,
          } : asset);
        } else {
          statements.push({ sql: "UPDATE solution_assets SET variant_id = ? WHERE id = ?", args: [actualRetainedVariantId, duplicateAsset.id] });
          rows = rows.map((asset) => asset.id === duplicateAsset.id
            ? { ...asset, variantId: actualRetainedVariantId, exerciseId: retainedId }
            : asset);
        }
      }
      statements.push({
        sql: "UPDATE solution_variants SET is_indexed = 0, archived_at = ? WHERE id = ?",
        args: [archivedAt, duplicateVariant.id],
      });
    }
  }
  return { rows, statements };
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

function learningSpaceFromRow(row: DatabaseRow, sources: LearningSpaceSource[], levelPresentation: ExerciseLevelPresentation): LearningSpace {
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
    id: text(row, "id"), subjectId: text(row, "subject_id"), subjectName: text(row, "subject_name"), subjectIsActive: bool(row.subject_is_active),
    themeLabelSingular: text(row, "theme_label_singular"), themeLabelPlural: text(row, "theme_label_plural"),
    sectionLabelSingular: text(row, "section_label_singular"), sectionLabelPlural: text(row, "section_label_plural"),
    collectionLabelSingular: text(row, "collection_label_singular"), collectionLabelPlural: text(row, "collection_label_plural"),
    exerciseLabelSingular: text(row, "exercise_label_singular"), exerciseLabelPlural: text(row, "exercise_label_plural"),
    exerciseLabelShort: text(row, "exercise_label_short"),
    name: text(row, "name"), slug: text(row, "slug"), shortLabel: text(row, "short_label"),
    description: text(row, "description"), cardColor: text(row, "card_color"),
    sortOrder: Number(row.sort_order), isActive: bool(row.is_active) && archivedAt === null, archivedAt,
    editorsCanManageAccess: bool(row.editors_can_manage_access), sourceType,
    localSourcePath: localSource?.localSourcePath ?? nullableText(row, "local_source_path"),
    oneDriveDriveId: oneDriveSource?.oneDriveDriveId ?? nullableText(row, "onedrive_drive_id"),
    oneDriveFolderId: oneDriveSource?.oneDriveFolderId ?? nullableText(row, "onedrive_folder_id"),
    oneDriveFolderPath: oneDriveSource?.oneDriveFolderPath ?? nullableText(row, "onedrive_folder_path"),
    googleDriveFolderId: googleDriveSource?.googleDriveFolderId ?? nullableText(row, "google_drive_folder_id"),
    googleDriveFolderLabel: googleDriveSource?.googleDriveFolderLabel ?? nullableText(row, "google_drive_folder_label"),
    sources, activeSourceId: activeSource?.id ?? null, primarySource, mirrorSource, levelPresentation,
  };
}

function storageSourceType(value: string): StorageSourceType {
  if (value === "onedrive" || value === "google_drive") return value;
  return "local";
}

export async function getLearningSpaces(activeOnly = false): Promise<LearningSpace[]> {
  const database = await getDatabase();
  const result = await database.execute(`${learningSpaceSelect()}${activeOnly ? " WHERE learning_spaces.is_active = 1 AND learning_spaces.archived_at IS NULL" : ""} ORDER BY learning_spaces.sort_order, learning_spaces.name`);
  return hydrateLearningSpaces(result.rows);
}

export async function getLearningSpaceBySlug(slug: string): Promise<LearningSpace | null> {
  const database = await getDatabase();
  const result = await database.execute({ sql: `${learningSpaceSelect()} WHERE learning_spaces.slug = ? AND learning_spaces.is_active = 1 AND learning_spaces.archived_at IS NULL`, args: [slug] });
  return (await hydrateLearningSpaces(result.rows))[0] ?? null;
}

export async function getAdminLearningSpaceBySlug(slug: string): Promise<LearningSpace | null> {
  const database = await getDatabase();
  const result = await database.execute({ sql: `${learningSpaceSelect()} WHERE learning_spaces.slug = ?`, args: [slug] });
  return (await hydrateLearningSpaces(result.rows))[0] ?? null;
}

export async function getLearningSpace(id: string): Promise<LearningSpace | null> {
  const database = await getDatabase();
  const result = await database.execute({ sql: `${learningSpaceSelect()} WHERE learning_spaces.id = ?`, args: [id] });
  return (await hydrateLearningSpaces(result.rows))[0] ?? null;
}

async function hydrateLearningSpaces(rows: DatabaseRow[]): Promise<LearningSpace[]> {
  if (rows.length === 0) return [];
  const database = await getDatabase();
  const [sourceRows, levelRows] = await Promise.all([
    database.execute("SELECT * FROM learning_space_sources ORDER BY learning_space_id, role"),
    database.execute("SELECT * FROM learning_space_level_presentations ORDER BY learning_space_id, level"),
  ]);
  const sourcesBySpace = new Map<string, LearningSpaceSource[]>();
  for (const row of sourceRows.rows) {
    const source = learningSpaceSourceFromRow(row);
    const sources = sourcesBySpace.get(source.learningSpaceId) ?? [];
    sources.push(source);
    sourcesBySpace.set(source.learningSpaceId, sources);
  }
  const levelRowsBySpace = new Map<string, DatabaseRow[]>();
  for (const row of levelRows.rows) {
    const learningSpaceId = text(row, "learning_space_id");
    const presentations = levelRowsBySpace.get(learningSpaceId) ?? [];
    presentations.push(row);
    levelRowsBySpace.set(learningSpaceId, presentations);
  }
  return rows.map((row) => {
    const id = text(row, "id");
    const presentationRows = levelRowsBySpace.get(id) ?? [];
    const levelPresentation = exerciseLevelPresentationFromRows(presentationRows.map((item) => ({
      level: item.level,
      displayName: item.display_name,
      symbolId: item.symbol_id,
      count: item.symbol_count,
      color: item.color,
      showPublicBackground: bool(item.show_public_background),
    })));
    return learningSpaceFromRow(row, sourcesBySpace.get(id) ?? [], levelPresentation);
  });
}

function learningSpaceSelect(): string {
  return `SELECT learning_spaces.*, subjects.name AS subject_name, subjects.is_active AS subject_is_active
    FROM learning_spaces JOIN subjects ON subjects.id = learning_spaces.subject_id`;
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
  await requireActiveSubject(input.subjectId);
  const themeTerminology = normalizeThemeTerminology({ singular: input.themeLabelSingular, plural: input.themeLabelPlural });
  const sectionTerminology = normalizeSectionTerminology({ singular: input.sectionLabelSingular, plural: input.sectionLabelPlural });
  const terminology = normalizeCollectionTerminology({ singular: input.collectionLabelSingular, plural: input.collectionLabelPlural });
  const exerciseTerminology = normalizeExerciseTerminology({ singular: input.exerciseLabelSingular, plural: input.exerciseLabelPlural });
  const exerciseLabelShort = normalizeExerciseShortLabel(input.exerciseLabelShort);
  const description = input.description?.trim() ? input.description : initialLearningSpaceDescription(terminology.plural, exerciseTerminology.plural);
  const now = new Date().toISOString();
  const id = stableId("space", input.slug);
  const profileOwnerUserId = ownerUserId ?? LEGACY_SUPERADMIN_USER_ID;
  let profileClone;
  if (input.creationProfileChoice) {
    const creator = ownerUserId ? await getUser(ownerUserId) : null;
    if (!creator) throw new Error("Een maker is vereist voor deze bronprofielkeuze.");
    profileClone = await prepareCreationSourceProfile(creator, id, input.creationProfileChoice, now);
  } else {
    const template = await getDefaultSourceProfileTemplate();
    const profileName = await availableSourceProfileName(profileOwnerUserId, template.name);
    profileClone = prepareSourceProfileTemplateClone({ ...template, name: profileName }, id, profileOwnerUserId, now);
  }
  const primary = input.primarySource ?? sourceFromLegacyInput(input);
  const mirror = input.mirrorSource ?? null;
  const levelPresentation = validateExerciseLevelPresentation(input.levelPresentation ?? DEFAULT_EXERCISE_LEVEL_PRESENTATION);
  const statements: InStatement[] = [{ sql: `INSERT INTO learning_spaces (id, subject_id, theme_label_singular, theme_label_plural, section_label_singular, section_label_plural, collection_label_singular, collection_label_plural, exercise_label_singular, exercise_label_plural, exercise_label_short, name, slug, short_label, description, card_color, sort_order, is_active, storage_provider, source_type,
    local_source_path, onedrive_drive_id, onedrive_folder_id, onedrive_folder_path, google_drive_folder_id, google_drive_folder_label, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM learning_spaces)), 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM subjects WHERE id = ? AND is_active = 1`, args: [id, input.subjectId, themeTerminology.singular, themeTerminology.plural, sectionTerminology.singular, sectionTerminology.plural, terminology.singular, terminology.plural, exerciseTerminology.singular, exerciseTerminology.plural, exerciseLabelShort, input.name, input.slug, input.shortLabel, description, input.cardColor ?? DEFAULT_LEARNING_SPACE_COLOR, input.sortOrder ?? null,
      legacyStorageProvider(primary.providerType), primary.providerType, primary.localSourcePath ?? null, primary.oneDriveDriveId ?? null,
      primary.oneDriveFolderId ?? null, primary.oneDriveFolderPath ?? null, primary.googleDriveFolderId ?? null, primary.googleDriveFolderLabel ?? null, now, now, input.subjectId] }];
  statements.push(...levelPresentationStatements(id, levelPresentation));
  statements.push(...profileClone.statements);
  if (!input.skipSourceOnCreation) statements.push(sourceUpsertStatement(id, "primary", primary, true, now));
  if (mirror) statements.push(sourceUpsertStatement(id, "mirror", mirror, false, now));
  if (ownerUserId) {
    statements.push({
      sql: "INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at) VALUES (?, ?, 'owner', ?, ?)",
      args: [id, ownerUserId, now, now],
    });
  }
  try {
    await executeBatch(statements);
  } catch (error) {
    await requireActiveSubject(input.subjectId);
    rethrowUniqueNameConflict(error, SOURCE_PROFILE_NAME_UNIQUE_INDEX, SOURCE_PROFILE_NAME_CONFLICT_MESSAGE);
  }
  return (await getLearningSpace(id))!;
}

export async function updateLearningSpace(id: string, input: LearningSpaceInput): Promise<void> {
  const existing = await getLearningSpace(id);
  if (!existing) throw new Error("Leeromgeving niet gevonden.");
  if (input.subjectId !== existing.subjectId) await requireActiveSubject(input.subjectId);
  const existingTerminology = getLearningSpaceTerminology(existing);
  const themeTerminology = normalizeThemeTerminology(
    { singular: input.themeLabelSingular, plural: input.themeLabelPlural }, existingTerminology.theme,
  );
  const sectionTerminology = normalizeSectionTerminology(
    { singular: input.sectionLabelSingular, plural: input.sectionLabelPlural }, existingTerminology.section,
  );
  const terminology = normalizeCollectionTerminology(
    { singular: input.collectionLabelSingular, plural: input.collectionLabelPlural },
    { singular: existing.collectionLabelSingular, plural: existing.collectionLabelPlural },
  );
  const exerciseTerminology = normalizeExerciseTerminology(
    { singular: input.exerciseLabelSingular, plural: input.exerciseLabelPlural },
    { singular: existing.exerciseLabelSingular, plural: existing.exerciseLabelPlural },
  );
  const exerciseLabelShort = normalizeExerciseShortLabel(input.exerciseLabelShort, existing.exerciseLabelShort);
  const primary = preserveStorageConnection(input.primarySource ?? sourceFromLegacyInput(input), existing.primarySource);
  const mirror = input.mirrorSource === undefined ? sourceToInput(existing.mirrorSource) : preserveStorageConnection(input.mirrorSource, existing.mirrorSource);
  if (existing.mirrorSource?.isActive && !mirror) throw new Error("Schakel eerst terug naar de primaire bron voordat je de actieve mirror verwijdert.");
  const active = existing.mirrorSource?.isActive ? mirror! : primary;
  const configured = [primary, mirror].filter((source): source is LearningSpaceSourceInput => Boolean(source));
  const local = configured.find((source) => source.providerType === "local");
  const oneDrive = configured.find((source) => source.providerType === "onedrive");
  const googleDrive = configured.find((source) => source.providerType === "google_drive");
  const levelPresentation = validateExerciseLevelPresentation(input.levelPresentation ?? existing.levelPresentation ?? DEFAULT_EXERCISE_LEVEL_PRESENTATION);
  const now = new Date().toISOString();
  const subjectAssignment = input.subjectId === existing.subjectId
    ? { sql: "?", args: [input.subjectId] }
    : { sql: "CASE WHEN EXISTS (SELECT 1 FROM subjects WHERE id = ? AND is_active = 1) THEN ? ELSE '__invalid-subject__' END", args: [input.subjectId, input.subjectId] };
  const statements: InStatement[] = [{ sql: `UPDATE learning_spaces SET subject_id = ${subjectAssignment.sql},
    theme_label_singular = ?, theme_label_plural = ?, section_label_singular = ?, section_label_plural = ?, collection_label_singular = ?, collection_label_plural = ?, exercise_label_singular = ?, exercise_label_plural = ?, exercise_label_short = ?, name = ?, slug = ?, short_label = ?, description = ?, card_color = ?, sort_order = ?, storage_provider = ?, source_type = ?,
    local_source_path = ?, onedrive_drive_id = ?, onedrive_folder_id = ?, onedrive_folder_path = ?, google_drive_folder_id = ?, google_drive_folder_label = ?, updated_at = ? WHERE id = ?`,
    args: [...subjectAssignment.args,
      themeTerminology.singular, themeTerminology.plural, sectionTerminology.singular, sectionTerminology.plural, terminology.singular, terminology.plural, exerciseTerminology.singular, exerciseTerminology.plural, exerciseLabelShort, input.name, input.slug, input.shortLabel, input.description ?? existing.description, input.cardColor ?? existing.cardColor, input.sortOrder ?? existing.sortOrder,
      legacyStorageProvider(active.providerType), active.providerType,
      local?.localSourcePath ?? existing.localSourcePath,
      oneDrive?.oneDriveDriveId ?? existing.oneDriveDriveId, oneDrive?.oneDriveFolderId ?? existing.oneDriveFolderId,
      oneDrive?.oneDriveFolderPath ?? existing.oneDriveFolderPath, googleDrive?.googleDriveFolderId ?? existing.googleDriveFolderId,
      googleDrive?.googleDriveFolderLabel ?? existing.googleDriveFolderLabel, now, id] }];
  statements.push(...levelPresentationStatements(id, levelPresentation));
  statements.push(sourceUpsertStatement(id, "primary", primary, existing.primarySource?.isActive ?? !existing.mirrorSource?.isActive, now));
  if (mirror) statements.push(sourceUpsertStatement(id, "mirror", mirror, existing.mirrorSource?.isActive ?? false, now));
  else statements.push({ sql: "DELETE FROM learning_space_sources WHERE learning_space_id = ? AND role = 'mirror' AND is_active = 0", args: [id] });
  try {
    await executeBatch(statements);
  } catch (error) {
    if (input.subjectId !== existing.subjectId) await requireActiveSubject(input.subjectId);
    throw error;
  }
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
    { sql: "DELETE FROM error_report_issues WHERE learning_space_id = ?", args: [id] },
    { sql: "DELETE FROM error_report_threads WHERE learning_space_id = ?", args: [id] },
    { sql: `DELETE FROM solution_assets WHERE variant_id IN (${variantIds})`, args: [id] },
    { sql: `DELETE FROM solution_variants WHERE exercise_id IN (${exerciseIds})`, args: [id] },
    { sql: `DELETE FROM exercises WHERE portfolio_id IN (${portfolioIds})`, args: [id] },
    { sql: `DELETE FROM sections WHERE portfolio_id IN (${portfolioIds})`, args: [id] },
    { sql: `DELETE FROM sync_warnings WHERE sync_run_id IN (${syncRunIds})`, args: [id] },
    { sql: "DELETE FROM sync_runs WHERE learning_space_id = ?", args: [id] },
    { sql: "DELETE FROM sync_leases WHERE learning_space_id = ?", args: [id] },
    { sql: `DELETE FROM portfolio_external_links WHERE portfolio_id IN (${portfolioIds})`, args: [id] },
    { sql: "DELETE FROM portfolios WHERE learning_space_id = ?", args: [id] },
    { sql: "DELETE FROM themes WHERE learning_space_id = ?", args: [id] },
    { sql: "DELETE FROM app_settings WHERE key = 'legacy_default_learning_space_id' AND value = ?", args: [id] },
    { sql: "DELETE FROM learning_space_sources WHERE learning_space_id = ?", args: [id] },
    // Older databases still RESTRICT this optional management-context reference.
    { sql: "UPDATE source_profiles SET management_learning_space_id = NULL WHERE management_learning_space_id = ?", args: [id] },
    { sql: "DELETE FROM learning_spaces WHERE id = ?", args: [id] },
  ]);
  return true;
}

export async function getThemes(learningSpaceId: string): Promise<Theme[]> {
  const database = await getDatabase();
  const result = await database.execute({ sql: "SELECT * FROM themes WHERE learning_space_id = ? ORDER BY sort_order, name", args: [learningSpaceId] });
  return result.rows.map((row) => ({
    id: text(row, "id"), learningSpaceId: text(row, "learning_space_id"), name: text(row, "name"), sortOrder: Number(row.sort_order),
    ...(row.source_scope != null ? { sourceTheme: { ...sourceThemeFromRow(row), scope: text(row, "source_scope") } } : {}),
  }));
}

function sourceThemeFromRow(row: DatabaseRow): IndexedSourceTheme {
  return { name: text(row, "source_folder_name"), relativePath: text(row, "source_relative_path"), sourceId: text(row, "source_id") };
}

export async function createTheme(learningSpaceId: string, name: string, sortOrder?: number): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  if (sortOrder !== undefined) {
    await database.execute({ sql: "INSERT INTO themes (id, learning_space_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", args: [randomUUID(), learningSpaceId, name, sortOrder, now, now] });
    return;
  }
  await database.execute({
    sql: `INSERT INTO themes (id, learning_space_id, name, sort_order, created_at, updated_at)
      SELECT ?, ?, ?, COALESCE(MAX(sort_order), 0) + 10, ?, ? FROM themes WHERE learning_space_id = ?`,
    args: [randomUUID(), learningSpaceId, name, now, now, learningSpaceId],
  });
}

function levelPresentationStatements(learningSpaceId: string, presentation: ExerciseLevelPresentation): InStatement[] {
  return Object.entries(presentation).map(([level, item]) => ({
    sql: `INSERT INTO learning_space_level_presentations (learning_space_id, level, display_name, symbol_id, symbol_count, color, show_public_background)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(learning_space_id, level) DO UPDATE SET display_name = excluded.display_name,
        symbol_id = excluded.symbol_id, symbol_count = excluded.symbol_count, color = excluded.color,
        show_public_background = excluded.show_public_background`,
    args: [learningSpaceId, level, item.displayName, item.symbolId, item.count, item.color, item.showPublicBackground ? 1 : 0],
  }));
}

export async function updateTheme(id: string, learningSpaceId: string, name: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE themes SET name = ?, updated_at = ? WHERE id = ? AND learning_space_id = ?", args: [name, new Date().toISOString(), id, learningSpaceId] });
}

export async function moveTheme(id: string, learningSpaceId: string, direction: "up" | "down"): Promise<boolean> {
  const themes = await getThemes(learningSpaceId);
  const currentIndex = themes.findIndex((theme) => theme.id === id);
  if (currentIndex < 0) return false;
  const targetIndex = currentIndex + (direction === "up" ? -1 : 1);
  if (targetIndex < 0 || targetIndex >= themes.length) return false;
  [themes[currentIndex], themes[targetIndex]] = [themes[targetIndex], themes[currentIndex]];
  const now = new Date().toISOString();
  await executeBatch(themes.map((theme, index) => ({
    sql: "UPDATE themes SET sort_order = ?, updated_at = ? WHERE id = ? AND learning_space_id = ?",
    args: [(index + 1) * 10, now, theme.id, learningSpaceId],
  })));
  return true;
}

export async function deleteTheme(id: string, learningSpaceId: string): Promise<void> {
  const theme = (await getThemes(learningSpaceId)).find((item) => item.id === id);
  if (theme?.sourceTheme) {
    throw new SourceConfigurationError("De thema-indeling wordt bepaald door de bronmappen. Pas de bronmappen aan om de indeling te wijzigen.");
  }
  await executeBatch([{ sql: "UPDATE portfolios SET theme_id = NULL WHERE theme_id = ? AND learning_space_id = ?", args: [id, learningSpaceId] }, { sql: "DELETE FROM themes WHERE id = ? AND learning_space_id = ?", args: [id, learningSpaceId] }]);
}

export async function setPortfolioTheme(id: string, learningSpaceId: string, themeId: string | null): Promise<void> {
  // Keep source membership intact while allowing the combined settings form to save its other fields.
  if ((await getActiveSourceProfileConfigForLearningSpace(learningSpaceId)).scanner.portfolio.themeMode === "folder") return;
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

export interface SyncPublicationSnapshot {
  learningSpaceId: string;
  sourceId: string;
  sourceUpdatedAt: string;
  sourceProviderType: StorageSourceType;
  sourceStorageConnectionId: string | null;
  sourceLocalPath: string | null;
  sourceOneDriveDriveId: string | null;
  sourceOneDriveFolderId: string | null;
  sourceOneDriveFolderPath: string | null;
  sourceGoogleDriveFolderId: string | null;
  sourceGoogleDriveFolderLabel: string | null;
  activeSourceId: string;
  sourceProfileId: string;
  sourceProfileAssignmentUpdatedAt: string;
  sourceProfileUpdatedAt: string;
  sourceProfileConfigVersion: number;
  sourceProfileConfigJson: string;
  sourceProfileConfig: SourceProfileConfig;
}

export async function getSyncPublicationSnapshot(
  learningSpaceId: string,
  sourceId: string,
): Promise<SyncPublicationSnapshot | null> {
  const row = (await (await getDatabase()).execute({
    sql: `SELECT learning_space_sources.id AS source_id, learning_space_sources.updated_at AS source_updated_at,
      learning_space_sources.provider_type AS source_provider_type,
      learning_space_sources.storage_connection_id AS source_storage_connection_id,
      learning_space_sources.local_source_path AS source_local_path,
      learning_space_sources.onedrive_drive_id AS source_onedrive_drive_id,
      learning_space_sources.onedrive_folder_id AS source_onedrive_folder_id,
      learning_space_sources.onedrive_folder_path AS source_onedrive_folder_path,
      learning_space_sources.google_drive_folder_id AS source_google_drive_folder_id,
      learning_space_sources.google_drive_folder_label AS source_google_drive_folder_label,
      active_source.id AS active_source_id, learning_space_source_profiles.source_profile_id,
      learning_space_source_profiles.updated_at AS source_profile_assignment_updated_at,
      source_profiles.updated_at AS source_profile_updated_at, source_profiles.config_version, source_profiles.config_json
      FROM learning_spaces
      INNER JOIN learning_space_sources ON learning_space_sources.learning_space_id = learning_spaces.id
        AND learning_space_sources.id = ?
      INNER JOIN learning_space_sources AS active_source ON active_source.learning_space_id = learning_spaces.id
        AND active_source.is_active = 1
      INNER JOIN learning_space_source_profiles ON learning_space_source_profiles.learning_space_id = learning_spaces.id
      INNER JOIN source_profiles ON source_profiles.id = learning_space_source_profiles.source_profile_id
        AND source_profiles.archived_at IS NULL
      WHERE learning_spaces.id = ? AND learning_spaces.is_active = 1 AND learning_spaces.archived_at IS NULL`,
    args: [sourceId, learningSpaceId],
  })).rows[0];
  if (!row) return null;
  const configVersion = Number(row.config_version);
  const configJson = text(row, "config_json");
  return {
    learningSpaceId,
    sourceId: text(row, "source_id"),
    sourceUpdatedAt: text(row, "source_updated_at"),
    sourceProviderType: storageSourceType(text(row, "source_provider_type")),
    sourceStorageConnectionId: nullableText(row, "source_storage_connection_id"),
    sourceLocalPath: nullableText(row, "source_local_path"),
    sourceOneDriveDriveId: nullableText(row, "source_onedrive_drive_id"),
    sourceOneDriveFolderId: nullableText(row, "source_onedrive_folder_id"),
    sourceOneDriveFolderPath: nullableText(row, "source_onedrive_folder_path"),
    sourceGoogleDriveFolderId: nullableText(row, "source_google_drive_folder_id"),
    sourceGoogleDriveFolderLabel: nullableText(row, "source_google_drive_folder_label"),
    activeSourceId: text(row, "active_source_id"),
    sourceProfileId: text(row, "source_profile_id"),
    sourceProfileAssignmentUpdatedAt: text(row, "source_profile_assignment_updated_at"),
    sourceProfileUpdatedAt: text(row, "source_profile_updated_at"),
    sourceProfileConfigVersion: configVersion,
    sourceProfileConfigJson: configJson,
    sourceProfileConfig: parseStoredSourceProfileConfig(configVersion, configJson),
  };
}

export interface SyncPublicationGuard {
  ownerId: string;
  leaseSeconds: number;
  snapshot: SyncPublicationSnapshot;
}

export interface PersistIndexOptions {
  sourceId?: string;
  activateSourceId?: string;
  mirrorCompletedAt?: string;
  header?: IndexedLearningSpaceHeader | null;
  publicationGuard?: SyncPublicationGuard;
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
  const writesExerciseLevelSource = !source || source.role === "primary";
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const warnings = [...portfolios.flatMap((portfolio) => portfolio.warnings)];
  const portfolioCodeCounts = new Map<string, number>();
  for (const portfolio of portfolios) portfolioCodeCounts.set(portfolio.code, (portfolioCodeCounts.get(portfolio.code) ?? 0) + 1);
  const indexablePortfolios = portfolios.filter((portfolio) => portfolioCodeCounts.get(portfolio.code) === 1);
  const profileConfig = options.publicationGuard?.snapshot.sourceProfileConfig
    ?? await getActiveSourceProfileConfigForLearningSpace(spaceId);
  const synchronizesThemes = profileConfig.scanner.portfolio.themeMode === "folder";
  const themeStatements: InStatement[] = [];
  const sourceThemeIds = new Map<string, string>();
  if (synchronizesThemes) {
    const themeSource = source ?? await getActiveLearningSpaceSource(spaceId);
    if (!themeSource) throw new Error("De synchronisatiebron voor thema's ontbreekt.");
    const scope = themeSource.id;
    const existingThemes = await getThemes(spaceId);
    const themesByReference = new Map(existingThemes
      .filter((theme) => theme.sourceTheme?.scope === scope)
      .map((theme) => [theme.sourceTheme!.sourceId, theme]));
    let sortOrder = Math.max(0, ...existingThemes.map((theme) => theme.sortOrder));
    for (const portfolio of portfolios) {
      const incoming = portfolio.sourceTheme;
      if (!incoming || sourceThemeIds.has(incoming.sourceId)) continue;
      const existing = themesByReference.get(incoming.sourceId);
      const id = existing?.id ?? randomUUID();
      sourceThemeIds.set(incoming.sourceId, id);
      if (!existing) {
        sortOrder += 10;
        themeStatements.push({
          sql: `INSERT INTO themes (id, learning_space_id, name, sort_order, created_at, updated_at,
            source_scope, source_id, source_folder_name, source_relative_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [id, spaceId, incoming.name, sortOrder, startedAt, startedAt, scope, incoming.sourceId, incoming.name, incoming.relativePath],
        });
      } else if (existing.sourceTheme!.name !== incoming.name || existing.sourceTheme!.relativePath !== incoming.relativePath) {
        themeStatements.push({
          sql: "UPDATE themes SET source_folder_name = ?, source_relative_path = ?, updated_at = ? WHERE id = ?",
          args: [incoming.name, incoming.relativePath, startedAt, id],
        });
      }
    }
  }
  const [existingAssets, existingVariants, existingResourceAssets, existingPortfolios, existingExercises, existingErrorThreads, existingErrorIssues] = await Promise.all([
    database.execute({ sql: `SELECT solution_assets.id, solution_assets.variant_id, solution_assets.relative_path, solution_assets.source_id,
      solution_assets.file_name, solution_assets.extension, solution_assets.step, solution_assets.last_modified_at, solution_assets.source_version,
      solution_assets.is_indexed, solution_assets.archived_at, solution_variants.kind, solution_variants.exercise_id
    FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
    JOIN exercises ON exercises.id = solution_variants.exercise_id JOIN portfolios ON portfolios.id = exercises.portfolio_id
    WHERE portfolios.learning_space_id = ?`, args: [spaceId] }),
    database.execute({ sql: `SELECT solution_variants.id, solution_variants.exercise_id, solution_variants.kind, solution_variants.label,
      solution_variants.is_indexed, solution_variants.archived_at
      FROM solution_variants JOIN exercises ON exercises.id = solution_variants.exercise_id
      JOIN portfolios ON portfolios.id = exercises.portfolio_id WHERE portfolios.learning_space_id = ?`, args: [spaceId] }),
    database.execute({ sql: `SELECT id, portfolio_id, exercise_id, resource_scope, resource_id,
      source_id, relative_path, file_name, extension, step, source_version, is_indexed, archived_at
      FROM source_resource_assets WHERE learning_space_id = ?`, args: [spaceId] }),
    database.execute({ sql: "SELECT id, portfolio_code FROM portfolios WHERE learning_space_id = ?", args: [spaceId] }),
    database.execute({ sql: `SELECT exercises.* FROM exercises JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE portfolios.learning_space_id = ?`, args: [spaceId] }),
    database.execute({ sql: "SELECT id, exercise_id FROM error_report_threads WHERE learning_space_id = ?", args: [spaceId] }),
    database.execute({ sql: `SELECT id, exercise_id, document_kind, variant_kind FROM error_report_issues
      WHERE learning_space_id = ?`, args: [spaceId] }),
  ]);
  const portfolioIds = new Map(existingPortfolios.rows.map((row) => [text(row, "portfolio_code"), text(row, "id")]));
  const legacyDefaultSpaceId = await getSetting("legacy_default_learning_space_id");
  const resolvedPortfolioIds = new Map(indexablePortfolios.map((portfolio) => [
    portfolio.code,
    portfolioIds.get(portfolio.code) ?? (legacyDefaultSpaceId === spaceId ? `portfolio-${portfolio.code}` : stableId("portfolio", spaceId, portfolio.code)),
  ]));
  const bindingSource = indexablePortfolios.some((portfolio) => portfolio.sourceIdentityContext)
    ? source ?? await getActiveLearningSpaceSource(spaceId) : null;
  const bindings: SourceEntityBinding[] = [];
  for (const portfolio of indexablePortfolios) {
    const identity = portfolio.sourceIdentityContext;
    if (!identity) continue; // Legacy/unbound records remain valid; no inferred backfill.
    if (!bindingSource || bindingSource.learningSpaceId !== spaceId || bindingSource.providerType !== providerType
      || identity.providerType !== providerType) throw new SourceConfigurationError("De bronidentiteit hoort niet bij de ingestelde synchronisatiebron.");
    const context = { ...identity, learningSpaceId: spaceId, configuredSourceId: bindingSource.id };
    const portfolioId = resolvedPortfolioIds.get(portfolio.code)!;
    if (portfolio.sourceId) bindings.push({ ...context, nativeItemId: portfolio.sourceId,
      entityType: "portfolio", entityId: portfolioId, portfolioId });
    for (const section of portfolio.sections) {
      if (section.sourceId) bindings.push({ ...context, nativeItemId: section.sourceId,
        entityType: "section", entityId: indexedSectionId(portfolioId, section.code), portfolioId });
    }
  }
  const bindingStatements = await prepareSourceBindingWrites(database, spaceId, bindings, startedAt);
  const existingExerciseRows = existingExercises.rows.map((row) => ({
    row,
    id: text(row, "id"),
    portfolioId: text(row, "portfolio_id"),
    sectionId: nullableText(row, "section_id"),
    code: text(row, "exercise_code"),
    isIndexed: bool(row.is_indexed),
    archivedAt: nullableText(row, "archived_at"),
  }));
  const existingExercisesById = new Map(existingExerciseRows.map((exercise) => [exercise.id, exercise]));
  const incomingExerciseLocations = new Map<string, string>();
  for (const portfolio of indexablePortfolios) {
    const portfolioId = resolvedPortfolioIds.get(portfolio.code)!;
    for (const context of indexedExerciseContexts(portfolio, portfolioId)) {
      for (const exercise of context.exercises) {
        const codeKey = exerciseCodeKey(portfolioId, exercise.code);
        const previousLocation = incomingExerciseLocations.get(codeKey);
        if (previousLocation !== undefined) {
          throw new SourceConfigurationError(
            `Oefeningscode ${exercise.code} komt meerdere keren voor binnen portfolio ${portfolio.code}: ${previousLocation} en ${context.relativePath}. Verplaats de volledige oefening naar één onderdeel of rechtstreeks naar de portfoliomap.`,
          );
        }
        incomingExerciseLocations.set(codeKey, context.relativePath);
      }
    }
  }
  const exerciseResolutions = new Map<string, string>();
  const duplicateExerciseResolutions = new Map<string, { retainedId: string; metadata: ExerciseOwnedMetadata }>();
  const existingVariantRows = existingVariants.rows.map((row) => ({
    id: text(row, "id"), exerciseId: text(row, "exercise_id"), kind: text(row, "kind"), label: text(row, "label"),
  }));
  const rawSolutionAssetRows = existingAssets.rows.map((row) => ({
    id: text(row, "id"), variantId: text(row, "variant_id"), exerciseId: text(row, "exercise_id"),
    relativePath: text(row, "relative_path"), sourceId: text(row, "source_id"), fileName: text(row, "file_name"),
    extension: text(row, "extension"), step: Number(row.step), variant: text(row, "kind"),
    lastModifiedAt: nullableText(row, "last_modified_at"), sourceVersion: nullableText(row, "source_version"), isIndexed: bool(row.is_indexed),
  }));
  const errorThreadExerciseIds = new Set(existingErrorThreads.rows.map((row) => nullableText(row, "exercise_id")).filter((id): id is string => id !== null));
  const errorIssueKeysByExercise = groupBy(existingErrorIssues.rows.filter((row) => nullableText(row, "exercise_id") !== null).map((row) => ({
    exerciseId: text(row, "exercise_id"), key: `${text(row, "document_kind")}\u0000${nullableText(row, "variant_kind") ?? ""}`,
  })), (issue) => issue.exerciseId);

  // Existing sectioned IDs are unchanged; direct exercises use portfolio ID + exercise code.
  // A unique same-code candidate may safely retain identity across a section move; ambiguous candidates never trigger
  // content/path-based guessing and therefore fall back to the new deterministic ID with a warning.
  for (const portfolio of indexablePortfolios) {
    const portfolioId = resolvedPortfolioIds.get(portfolio.code)!;
    for (const context of indexedExerciseContexts(portfolio, portfolioId)) {
      for (const exercise of context.exercises) {
        const desiredId = indexedExerciseId(portfolioId, context.sectionId, exercise.code);
        const exact = existingExercisesById.get(desiredId);
        const candidates = existingExerciseRows.filter((candidate) => candidate.portfolioId === portfolioId
          && normalizeExerciseIdentityCode(candidate.code) === normalizeExerciseIdentityCode(exercise.code)
          && candidate.archivedAt === null && candidate.id !== exact?.id);
        if (!exact) {
          if (candidates.length === 1) exerciseResolutions.set(desiredId, candidates[0].id);
          else {
            exerciseResolutions.set(desiredId, desiredId);
            if (candidates.length > 1) warnings.push(exerciseMoveConflictWarning(context.relativePath, exercise.code));
          }
          continue;
        }

        const missingCandidates = candidates.filter((candidate) => !candidate.isIndexed);
        if (!exact.isIndexed || missingCandidates.length === 0) {
          exerciseResolutions.set(desiredId, exact.id);
          continue;
        }
        if (missingCandidates.length !== 1) {
          exerciseResolutions.set(desiredId, exact.id);
          if (missingCandidates.length > 1) warnings.push(exerciseMoveConflictWarning(context.relativePath, exercise.code));
          continue;
        }

        const retained = missingCandidates[0];
        const metadataMerge = mergeExerciseOwnedMetadata(retained.row, exact.row);
        const retainedIssueKeys = new Set((errorIssueKeysByExercise.get(retained.id) ?? []).map((issue) => issue.key));
        const duplicateIssueKeys = (errorIssueKeysByExercise.get(exact.id) ?? []).map((issue) => issue.key);
        const hasErrorReportConflict = (errorThreadExerciseIds.has(retained.id) && errorThreadExerciseIds.has(exact.id))
          || duplicateIssueKeys.some((key) => retainedIssueKeys.has(key));
        const hasSolutionConflict = hasAmbiguousSolutionMerge(retained.id, exact.id, existingVariantRows, rawSolutionAssetRows);
        if (metadataMerge.conflicts.length > 0 || hasErrorReportConflict || hasSolutionConflict) {
          exerciseResolutions.set(desiredId, exact.id);
          warnings.push(exerciseMoveConflictWarning(context.relativePath, exercise.code));
          continue;
        }
        exerciseResolutions.set(desiredId, retained.id);
        duplicateExerciseResolutions.set(exact.id, { retainedId: retained.id, metadata: metadataMerge.metadata });
      }
    }
  }

  const resolvedExerciseId = (portfolioId: string, sectionId: string | null, exerciseCode: string) => {
    const desiredId = indexedExerciseId(portfolioId, sectionId, exerciseCode);
    return exerciseResolutions.get(desiredId) ?? desiredId;
  };
  const movedExerciseTargetSections = new Map<string, string | null>();
  for (const portfolio of indexablePortfolios) {
    const portfolioId = resolvedPortfolioIds.get(portfolio.code)!;
    for (const context of indexedExerciseContexts(portfolio, portfolioId)) {
      const targetSectionId = context.sectionId;
      for (const exercise of context.exercises) {
        const exerciseId = resolvedExerciseId(portfolioId, targetSectionId, exercise.code);
        const existingExercise = existingExercisesById.get(exerciseId);
        if (existingExercise && existingExercise.sectionId !== targetSectionId) movedExerciseTargetSections.set(exerciseId, targetSectionId);
      }
    }
  }
  const assetKey = (variantId: string, relativePath: string) => `${variantId}\u0000${relativePath}`;
  const solutionAssetLogicalKey = (variantId: string, step: number, extension: string) => `${variantId}\u0000${step}\u0000${extension.toLowerCase()}`;
  const resourceAssetExactKey = (scope: string, resourceId: string, sourceAssetId: string) => `${scope}\u0000${resourceId}\u0000${sourceAssetId}`;
  const resourceAssetLogicalKey = (scope: string, parentId: string, resourceId: string, step: number, extension: string) =>
    `${scope}\u0000${parentId}\u0000${resourceId}\u0000${step}\u0000${extension.toLowerCase()}`;
  const solutionMergePlan = planSolutionAssetMerge(duplicateExerciseResolutions, existingVariantRows, rawSolutionAssetRows, startedAt);
  const existingSolutionAssetRows = solutionMergePlan.rows;
  const activeSolutionAssetRows = existingSolutionAssetRows.filter((asset) => asset.isIndexed);
  const existingAssetVersions = new Map(activeSolutionAssetRows.map((asset) => [assetKey(asset.variantId, asset.relativePath), asset]));
  const existingSolutionAssetsByPathKey = new Map(existingSolutionAssetRows.map((asset) => [assetKey(asset.variantId, asset.relativePath), asset]));
  const existingSolutionAssetsByLogicalKey = groupBy(activeSolutionAssetRows, (asset) => solutionAssetLogicalKey(asset.variantId, asset.step, asset.extension));
  const existingResourceAssetRows = existingResourceAssets.rows.map((row) => ({
    id: text(row, "id"), portfolioId: text(row, "portfolio_id"), exerciseId: nullableText(row, "exercise_id"),
    scope: text(row, "resource_scope"), resourceId: text(row, "resource_id"), sourceId: text(row, "source_id"),
    relativePath: text(row, "relative_path"), fileName: text(row, "file_name"), extension: text(row, "extension"),
    step: Number(row.step), sourceVersion: nullableText(row, "source_version"), isIndexed: bool(row.is_indexed),
    archivedAt: nullableText(row, "archived_at"),
  })).map((asset) => ({
    ...asset,
    exerciseId: asset.exerciseId ? duplicateExerciseResolutions.get(asset.exerciseId)?.retainedId ?? asset.exerciseId : null,
  }));
  const existingResourceAssetsByExactKey = new Map(existingResourceAssetRows.map((asset) => [resourceAssetExactKey(asset.scope, asset.resourceId, asset.sourceId), asset]));
  const activeResourceAssetsByExactKey = new Map(existingResourceAssetRows.filter((asset) => asset.isIndexed).map((asset) => [resourceAssetExactKey(asset.scope, asset.resourceId, asset.sourceId), asset]));
  const existingResourceAssetsByLogicalKey = groupBy(existingResourceAssetRows.filter((asset) => asset.isIndexed), (asset) => resourceAssetLogicalKey(
    asset.scope, asset.scope === "portfolio" ? asset.portfolioId : asset.exerciseId ?? "", asset.resourceId, asset.step, asset.extension,
  ));
  const incomingSolutionAssetCounts = new Map<string, number>();
  const incomingSolutionPathCounts = new Map<string, number>();
  const incomingResourceAssetCounts = new Map<string, number>();
  const incomingResourceExactCounts = new Map<string, number>();
  for (const portfolio of indexablePortfolios) {
    const portfolioId = resolvedPortfolioIds.get(portfolio.code)!;
    for (const asset of portfolio.resourceAssets) {
      incrementCount(incomingResourceAssetCounts, resourceAssetLogicalKey("portfolio", portfolioId, asset.resourceId, 1, asset.extension));
      incrementCount(incomingResourceExactCounts, resourceAssetExactKey("portfolio", asset.resourceId, asset.sourceId));
    }
    for (const context of indexedExerciseContexts(portfolio, portfolioId)) {
      const sectionId = context.sectionId;
      for (const exercise of context.exercises) {
        const exerciseId = resolvedExerciseId(portfolioId, sectionId, exercise.code);
        for (const asset of exercise.assets) {
          incrementCount(incomingResourceAssetCounts, resourceAssetLogicalKey("exercise", exerciseId, asset.resourceId, asset.parsed.step, asset.parsed.extension));
          incrementCount(incomingResourceExactCounts, resourceAssetExactKey("exercise", asset.resourceId, asset.sourceId));
          if (asset.legacyVariant) {
            const variantId = `${exerciseId}-${asset.legacyVariant}`;
            incrementCount(incomingSolutionAssetCounts, solutionAssetLogicalKey(variantId, asset.parsed.step, asset.parsed.extension));
            incrementCount(incomingSolutionPathCounts, assetKey(variantId, asset.relativePath));
          }
        }
      }
    }
  }
  const seenAssetKeys = new Set<string>();
  const seenResourceAssetIds = new Set<string>();
  const publishedGenericExercisePaths = new Set<string>();
  const seenVariantIds = new Set<string>();
  const reconciledSolutionAssetIds = new Set<string>();
  const reconciledResourceAssetIds = new Set<string>();
  const reportedResourceConflicts = new Set<string>();
  const reportedSolutionConflicts = new Set<string>();
  const resourceReconciliationCandidate = (exactKey: string, logicalKey: string) => {
    if ((incomingResourceExactCounts.get(exactKey) ?? 0) > 1) return { kind: "conflict" as const };
    if (activeResourceAssetsByExactKey.has(exactKey) || incomingResourceAssetCounts.get(logicalKey) !== 1) return null;
    const candidates = (existingResourceAssetsByLogicalKey.get(logicalKey) ?? []).filter((asset) => !reconciledResourceAssetIds.has(asset.id));
    if (candidates.length !== 1) return candidates.length > 1 ? { kind: "conflict" as const } : null;
    const candidate = candidates[0];
    const occupied = existingResourceAssetsByExactKey.get(exactKey);
    if (!occupied || occupied.id === candidate.id) return { kind: "reconcile" as const, candidate, stale: null };
    const occupiedLogicalKey = resourceAssetLogicalKey(
      occupied.scope, occupied.scope === "portfolio" ? occupied.portfolioId : occupied.exerciseId ?? "",
      occupied.resourceId, occupied.step, occupied.extension,
    );
    if (occupied.isIndexed || occupiedLogicalKey !== logicalKey) return { kind: "conflict" as const };
    return { kind: "reconcile" as const, candidate, stale: occupied };
  };
  const reportResourceConflict = (exactKey: string, path: string) => {
    if (reportedResourceConflicts.has(exactKey)) return;
    reportedResourceConflicts.add(exactKey);
    warnings.push({
      severity: "warning",
      path,
      message: "Dezelfde bronidentiteit hoort bij meerdere mogelijke onderdelen. Het bestand is niet automatisch gekoppeld.",
    });
  };
  const solutionReconciliationCandidate = (pathKey: string, logicalKey: string) => {
    if ((incomingSolutionPathCounts.get(pathKey) ?? 0) > 1) return { kind: "conflict" as const };
    if (existingAssetVersions.has(pathKey)) return null;
    const occupied = existingSolutionAssetsByPathKey.get(pathKey);
    if (occupied && solutionAssetLogicalKey(occupied.variantId, occupied.step, occupied.extension) !== logicalKey) {
      return { kind: "conflict" as const };
    }
    if (incomingSolutionAssetCounts.get(logicalKey) !== 1) return null;
    const candidates = (existingSolutionAssetsByLogicalKey.get(logicalKey) ?? [])
      .filter((asset) => !reconciledSolutionAssetIds.has(asset.id));
    if (candidates.length !== 1) return candidates.length > 1 ? { kind: "conflict" as const } : null;
    const candidate = candidates[0];
    if (!occupied || occupied.id === candidate.id) return { kind: "reconcile" as const, candidate, stale: null };
    if (occupied.isIndexed) return { kind: "conflict" as const };
    return { kind: "reconcile" as const, candidate, stale: occupied };
  };
  const reportSolutionConflict = (pathKey: string, path: string) => {
    if (reportedSolutionConflicts.has(pathKey)) return;
    reportedSolutionConflicts.add(pathKey);
    warnings.push({
      severity: "warning",
      path,
      message: "De uitwerking hoort bij meerdere mogelijke historische bestanden. Het bestand is niet automatisch gekoppeld.",
    });
  };
  let added = 0;
  let updated = 0;

  const statements: InStatement[] = [
    ...themeStatements,
    {
      sql: `INSERT INTO sync_runs (id, learning_space_id, source_id, started_at, portfolio_count, warning_count, status, provider_type)
        VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
      args: [runId, spaceId, sourceId ?? null, startedAt, indexablePortfolios.length, warnings.length, providerType],
    },
    { sql: "UPDATE portfolios SET is_indexed = 0 WHERE learning_space_id = ?", args: [spaceId] },
    { sql: "UPDATE sections SET is_indexed = 0 WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)", args: [spaceId] },
    { sql: "UPDATE exercises SET is_indexed = 0 WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)", args: [spaceId] },
    { sql: "UPDATE solution_variants SET is_indexed = 0 WHERE exercise_id IN (SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?))", args: [spaceId] },
    { sql: "UPDATE solution_assets SET is_indexed = 0 WHERE variant_id IN (SELECT id FROM solution_variants WHERE exercise_id IN (SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)))", args: [spaceId] },
    { sql: "UPDATE source_resource_assets SET is_indexed = 0 WHERE learning_space_id = ?", args: [spaceId] },
  ];
  statements.push(...solutionMergePlan.statements);
  for (const [duplicateId, reconciliation] of duplicateExerciseResolutions) {
    statements.push(
      { sql: "UPDATE source_resource_assets SET exercise_id = ? WHERE exercise_id = ?", args: [reconciliation.retainedId, duplicateId] },
      { sql: "UPDATE error_report_threads SET exercise_id = ? WHERE exercise_id = ?", args: [reconciliation.retainedId, duplicateId] },
      { sql: "UPDATE error_report_issues SET exercise_id = ? WHERE exercise_id = ?", args: [reconciliation.retainedId, duplicateId] },
      { sql: "UPDATE error_reports SET exercise_id = ? WHERE exercise_id = ?", args: [reconciliation.retainedId, duplicateId] },
      {
        sql: `UPDATE exercises SET visible = ?, visibility_mode = ?, publish_from = ?, publish_until = ?,
          show_alternative_to_students = ?, custom_note = ?, note_label = ?, note_position = ?,
          level_override_mode = ?, level_override = ? WHERE id = ?`,
        args: [reconciliation.metadata.visible, reconciliation.metadata.visibilityMode,
          reconciliation.metadata.publishFrom, reconciliation.metadata.publishUntil,
          reconciliation.metadata.showAlternativeToStudents, reconciliation.metadata.customNote,
          reconciliation.metadata.noteLabel, reconciliation.metadata.notePosition,
          reconciliation.metadata.levelOverrideMode, reconciliation.metadata.levelOverride,
          reconciliation.retainedId],
      },
      {
        sql: "UPDATE exercises SET exercise_code = ?, is_indexed = 0, archived_at = ? WHERE id = ?",
        args: [`__reconciled__${duplicateId}`, startedAt, duplicateId],
      },
    );
  }
  if (Object.hasOwn(options, "header")) {
    statements.push({ sql: "DELETE FROM learning_space_header_assets WHERE learning_space_id = ?", args: [spaceId] });
    if (options.header) {
      if (!source || source.role !== "primary") throw new Error("De LearningSpace-header moet uit de primaire bron komen.");
      statements.push({
        sql: `INSERT INTO learning_space_header_assets
          (id, learning_space_id, learning_space_source_id, source_id, relative_path, file_name, extension,
            last_modified_at, source_version, indexed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [stableId("learning-space-header", spaceId), spaceId, source.id, options.header.sourceId,
          options.header.relativePath, options.header.fileName, options.header.extension,
          options.header.lastModifiedAt, options.header.sourceVersion, startedAt],
      });
    }
  }

  for (const portfolio of indexablePortfolios) {
    const portfolioId = resolvedPortfolioIds.get(portfolio.code)!;
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

    if (synchronizesThemes) {
      const themeId = portfolio.sourceTheme ? sourceThemeIds.get(portfolio.sourceTheme.sourceId)! : null;
      statements.push(themeId ? {
        sql: "UPDATE portfolios SET theme_id = ? WHERE id = ? AND (theme_id IS NULL OR theme_id <> ?)",
        args: [themeId, portfolioId, themeId],
      } : {
        sql: "UPDATE portfolios SET theme_id = NULL WHERE id = ? AND theme_id IS NOT NULL",
        args: [portfolioId],
      });
    }

    for (const resourceAsset of portfolio.resourceAssets) {
      const resourceAssetId = stableId("source-resource-asset", spaceId, "portfolio", resourceAsset.resourceId, resourceAsset.sourceId);
      const logicalKey = resourceAssetLogicalKey("portfolio", portfolioId, resourceAsset.resourceId, 1, resourceAsset.extension);
      const exactKey = resourceAssetExactKey("portfolio", resourceAsset.resourceId, resourceAsset.sourceId);
      const reconciliation = resourceReconciliationCandidate(exactKey, logicalKey);
      if (reconciliation?.kind === "conflict") {
        reportResourceConflict(exactKey, resourceAsset.relativePath);
        continue;
      }
      if (reconciliation?.kind === "reconcile") {
        reconciledResourceAssetIds.add(reconciliation.candidate.id);
        seenResourceAssetIds.add(reconciliation.candidate.id);
        updated += 1;
        if (reconciliation.stale) statements.push({
          sql: "DELETE FROM source_resource_assets WHERE id = ? AND is_indexed = 0",
          args: [reconciliation.stale.id],
        });
        statements.push({
          sql: `UPDATE source_resource_assets SET portfolio_id = ?, exercise_id = NULL, semantic_role = ?, source_id = ?,
            relative_path = ?, file_name = ?, extension = ?, step = 1, last_modified_at = ?, source_version = ?,
            is_indexed = 1, missing_since = NULL, archived_at = NULL, last_seen_at = ? WHERE id = ?`,
          args: [portfolioId, resourceAsset.semanticRole, resourceAsset.sourceId, resourceAsset.relativePath, resourceAsset.fileName,
            resourceAsset.extension, resourceAsset.lastModifiedAt, resourceAsset.sourceVersion, startedAt, reconciliation.candidate.id],
        });
      } else {
        const previous = activeResourceAssetsByExactKey.get(exactKey);
        seenResourceAssetIds.add(existingResourceAssetsByExactKey.get(exactKey)?.id ?? resourceAssetId);
        if (!previous) added += 1;
        else if (previous.sourceVersion !== resourceAsset.sourceVersion) updated += 1;
        statements.push({
          sql: `INSERT INTO source_resource_assets (id, learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id,
            semantic_role, source_id, relative_path, file_name, extension, step, last_modified_at, source_version, is_indexed,
            missing_since, archived_at, last_seen_at)
            VALUES (?, ?, ?, NULL, 'portfolio', ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, NULL, NULL, ?)
            ON CONFLICT(learning_space_id, resource_scope, resource_id, source_id) DO UPDATE SET
              portfolio_id = excluded.portfolio_id, exercise_id = NULL, semantic_role = excluded.semantic_role,
              relative_path = excluded.relative_path, file_name = excluded.file_name, extension = excluded.extension,
              step = 1, last_modified_at = excluded.last_modified_at, source_version = excluded.source_version,
              is_indexed = 1, missing_since = NULL, archived_at = NULL, last_seen_at = excluded.last_seen_at`,
          args: [resourceAssetId, spaceId, portfolioId, resourceAsset.resourceId, resourceAsset.semanticRole, resourceAsset.sourceId,
            resourceAsset.relativePath, resourceAsset.fileName, resourceAsset.extension, resourceAsset.lastModifiedAt,
            resourceAsset.sourceVersion, startedAt],
        });
      }
    }

    for (const section of portfolio.sections) {
      const sectionId = indexedSectionId(portfolioId, section.code);
      statements.push({
        sql: `INSERT INTO sections (id, portfolio_id, section_code, sort_order, title, relative_path, visibility_mode, is_indexed, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?, 'visible', 1, ?)
          ON CONFLICT(id) DO UPDATE SET section_code = excluded.section_code, sort_order = excluded.sort_order,
            title = excluded.title, relative_path = excluded.relative_path,
            is_indexed = 1, archived_at = NULL, last_seen_at = excluded.last_seen_at`,
        args: [sectionId, portfolioId, section.code, section.sortOrder, section.title, section.relativePath, startedAt],
      });
    }
    for (const context of indexedExerciseContexts(portfolio, portfolioId)) {
      const sectionId = context.sectionId;
      for (const [exerciseId, targetSectionId] of movedExerciseTargetSections) {
        if (targetSectionId === sectionId) statements.push({
          sql: "UPDATE error_reports SET section_id = ? WHERE exercise_id = ?",
          args: [targetSectionId, exerciseId],
        });
      }

      for (const exercise of context.exercises) {
        const exerciseId = resolvedExerciseId(portfolioId, sectionId, exercise.code);
        statements.push(writesExerciseLevelSource ? {
          sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, level_source, visibility_mode, visible, is_indexed, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'visible', 1, 1, ?)
            ON CONFLICT(id) DO UPDATE SET portfolio_id = excluded.portfolio_id, section_id = excluded.section_id,
              exercise_code = excluded.exercise_code, exercise_number = excluded.exercise_number,
              exercise_suffix = excluded.exercise_suffix, level_source = excluded.level_source,
              is_indexed = 1, archived_at = NULL, last_seen_at = excluded.last_seen_at`,
          args: [exerciseId, portfolioId, sectionId, exercise.code, exercise.number, exercise.suffix, exercise.levelSource ?? null, startedAt],
        } : {
          sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, visibility_mode, visible, is_indexed, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, 'visible', 1, 1, ?)
            ON CONFLICT(id) DO UPDATE SET portfolio_id = excluded.portfolio_id, section_id = excluded.section_id,
              exercise_code = excluded.exercise_code, exercise_number = excluded.exercise_number,
              exercise_suffix = excluded.exercise_suffix, is_indexed = 1, archived_at = NULL, last_seen_at = excluded.last_seen_at`,
          args: [exerciseId, portfolioId, sectionId, exercise.code, exercise.number, exercise.suffix, startedAt],
        });

        for (const asset of exercise.assets) {
          const resourceAssetId = stableId("source-resource-asset", spaceId, "exercise", asset.resourceId, asset.sourceId);
          const logicalKey = resourceAssetLogicalKey("exercise", exerciseId, asset.resourceId, asset.parsed.step, asset.parsed.extension);
          const exactKey = resourceAssetExactKey("exercise", asset.resourceId, asset.sourceId);
          const reconciliation = resourceReconciliationCandidate(exactKey, logicalKey);
          if (reconciliation?.kind === "conflict") {
            reportResourceConflict(exactKey, asset.relativePath);
            continue;
          }
          if (reconciliation?.kind === "reconcile") {
            reconciledResourceAssetIds.add(reconciliation.candidate.id);
            seenResourceAssetIds.add(reconciliation.candidate.id);
            publishedGenericExercisePaths.add(`${exerciseId}\u0000${asset.relativePath}`);
            updated += 1;
            if (reconciliation.stale) statements.push({
              sql: "DELETE FROM source_resource_assets WHERE id = ? AND is_indexed = 0",
              args: [reconciliation.stale.id],
            });
            statements.push({
              sql: `UPDATE source_resource_assets SET portfolio_id = ?, exercise_id = ?, semantic_role = ?, source_id = ?,
                relative_path = ?, file_name = ?, extension = ?, step = ?, last_modified_at = ?, source_version = ?,
                is_indexed = 1, missing_since = NULL, archived_at = NULL, last_seen_at = ? WHERE id = ?`,
              args: [portfolioId, exerciseId, asset.semanticRole, asset.sourceId, asset.relativePath, asset.fileName,
                asset.parsed.extension, asset.parsed.step, asset.lastModifiedAt, asset.sourceVersion, startedAt, reconciliation.candidate.id],
            });
          } else {
            const previous = activeResourceAssetsByExactKey.get(exactKey);
            seenResourceAssetIds.add(existingResourceAssetsByExactKey.get(exactKey)?.id ?? resourceAssetId);
            publishedGenericExercisePaths.add(`${exerciseId}\u0000${asset.relativePath}`);
            if (!previous) {
              const legacyPrevious = activeSolutionAssetRows.find((candidate) => candidate.exerciseId === exerciseId
                && candidate.relativePath === asset.relativePath);
              if (!legacyPrevious) added += 1;
              else if (legacyPrevious.sourceVersion !== asset.sourceVersion) updated += 1;
            } else if (previous.sourceVersion !== asset.sourceVersion) updated += 1;
            statements.push({
              sql: `INSERT INTO source_resource_assets (id, learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id,
                semantic_role, source_id, relative_path, file_name, extension, step, last_modified_at, source_version, is_indexed,
                missing_since, archived_at, last_seen_at)
                VALUES (?, ?, ?, ?, 'exercise', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, ?)
                ON CONFLICT(learning_space_id, resource_scope, resource_id, source_id) DO UPDATE SET
                  portfolio_id = excluded.portfolio_id, exercise_id = excluded.exercise_id, semantic_role = excluded.semantic_role,
                  relative_path = excluded.relative_path, file_name = excluded.file_name, extension = excluded.extension,
                  step = excluded.step, last_modified_at = excluded.last_modified_at, source_version = excluded.source_version,
                  is_indexed = 1, missing_since = NULL, archived_at = NULL, last_seen_at = excluded.last_seen_at`,
              args: [resourceAssetId, spaceId, portfolioId, exerciseId, asset.resourceId, asset.semanticRole, asset.sourceId,
                asset.relativePath, asset.fileName, asset.parsed.extension, asset.parsed.step, asset.lastModifiedAt,
                asset.sourceVersion, startedAt],
            });
          }
        }

        for (const variant of ["standard", "alternative"] as const) {
          const variantAssets = exercise.assets.filter((asset) => asset.legacyVariant === variant);
          if (variantAssets.length === 0) continue;
          const variantId = `${exerciseId}-${variant}`;
          seenVariantIds.add(variantId);
          statements.push({
            sql: `INSERT INTO solution_variants (id, exercise_id, kind, label, is_indexed) VALUES (?, ?, ?, ?, 1)
              ON CONFLICT(id) DO UPDATE SET label = excluded.label, is_indexed = 1, archived_at = NULL`,
            args: [variantId, exerciseId, variant, variant === "standard" ? "Standaard" : "Alternatief"],
          });
          for (const asset of variantAssets) {
            const pathKey = assetKey(variantId, asset.relativePath);
            const previousAtPath = existingAssetVersions.get(pathKey);
            const logicalKey = solutionAssetLogicalKey(variantId, asset.parsed.step, asset.parsed.extension);
            const reconciliation = solutionReconciliationCandidate(pathKey, logicalKey);
            if (reconciliation?.kind === "conflict") {
              reportSolutionConflict(pathKey, asset.relativePath);
              continue;
            }
            if (reconciliation?.kind === "reconcile") {
              reconciledSolutionAssetIds.add(reconciliation.candidate.id);
              seenAssetKeys.add(assetKey(variantId, reconciliation.candidate.relativePath));
              if (!publishedGenericExercisePaths.has(`${exerciseId}\u0000${asset.relativePath}`)) updated += 1;
              if (reconciliation.stale) statements.push({
                sql: "DELETE FROM solution_assets WHERE id = ? AND is_indexed = 0",
                args: [reconciliation.stale.id],
              });
              statements.push({
                sql: `UPDATE solution_assets SET relative_path = ?, source_id = ?, file_name = ?, extension = ?, step = ?,
                  last_modified_at = ?, source_version = ?, is_indexed = 1, archived_at = NULL, missing_since = NULL WHERE id = ?`,
                args: [asset.relativePath, asset.sourceId, asset.fileName, asset.parsed.extension, asset.parsed.step,
                  asset.lastModifiedAt, asset.sourceVersion, reconciliation.candidate.id],
              });
              continue;
            }

            const assetId = stableId("asset", variantId, asset.relativePath);
            seenAssetKeys.add(pathKey);
            if (!publishedGenericExercisePaths.has(`${exerciseId}\u0000${asset.relativePath}`)) {
              if (previousAtPath === undefined) added += 1;
              else if (previousAtPath.sourceVersion !== asset.sourceVersion) updated += 1;
            }
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

  statements.push(...bindingStatements);
  const missingGeneric = existingResourceAssetRows.filter((asset) => asset.isIndexed && asset.archivedAt === null
    && !seenResourceAssetIds.has(asset.id));
  const missingGenericExercisePaths = new Set(missingGeneric.filter((asset) => asset.scope === "exercise" && asset.exerciseId)
    .map((asset) => `${asset.exerciseId}\u0000${asset.relativePath}`));
  const allMissingLegacy = [...existingAssetVersions.entries()].filter(([key]) => !seenAssetKeys.has(key)).map(([key, asset]) => {
    const [variantId, relativePath] = key.split("\u0000");
    return { id: asset.id, relativePath, fileName: asset.fileName, variant: asset.variant, variantStillPresent: seenVariantIds.has(variantId) };
  });
  const missingLegacy = allMissingLegacy.filter((asset) => {
    const source = activeSolutionAssetRows.find((candidate) => candidate.id === asset.id);
    return !source || !missingGenericExercisePaths.has(`${source.exerciseId}\u0000${source.relativePath}`);
  });
  const missing = [...missingGeneric, ...missingLegacy];
  if (allMissingLegacy.length > 0) {
    statements.push({
      sql: `UPDATE solution_assets SET missing_since = ? WHERE is_indexed = 0 AND missing_since IS NULL AND variant_id IN
        (SELECT id FROM solution_variants WHERE exercise_id IN (SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)))`,
      args: [startedAt, spaceId],
    });
    for (const asset of allMissingLegacy) {
      const label = asset.variant === "alternative" ? "Alternatieve uitwerking" : "Uitwerking";
      warnings.push({ severity: "warning", path: asset.relativePath, message: asset.variantStillPresent ? `${label} is onvolledig: bestand ontbreekt: ${asset.fileName}.` : `Bronbestand ontbreekt: ${asset.fileName}. Deze oefening blijft voorlopig herkenbaar in het beheer.` });
    }
  }
  const missingLegacyExercisePaths = new Set(allMissingLegacy.map((asset) => {
    const source = activeSolutionAssetRows.find((candidate) => candidate.id === asset.id);
    return source ? `${source.exerciseId}\u0000${source.relativePath}` : "";
  }));
  for (const asset of missingGeneric) {
    if (asset.scope === "exercise" && asset.exerciseId
      && missingLegacyExercisePaths.has(`${asset.exerciseId}\u0000${asset.relativePath}`)) continue;
    warnings.push({
      severity: "warning",
      path: asset.relativePath,
      message: `Bronbestand ontbreekt: ${asset.fileName}. De bronresource blijft voorlopig herkenbaar in het beheer.`,
    });
  }
  statements.push({
    sql: "UPDATE source_resource_assets SET missing_since = ? WHERE learning_space_id = ? AND is_indexed = 0 AND missing_since IS NULL",
    args: [startedAt, spaceId],
  });
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

  if (options.publicationGuard) {
    const guard = options.publicationGuard;
    if (guard.snapshot.learningSpaceId !== spaceId || guard.snapshot.sourceId !== sourceId) {
      throw new StaleSynchronizationError("De synchronisatiesnapshot hoort niet bij deze publicatie.");
    }
    const checkedAt = new Date();
    const renewedUntil = new Date(checkedAt.getTime() + Math.max(60, guard.leaseSeconds) * 1000).toISOString();
    const published = await executeGuardedBatch({
      sql: `UPDATE sync_leases SET acquired_until = ?
        WHERE learning_space_id = ? AND owner_id = ? AND acquired_until > ?
          AND EXISTS (SELECT 1 FROM learning_spaces
            WHERE id = ? AND is_active = 1 AND archived_at IS NULL)
          AND EXISTS (SELECT 1 FROM learning_space_sources
            WHERE id = ? AND learning_space_id = ? AND updated_at = ? AND provider_type = ?
              AND COALESCE(storage_connection_id, '') = ? AND COALESCE(local_source_path, '') = ?
              AND COALESCE(onedrive_drive_id, '') = ? AND COALESCE(onedrive_folder_id, '') = ?
              AND COALESCE(onedrive_folder_path, '') = ? AND COALESCE(google_drive_folder_id, '') = ?
              AND COALESCE(google_drive_folder_label, '') = ?)
          AND EXISTS (SELECT 1 FROM learning_space_sources
            WHERE id = ? AND learning_space_id = ? AND is_active = 1)
          AND EXISTS (SELECT 1 FROM learning_space_source_profiles
            INNER JOIN source_profiles ON source_profiles.id = learning_space_source_profiles.source_profile_id
            WHERE learning_space_source_profiles.learning_space_id = ?
              AND learning_space_source_profiles.source_profile_id = ?
              AND learning_space_source_profiles.updated_at = ?
              AND source_profiles.updated_at = ?
              AND source_profiles.config_version = ?
              AND source_profiles.config_json = ?
              AND source_profiles.archived_at IS NULL)
        RETURNING owner_id`,
      args: [renewedUntil, spaceId, guard.ownerId, checkedAt.toISOString(), spaceId,
        guard.snapshot.sourceId, spaceId, guard.snapshot.sourceUpdatedAt, guard.snapshot.sourceProviderType,
        guard.snapshot.sourceStorageConnectionId ?? "", guard.snapshot.sourceLocalPath ?? "",
        guard.snapshot.sourceOneDriveDriveId ?? "", guard.snapshot.sourceOneDriveFolderId ?? "",
        guard.snapshot.sourceOneDriveFolderPath ?? "", guard.snapshot.sourceGoogleDriveFolderId ?? "",
        guard.snapshot.sourceGoogleDriveFolderLabel ?? "",
        guard.snapshot.activeSourceId, spaceId, spaceId, guard.snapshot.sourceProfileId,
        guard.snapshot.sourceProfileAssignmentUpdatedAt, guard.snapshot.sourceProfileUpdatedAt,
        guard.snapshot.sourceProfileConfigVersion, guard.snapshot.sourceProfileConfigJson],
    }, statements);
    if (!published) throw new StaleSynchronizationError("De synchronisatielease of bronsnapshot is niet meer geldig.");
  } else {
    await executeBatch(statements);
  }
  return { warnings: warnings.length, added, updated, missing: missing.length };
}

export async function getIndexedSourceManifest(learningSpaceId: string): Promise<SourceManifestEntry[]> {
  const database = await getDatabase();
  const [portfolios, sections, legacyAssets, resourceAssets] = await Promise.all([
    database.execute({ sql: `SELECT portfolios.relative_path, assignment_pdf_path, hints_document_path, final_solutions_pdf_path,
      themes.source_scope, themes.source_id, themes.source_folder_name, themes.source_relative_path FROM portfolios
      LEFT JOIN themes ON themes.id = portfolios.theme_id AND themes.learning_space_id = portfolios.learning_space_id
      WHERE portfolios.learning_space_id = ? AND portfolios.is_indexed = 1`, args: [learningSpaceId] }),
    database.execute({ sql: `SELECT sections.relative_path FROM sections JOIN portfolios ON portfolios.id = sections.portfolio_id
      WHERE portfolios.learning_space_id = ? AND sections.is_indexed = 1 AND (
        EXISTS (
          SELECT 1 FROM exercises
          JOIN solution_variants ON solution_variants.exercise_id = exercises.id
          JOIN solution_assets ON solution_assets.variant_id = solution_variants.id
          WHERE exercises.section_id = sections.id AND solution_assets.is_indexed = 1
        ) OR EXISTS (
          SELECT 1 FROM source_resource_assets
          JOIN exercises ON exercises.id = source_resource_assets.exercise_id
          WHERE exercises.section_id = sections.id AND source_resource_assets.resource_scope = 'exercise'
            AND source_resource_assets.is_indexed = 1
        )
      )`, args: [learningSpaceId] }),
    database.execute({ sql: `SELECT solution_assets.relative_path FROM solution_assets
      JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      JOIN exercises ON exercises.id = solution_variants.exercise_id
      JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE portfolios.learning_space_id = ? AND solution_assets.is_indexed = 1`, args: [learningSpaceId] }),
    database.execute({ sql: `SELECT relative_path FROM source_resource_assets
      WHERE learning_space_id = ? AND is_indexed = 1`, args: [learningSpaceId] }),
  ]);
  const manifest: SourceManifestEntry[] = [];
  const seenFiles = new Set<string>();
  const addFile = (relativePath: string | null) => {
    if (!relativePath || seenFiles.has(relativePath)) return;
    seenFiles.add(relativePath);
    manifest.push({ kind: "file", relativePath });
  };
  for (const row of portfolios.rows) {
    manifest.push({
      kind: "portfolio", relativePath: text(row, "relative_path"),
      ...(row.source_scope != null ? { sourceTheme: sourceThemeFromRow(row) } : {}),
    });
    addFile(nullableText(row, "assignment_pdf_path"));
    addFile(nullableText(row, "hints_document_path"));
    addFile(nullableText(row, "final_solutions_pdf_path"));
  }
  for (const row of sections.rows) manifest.push({ kind: "section", relativePath: text(row, "relative_path") });
  for (const row of legacyAssets.rows) addFile(text(row, "relative_path"));
  for (const row of resourceAssets.rows) addFile(text(row, "relative_path"));
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
  const assetCount = await database.execute(missingAssetCountStatement(learningSpaceId));
  await executeBatch([
    { sql: `DELETE FROM sync_warnings WHERE sync_run_id = (SELECT id FROM sync_runs WHERE status = 'completed' AND learning_space_id = ? ORDER BY finished_at DESC LIMIT 1)
      AND relative_path IN (
        SELECT relative_path FROM source_resource_assets
          WHERE learning_space_id = ? AND is_indexed = 0 AND archived_at IS NULL
        UNION
        SELECT solution_assets.relative_path FROM solution_assets
          JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
          JOIN exercises ON exercises.id = solution_variants.exercise_id
          JOIN portfolios ON portfolios.id = exercises.portfolio_id
          WHERE portfolios.learning_space_id = ? AND solution_assets.is_indexed = 0 AND solution_assets.archived_at IS NULL
      )`, args: [learningSpaceId, learningSpaceId, learningSpaceId] },
    { sql: "UPDATE source_resource_assets SET archived_at = ? WHERE learning_space_id = ? AND is_indexed = 0 AND archived_at IS NULL", args: [now, learningSpaceId] },
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
    database.execute(missingAssetCountStatement(learningSpaceId)),
  ]);
  return { exercises: Number(exercises.rows[0]?.count ?? 0), assets: Number(assets.rows[0]?.count ?? 0) };
}

function missingAssetCountStatement(learningSpaceId: string): InStatement {
  return {
    sql: `SELECT (
      (SELECT COUNT(*) FROM source_resource_assets
        JOIN portfolios ON portfolios.id = source_resource_assets.portfolio_id
        LEFT JOIN exercises ON exercises.id = source_resource_assets.exercise_id
        WHERE source_resource_assets.learning_space_id = ?
          AND source_resource_assets.is_indexed = 0 AND source_resource_assets.archived_at IS NULL
          AND portfolios.archived_at IS NULL
          AND (source_resource_assets.resource_scope = 'portfolio' OR exercises.archived_at IS NULL))
      +
      (SELECT COUNT(*) FROM solution_assets
        JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
        JOIN exercises ON exercises.id = solution_variants.exercise_id
        JOIN portfolios ON portfolios.id = exercises.portfolio_id
        WHERE portfolios.learning_space_id = ?
          AND portfolios.archived_at IS NULL AND exercises.archived_at IS NULL
          AND solution_assets.is_indexed = 0 AND solution_assets.archived_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM source_resource_assets
            WHERE source_resource_assets.learning_space_id = ?
              AND source_resource_assets.resource_scope = 'exercise'
              AND source_resource_assets.exercise_id = solution_variants.exercise_id
              AND source_resource_assets.relative_path = solution_assets.relative_path
              AND source_resource_assets.is_indexed = 0 AND source_resource_assets.archived_at IS NULL
          ))
    ) AS count`,
    args: [learningSpaceId, learningSpaceId, learningSpaceId],
  };
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

function portfolioExternalLinksByPortfolio(rows: readonly DatabaseRow[]): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const portfolioId = text(row, "portfolio_id");
    const links = result.get(portfolioId) ?? new Map<string, string>();
    links.set(text(row, "resource_id"), text(row, "url"));
    result.set(portfolioId, links);
  }
  return result;
}

function portfolioGlobalResources(
  portfolio: DatabaseRow,
  resources: readonly GlobalResourceConfig[],
  externalLinks: ReadonlyMap<string, string> | undefined,
  resourceAssetRows: readonly DatabaseRow[] = [],
): PortfolioGlobalResource[] {
  const documentKindsByResourceId = profileDocumentKinds(resources);
  const availableAssets = new Map(resourceAssetRows
    .filter((row) => bool(row.is_indexed ?? 1))
    .map((row) => [text(row, "resource_id"), row] as const));
  return sortGlobalResources(resources).map((resource) => {
    if (resource.kind === "external_link") {
      const url = externalLinks?.get(resource.id) ?? null;
      return {
        id: resource.id, kind: resource.kind, label: resource.label, icon: resource.icon, semanticRole: resource.semanticRole,
        documentKind: null, assetId: null, url, available: Boolean(url), recognition: null,
      };
    }

    const documentKind = documentKindsByResourceId.get(resource.id) ?? null;
    const columns = documentKind ? portfolioDocumentColumns(documentKind) : null;
    const asset = availableAssets.get(resource.id);
    const legacyAvailable = columns ? Boolean(nullableText(portfolio, columns.path) || nullableText(portfolio, columns.sourceId)) : false;
    return {
      id: resource.id, kind: resource.kind, label: resource.label, icon: resource.icon, semanticRole: resource.semanticRole,
      documentKind, assetId: asset ? text(asset, "id") : null, url: null, available: Boolean(asset) || legacyAvailable,
      recognition: resource.recognition,
    };
  });
}

function profileDocumentKinds(resources: readonly GlobalResourceConfig[]): Map<string, PortfolioDocumentKind> {
  const result = new Map<string, PortfolioDocumentKind>();
  const assignment = firstSourceFileGlobalResourceBySemanticRole(resources, "assignment");
  const hints = firstSourceFileGlobalResourceBySemanticRole(resources, "hint");
  const finalSolutions = firstSourceFileGlobalResourceBySemanticRole(resources, "final_answer");
  if (assignment) result.set(assignment.id, "assignment");
  if (hints) result.set(hints.id, "hints");
  if (finalSolutions) result.set(finalSolutions.id, "final-solutions");
  return result;
}

function legacyExerciseResourceVariants(resources: readonly ExerciseResourceConfig[]): Map<string, "standard" | "alternative"> {
  const result = new Map<string, "standard" | "alternative">();
  const standard = firstExerciseResourceBySemanticRole(resources, "worked_solution");
  const alternative = firstExerciseResourceBySemanticRole(resources, "alternative_solution");
  if (standard) result.set(standard.id, "standard");
  if (alternative) result.set(alternative.id, "alternative");
  return result;
}

function exerciseResourceReadModel(
  resources: readonly ExerciseResourceConfig[],
  legacyAssetRows: readonly DatabaseRow[],
  resourceAssetRows: readonly DatabaseRow[],
  options: { includeUnavailable: boolean; showAlternative: boolean },
): ExerciseResource[] {
  const variants = legacyExerciseResourceVariants(resources);
  const items = sortExerciseResources(resources).map((resource): ExerciseResource => {
    const legacyVariant = variants.get(resource.id) ?? null;
    const hideAlternative = resource.semanticRole === "alternative_solution" && !options.showAlternative;
    const rows = hideAlternative
      ? []
      : legacyVariant === null
        ? resourceAssetRows.filter((asset) => text(asset, "resource_id") === resource.id && bool(asset.is_indexed ?? 1))
        : legacyAssetRows.filter((asset) => text(asset, "kind") === legacyVariant && bool(asset.is_indexed ?? 1));
    const assets = rows.map((asset): ExerciseResourceAsset => ({
      id: text(asset, "id"),
      fileName: text(asset, "file_name"),
      extension: text(asset, "extension"),
      step: Number(asset.step),
      lastModifiedAt: nullableText(asset, "last_modified_at"),
      source: legacyVariant === null ? "resource" : "solution",
    }));
    return {
      id: resource.id,
      kind: resource.kind,
      label: resource.label,
      icon: resource.icon,
      semanticRole: resource.semanticRole,
      displayMode: resource.displayMode,
      legacyVariant,
      available: assets.length > 0,
      assets,
    };
  });
  return options.includeUnavailable ? items : items.filter((resource) => resource.available);
}

function missingExerciseAssetCount(legacyAssets: readonly DatabaseRow[], resourceAssets: readonly DatabaseRow[]): number {
  const missingResourceAssets = resourceAssets.filter((asset) => !bool(asset.is_indexed));
  const missingResourcePaths = new Set(missingResourceAssets.map((asset) => text(asset, "relative_path")));
  return missingResourceAssets.length + legacyAssets.filter((asset) => !bool(asset.is_indexed)
    && !missingResourcePaths.has(text(asset, "relative_path"))).length;
}

export async function getAdminPortfolios(learningSpaceId?: string): Promise<AdminPortfolio[]> {
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  return getAdminPortfolioReadModels(spaceId);
}

async function getAdminPortfolioReadModels(spaceId: string, portfolioId?: string): Promise<AdminPortfolio[]> {
  const database = await getDatabase();
  const scopeArgs = portfolioId ? [spaceId, portfolioId] : [spaceId];
  const portfolioFilter = portfolioId ? " AND portfolios.id = ?" : "";
  const [portfolios, sections, exercises, assets, resourceAssets, sourceProfileContext, externalLinks] = await Promise.all([
    database.execute({ sql: `SELECT portfolios.*, themes.name AS theme_name FROM portfolios LEFT JOIN themes ON themes.id = portfolios.theme_id
      WHERE portfolios.learning_space_id = ? AND portfolios.archived_at IS NULL${portfolioFilter}`, args: scopeArgs }),
    database.execute({ sql: `SELECT sections.* FROM sections
      JOIN portfolios ON portfolios.id = sections.portfolio_id
      WHERE portfolios.learning_space_id = ? AND sections.archived_at IS NULL${portfolioFilter}
      ORDER BY sections.portfolio_id, sections.sort_order, sections.section_code, sections.id`, args: scopeArgs }),
    database.execute({ sql: `SELECT exercises.* FROM exercises
      JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE portfolios.learning_space_id = ? AND exercises.archived_at IS NULL${portfolioId ? " AND exercises.portfolio_id = ?" : ""}
      ORDER BY exercises.section_id, exercises.exercise_number, exercises.exercise_suffix`, args: scopeArgs }),
    database.execute({ sql: `SELECT solution_assets.*, solution_variants.exercise_id, solution_variants.kind
      FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      JOIN exercises ON exercises.id = solution_variants.exercise_id
      JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE portfolios.learning_space_id = ? AND solution_assets.archived_at IS NULL${portfolioId ? " AND exercises.portfolio_id = ?" : ""}
      ORDER BY solution_assets.step, solution_assets.file_name`, args: scopeArgs }),
    database.execute({ sql: `SELECT * FROM source_resource_assets
      WHERE learning_space_id = ? AND archived_at IS NULL${portfolioId ? " AND portfolio_id = ?" : ""}
      ORDER BY step, file_name`, args: scopeArgs }),
    getSourceProfileIndexContextForLearningSpace(spaceId),
    database.execute({ sql: `SELECT portfolio_external_links.portfolio_id, portfolio_external_links.resource_id, portfolio_external_links.url
      FROM portfolio_external_links JOIN portfolios ON portfolios.id = portfolio_external_links.portfolio_id
      WHERE portfolios.learning_space_id = ?${portfolioFilter}`, args: scopeArgs }),
  ]);
  const now = new Date();
  const profileIndexAligned = sourceProfileContext?.indexAligned === true;
  const resources = profileIndexAligned ? sourceProfileContext.profile.config.globalResources : BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources;
  const exerciseResources = profileIndexAligned ? sourceProfileContext.profile.config.exerciseResources : BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources;
  const externalLinksByPortfolio = portfolioExternalLinksByPortfolio(externalLinks.rows);

  return portfolios.rows.map((portfolio) => {
    const portfolioId = text(portfolio, "id");
    const portfolioStatus = resolvePortfolioPublication({
      visible: bool(portfolio.visible), limited: bool(portfolio.publication_limited), publishFrom: nullableText(portfolio, "publish_from"), publishUntil: nullableText(portfolio, "publish_until"),
    }, now);
    const adminExerciseReadModel = (exercise: DatabaseRow, parentStatus: EffectivePublication): AdminExercise => {
      const exerciseId = text(exercise, "id");
      const exerciseAssets = assets.rows.filter((asset) => text(asset, "exercise_id") === exerciseId);
      const exerciseResourceAssets = resourceAssets.rows.filter((asset) => text(asset, "exercise_id") === exerciseId && text(asset, "resource_scope") === "exercise");
      const exercisePublication = { mode: childMode(exercise), limited: false, publishFrom: null, publishUntil: null };
      const exerciseStatus = resolveChildPublication(exercisePublication, parentStatus, now);
      return {
        id: exerciseId,
        code: text(exercise, "exercise_code"),
        ...exerciseLevelMetadataFromRow(exercise),
        visible: childMode(exercise) === "visible",
        visibilityMode: exercisePublication.mode,
        publishFrom: exercisePublication.publishFrom,
        publishUntil: exercisePublication.publishUntil,
        effectiveStatus: exerciseStatus,
        effectivePublished: exerciseStatus.state === "visible",
        isIndexed: bool(exercise.is_indexed),
        showAlternativeToStudents: bool(exercise.show_alternative_to_students),
        standardAssets: exerciseAssets.filter((asset) => text(asset, "kind") === "standard" && bool(asset.is_indexed)).length,
        alternativeAssets: exerciseAssets.filter((asset) => text(asset, "kind") === "alternative" && bool(asset.is_indexed)).length,
        missingAssets: missingExerciseAssetCount(exerciseAssets, exerciseResourceAssets),
        hasNote: Boolean(nullableText(exercise, "custom_note")),
        noteLabel: nullableText(exercise, "note_label"),
        customNote: nullableText(exercise, "custom_note"),
        notePosition: text(exercise, "note_position") as ExerciseNotePosition,
        resources: exerciseResourceReadModel(exerciseResources, exerciseAssets, profileIndexAligned ? exerciseResourceAssets : [], { includeUnavailable: true, showAlternative: true }),
        assets: exerciseAssets.map((asset) => ({
          id: text(asset, "id"), fileName: text(asset, "file_name"), extension: text(asset, "extension"),
          step: Number(asset.step), variant: text(asset, "kind") as AdminAsset["variant"],
          isIndexed: bool(asset.is_indexed), lastModifiedAt: nullableText(asset, "last_modified_at"),
        })),
      };
    };
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
      globalResources: portfolioGlobalResources(
        portfolio,
        resources,
        profileIndexAligned ? externalLinksByPortfolio.get(portfolioId) : undefined,
        profileIndexAligned
          ? resourceAssets.rows.filter((asset) => text(asset, "portfolio_id") === portfolioId && text(asset, "resource_scope") === "portfolio")
          : [],
      ),
      learningSpaceId: text(portfolio, "learning_space_id"), themeId: nullableText(portfolio, "theme_id"), themeName: nullableText(portfolio, "theme_name"),
      cardColor: text(portfolio, "card_color"),
      customText: nullableText(portfolio, "custom_text"),
      customTextPosition: text(portfolio, "custom_text_position") as PortfolioCustomTextPosition,
      exercises: exercises.rows.filter((exercise) => text(exercise, "portfolio_id") === portfolioId && exercise.section_id === null)
        .map((exercise) => adminExerciseReadModel(exercise, portfolioStatus)),
      sections: sections.rows.filter((section) => text(section, "portfolio_id") === portfolioId && bool(section.is_indexed)).map((section) => {
        const sectionId = text(section, "id");
        const sectionPublication = { mode: childMode(section), limited: bool(section.publication_limited), publishFrom: nullableText(section, "publish_from"), publishUntil: nullableText(section, "publish_until") };
        const sectionStatus = resolveChildPublication(sectionPublication, portfolioStatus, now);
        return {
          id: sectionId,
          code: text(section, "section_code"),
          title: text(section, "title"),
          visibilityMode: sectionPublication.mode,
          publishFrom: sectionPublication.publishFrom,
          publishUntil: sectionPublication.publishUntil,
          limited: sectionPublication.limited,
          effectiveStatus: sectionStatus,
          effectivePublished: sectionStatus.state === "visible",
          isIndexed: bool(section.is_indexed),
          exercises: exercises.rows.filter((exercise) => text(exercise, "section_id") === sectionId).map((exercise) => adminExerciseReadModel(exercise, sectionStatus)),
        };
      }),
    };
  }).sort((left, right) => comparePortfolioIds(left.code, right.code));
}

export async function getAdminPortfolio(id: string, learningSpaceId?: string): Promise<AdminPortfolio | null> {
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  return (await getAdminPortfolioReadModels(spaceId, id))[0] ?? null;
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
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const database = await getDatabase();
  const [warnings, portfolios] = await Promise.all([
    getLatestWarnings(spaceId),
    database.execute({ sql: "SELECT id, relative_path FROM portfolios WHERE learning_space_id = ? AND archived_at IS NULL", args: [spaceId] }),
  ]);
  const counts = new Map<string, number>();
  for (const warning of warnings) {
    const matches = portfolios.rows.filter((portfolio) => relativePathBelongsToDirectory(warning.relativePath, text(portfolio, "relative_path")));
    if (matches.length === 1) {
      const portfolioId = text(matches[0], "id");
      counts.set(portfolioId, (counts.get(portfolioId) ?? 0) + 1);
    }
  }
  return counts;
}

export async function getPortfolioWarnings(portfolioId: string, learningSpaceId?: string) {
  const portfolio = await getAdminPortfolio(portfolioId, learningSpaceId);
  if (!portfolio) return [];
  const database = await getDatabase();
  const pathResult = await database.execute({ sql: "SELECT relative_path FROM portfolios WHERE id = ? AND learning_space_id = ?", args: [portfolio.id, portfolio.learningSpaceId] });
  const portfolioPath = pathResult.rows[0] ? text(pathResult.rows[0], "relative_path") : "";
  return (await getLatestWarnings(portfolio.learningSpaceId))
    .filter((warning) => relativePathBelongsToDirectory(warning.relativePath, portfolioPath));
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

export async function setPortfolioExternalLinks(
  portfolioId: string,
  links: readonly { resourceId: string; url: string | null }[],
): Promise<void> {
  if (links.length === 0) return;
  const now = new Date().toISOString();
  const statements: InStatement[] = links.map((link) => link.url
    ? {
        sql: `INSERT INTO portfolio_external_links (portfolio_id, resource_id, url, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(portfolio_id, resource_id) DO UPDATE SET url = excluded.url, updated_at = excluded.updated_at`,
        args: [portfolioId, link.resourceId, link.url, now],
      }
    : { sql: "DELETE FROM portfolio_external_links WHERE portfolio_id = ? AND resource_id = ?", args: [portfolioId, link.resourceId] });
  await (await getDatabase()).batch(statements);
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

export async function setExerciseLevelOverride(id: string, input: ExerciseLevelOverrideInput): Promise<void> {
  const override = validateExerciseLevelOverrideInput(input);
  await (await getDatabase()).execute({
    sql: "UPDATE exercises SET level_override_mode = ?, level_override = ? WHERE id = ?",
    args: [override.mode, override.mode === "level" ? override.level : null, id],
  });
}

export async function setExerciseNote(id: string, customNote: string | null, noteLabel: string | null, notePosition: ExerciseNotePosition): Promise<void> {
  await (await getDatabase()).execute({
    sql: "UPDATE exercises SET custom_note = ?, note_label = ?, note_position = ? WHERE id = ?",
    args: [customNote, noteLabel, notePosition, id],
  });
}

export async function getStudentPortfolios(learningSpaceId?: string): Promise<StudentPortfolio[]> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const [portfolios, sections, exercises, resourceAssets, sourceProfileContext, externalLinks] = await Promise.all([
    database.execute({ sql: `SELECT portfolios.*, themes.name AS theme_name FROM portfolios LEFT JOIN themes ON themes.id = portfolios.theme_id
      WHERE portfolios.is_indexed = 1 AND portfolios.learning_space_id = ?`, args: [spaceId] }),
    database.execute({ sql: "SELECT * FROM sections WHERE is_indexed = 1 AND portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?) ORDER BY portfolio_id, sort_order, section_code, id", args: [spaceId] }),
    database.execute({ sql: `SELECT exercises.*,
      CASE WHEN exercises.show_alternative_to_students = 1 AND EXISTS (
        SELECT 1 FROM solution_variants
        INNER JOIN solution_assets ON solution_assets.variant_id = solution_variants.id
        WHERE solution_variants.exercise_id = exercises.id AND solution_variants.kind = 'alternative'
          AND solution_variants.is_indexed = 1 AND solution_assets.is_indexed = 1
      ) THEN 1 ELSE 0 END AS has_alternative_solution
      FROM exercises WHERE exercises.is_indexed = 1
        AND exercises.portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)
      ORDER BY exercises.section_id, exercises.exercise_number, exercises.exercise_suffix`, args: [spaceId] }),
    database.execute({ sql: `SELECT * FROM source_resource_assets
      WHERE learning_space_id = ? AND resource_scope = 'portfolio' AND is_indexed = 1 AND archived_at IS NULL`, args: [spaceId] }),
    getSourceProfileIndexContextForLearningSpace(spaceId),
    database.execute({ sql: `SELECT portfolio_id, resource_id, url FROM portfolio_external_links
      WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)`, args: [spaceId] }),
  ]);
  const now = new Date();
  const profileIndexAligned = sourceProfileContext?.indexAligned === true;
  const resources = profileIndexAligned ? sourceProfileContext.profile.config.globalResources : BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources;
  const externalLinksByPortfolio = portfolioExternalLinksByPortfolio(externalLinks.rows);
  const result: StudentPortfolio[] = [];

  for (const portfolio of portfolios.rows) {
    const publication = resolvePortfolioPublication({ visible: bool(portfolio.visible), limited: bool(portfolio.publication_limited), publishFrom: nullableText(portfolio, "publish_from"), publishUntil: nullableText(portfolio, "publish_until") }, now);
    if (publication.state !== "visible") continue;
    const portfolioId = text(portfolio, "id");
    const studentExerciseReadModel = (exercise: DatabaseRow, parentStatus: EffectivePublication) => {
      const exercisePublication = { mode: childMode(exercise), limited: false, publishFrom: null, publishUntil: null };
      return {
        id: text(exercise, "id"), code: text(exercise, "exercise_code"),
        ...exerciseLevelMetadataFromRow(exercise),
        visible: resolveChildPublication(exercisePublication, parentStatus, now).state === "visible",
        hasAlternativeSolution: bool(exercise.has_alternative_solution),
      };
    };
    const studentPortfolio: StudentPortfolio = {
      id: portfolioId,
      code: nullableText(portfolio, "portfolio_code") ?? text(portfolio, "code"),
      title: nullableText(portfolio, "title_override") ?? text(portfolio, "title"),
      themeId: nullableText(portfolio, "theme_id"), themeName: nullableText(portfolio, "theme_name"),
      cardColor: text(portfolio, "card_color"),
      customText: nullableText(portfolio, "custom_text"),
      customTextPosition: text(portfolio, "custom_text_position") as PortfolioCustomTextPosition,
      assignmentPdfPath: nullableText(portfolio, "assignment_pdf_path"),
      hintsDocumentPath: nullableText(portfolio, "hints_document_path"),
      finalSolutionsPdfPath: nullableText(portfolio, "final_solutions_pdf_path"),
      globalResources: portfolioGlobalResources(
        portfolio,
        resources,
        profileIndexAligned ? externalLinksByPortfolio.get(portfolioId) : undefined,
        profileIndexAligned ? resourceAssets.rows.filter((asset) => text(asset, "portfolio_id") === portfolioId) : [],
      ).filter((resource) => resource.available),
      exercises: exercises.rows.filter((exercise) => text(exercise, "portfolio_id") === portfolioId && exercise.section_id === null)
        .map((exercise) => studentExerciseReadModel(exercise, publication)),
      sections: [],
    };
    for (const section of sections.rows.filter((row) => text(row, "portfolio_id") === portfolioId)) {
      const sectionPublication = { mode: childMode(section), limited: bool(section.publication_limited), publishFrom: nullableText(section, "publish_from"), publishUntil: nullableText(section, "publish_until") };
      const sectionStatus = resolveChildPublication(sectionPublication, publication, now);
      const sectionId = text(section, "id");
      studentPortfolio.sections.push({
        id: sectionId, code: text(section, "section_code"), title: text(section, "title"),
        exercises: exercises.rows.filter((exercise) => text(exercise, "section_id") === sectionId).map((exercise) => studentExerciseReadModel(exercise, sectionStatus)),
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
    sql: `SELECT exercises.*, sections.section_code, sections.title AS section_title, sections.visibility_mode AS section_visibility_mode,
      sections.publication_limited AS section_publication_limited, sections.publish_from AS section_publish_from, sections.publish_until AS section_publish_until,
      portfolios.id AS portfolio_id, portfolios.portfolio_code, portfolios.learning_space_id, portfolios.title AS portfolio_title, portfolios.title_override,
      portfolios.visible AS portfolio_visible, portfolios.publication_limited, portfolios.publish_from AS portfolio_publish_from, portfolios.publish_until AS portfolio_publish_until
      FROM exercises LEFT JOIN sections ON sections.id = exercises.section_id JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE exercises.id = ? AND exercises.is_indexed = 1 AND (exercises.section_id IS NULL OR sections.is_indexed = 1) AND portfolios.is_indexed = 1${learningSpaceId ? " AND portfolios.learning_space_id = ?" : ""}`,
    args: learningSpaceId ? [id, learningSpaceId] : [id],
  });
  const exercise = exerciseResult.rows[0];
  if (!exercise) return null;
  const now = new Date();
  const portfolioStatus = resolvePortfolioPublication({ visible: bool(exercise.portfolio_visible), limited: bool(exercise.publication_limited), publishFrom: nullableText(exercise, "portfolio_publish_from"), publishUntil: nullableText(exercise, "portfolio_publish_until") }, now);
  const sectionStatus = exercise.section_id == null ? portfolioStatus : resolveChildPublication({ mode: childMode({ visibility_mode: exercise.section_visibility_mode }), limited: bool(exercise.section_publication_limited), publishFrom: nullableText(exercise, "section_publish_from"), publishUntil: nullableText(exercise, "section_publish_until") }, portfolioStatus, now);
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
  const resourceAssets = await database.execute({
    sql: `SELECT id, resource_id, file_name, extension, step, last_modified_at
      FROM source_resource_assets
      WHERE exercise_id = ? AND resource_scope = 'exercise' AND is_indexed = 1 AND archived_at IS NULL
      ORDER BY step, file_name`,
    args: [id],
  });
  const sourceProfileContext = await getSourceProfileIndexContextForLearningSpace(text(exercise, "learning_space_id"));
  const profileIndexAligned = sourceProfileContext?.indexAligned === true;
  const exerciseResources = profileIndexAligned
    ? sourceProfileContext.profile.config.exerciseResources
    : BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources;
  const visibleAssetRows = assets.rows.filter((asset) => text(asset, "kind") !== "alternative" || bool(exercise.show_alternative_to_students));
  return {
    id, portfolioId: text(exercise, "portfolio_id"), learningSpaceId: text(exercise, "learning_space_id"), code: text(exercise, "exercise_code"), sectionCode: nullableText(exercise, "section_code"), sectionTitle: nullableText(exercise, "section_title"),
    ...exerciseLevelMetadataFromRow(exercise),
    portfolioCode: text(exercise, "portfolio_code"), portfolioTitle: nullableText(exercise, "title_override") ?? text(exercise, "portfolio_title"),
    customNote: nullableText(exercise, "custom_note"), noteLabel: nullableText(exercise, "note_label"), notePosition: text(exercise, "note_position") as ExerciseNotePosition,
    resources: exerciseResourceReadModel(exerciseResources, visibleAssetRows, profileIndexAligned ? resourceAssets.rows : [], { includeUnavailable: false, showAlternative: bool(exercise.show_alternative_to_students) }),
    assets: visibleAssetRows.map((asset) => ({ id: text(asset, "id"), fileName: text(asset, "file_name"), extension: text(asset, "extension"), step: Number(asset.step), kind: text(asset, "kind") as "standard" | "alternative", label: text(asset, "label"), lastModifiedAt: nullableText(asset, "last_modified_at") })),
  };
}

export async function getAdminExercise(id: string, learningSpaceId?: string) {
  const database = await getDatabase();
  const result = await database.execute({ sql: `SELECT exercises.section_id, exercises.exercise_code, exercises.custom_note, exercises.note_label, exercises.note_position,
    exercises.level_source, exercises.level_override_mode, exercises.level_override, exercises.visibility_mode,
    exercises.show_alternative_to_students,
    exercises.is_indexed AS exercise_is_indexed, exercises.archived_at AS exercise_archived_at,
    sections.section_code, sections.title AS section_title, sections.visibility_mode AS section_visibility_mode,
    sections.publication_limited AS section_publication_limited, sections.publish_from AS section_publish_from,
    sections.publish_until AS section_publish_until, sections.is_indexed AS section_is_indexed,
    portfolios.id AS portfolio_id, portfolios.portfolio_code, portfolios.title AS portfolio_title, portfolios.title_override,
    portfolios.visible AS portfolio_visible, portfolios.publication_limited AS portfolio_publication_limited,
    portfolios.publish_from AS portfolio_publish_from, portfolios.publish_until AS portfolio_publish_until,
    portfolios.learning_space_id, portfolios.is_indexed AS portfolio_is_indexed
    FROM exercises LEFT JOIN sections ON sections.id = exercises.section_id JOIN portfolios ON portfolios.id = exercises.portfolio_id
    WHERE exercises.id = ? AND exercises.archived_at IS NULL${learningSpaceId ? " AND portfolios.learning_space_id = ?" : ""}`, args: learningSpaceId ? [id, learningSpaceId] : [id] });
  const exercise = result.rows[0];
  if (!exercise) return null;
  const assets = await database.execute({ sql: `SELECT solution_assets.id, solution_assets.relative_path, solution_assets.file_name, solution_assets.extension, solution_assets.step,
      solution_assets.last_modified_at, solution_assets.is_indexed, solution_variants.is_indexed AS variant_is_indexed,
      solution_variants.kind, solution_variants.label
    FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
    WHERE solution_variants.exercise_id = ? AND solution_assets.archived_at IS NULL
    ORDER BY CASE solution_variants.kind WHEN 'standard' THEN 0 ELSE 1 END, solution_assets.step, solution_assets.file_name`, args: [id] });
  const resourceAssets = await database.execute({
    sql: `SELECT id, resource_id, relative_path, file_name, extension, step, last_modified_at, is_indexed
      FROM source_resource_assets
      WHERE exercise_id = ? AND resource_scope = 'exercise' AND archived_at IS NULL
      ORDER BY step, file_name`,
    args: [id],
  });
  const isIndexed = bool(exercise.exercise_is_indexed) && (exercise.section_id == null || bool(exercise.section_is_indexed)) && bool(exercise.portfolio_is_indexed);
  const now = new Date();
  const portfolioStatus = resolvePortfolioPublication({
    visible: bool(exercise.portfolio_visible), limited: bool(exercise.portfolio_publication_limited),
    publishFrom: nullableText(exercise, "portfolio_publish_from"), publishUntil: nullableText(exercise, "portfolio_publish_until"),
  }, now);
  const sectionStatus = exercise.section_id == null ? portfolioStatus : resolveChildPublication({
    mode: childMode({ visibility_mode: exercise.section_visibility_mode }), limited: bool(exercise.section_publication_limited),
    publishFrom: nullableText(exercise, "section_publish_from"), publishUntil: nullableText(exercise, "section_publish_until"),
  }, portfolioStatus, now);
  const visibilityMode = childMode(exercise);
  const effectiveStatus = resolveChildPublication({ mode: visibilityMode, limited: false, publishFrom: null, publishUntil: null }, sectionStatus, now);
  const indexedAssetRows = assets.rows.filter((asset) => bool(asset.is_indexed) && bool(asset.variant_is_indexed));
  const sourceProfileContext = await getSourceProfileIndexContextForLearningSpace(text(exercise, "learning_space_id"));
  const profileIndexAligned = sourceProfileContext?.indexAligned === true;
  const exerciseResources = profileIndexAligned
    ? sourceProfileContext.profile.config.exerciseResources
    : BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources;
  return {
    id,
    portfolioId: text(exercise, "portfolio_id"),
    learningSpaceId: text(exercise, "learning_space_id"),
    code: text(exercise, "exercise_code"),
    ...exerciseLevelMetadataFromRow(exercise),
    visible: visibilityMode === "visible",
    visibilityMode,
    effectiveStatus,
    showAlternativeToStudents: bool(exercise.show_alternative_to_students),
    standardAssets: assets.rows.filter((asset) => text(asset, "kind") === "standard" && bool(asset.is_indexed)).length,
    alternativeAssets: assets.rows.filter((asset) => text(asset, "kind") === "alternative" && bool(asset.is_indexed)).length,
    missingAssets: missingExerciseAssetCount(assets.rows, resourceAssets.rows),
    sectionCode: nullableText(exercise, "section_code"),
    sectionTitle: nullableText(exercise, "section_title"),
    portfolioCode: text(exercise, "portfolio_code"),
    portfolioTitle: nullableText(exercise, "title_override") ?? text(exercise, "portfolio_title"),
    isIndexed,
    customNote: nullableText(exercise, "custom_note"),
    noteLabel: nullableText(exercise, "note_label"),
    notePosition: text(exercise, "note_position") as ExerciseNotePosition,
    resources: exerciseResourceReadModel(exerciseResources, indexedAssetRows, profileIndexAligned ? resourceAssets.rows : [], { includeUnavailable: true, showAlternative: true }),
    assets: indexedAssetRows.map((asset) => ({
      id: text(asset, "id"),
      fileName: text(asset, "file_name"),
      extension: text(asset, "extension"),
      step: Number(asset.step),
      kind: text(asset, "kind") as "standard" | "alternative",
      label: text(asset, "label"),
      lastModifiedAt: nullableText(asset, "last_modified_at"),
    })),
  };
}

function exerciseLevelMetadataFromRow(row: DatabaseRow): ExerciseLevelMetadata {
  return exerciseLevelMetadata({
    levelSource: row.level_source,
    levelOverrideMode: row.level_override_mode,
    levelOverride: row.level_override,
  });
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
      JOIN exercises ON exercises.id = solution_variants.exercise_id LEFT JOIN sections ON sections.id = exercises.section_id
      JOIN portfolios ON portfolios.id = exercises.portfolio_id WHERE solution_assets.id = ?
        AND solution_assets.is_indexed = 1 AND solution_variants.is_indexed = 1${learningSpaceId ? " AND portfolios.learning_space_id = ?" : ""}`,
    args: learningSpaceId ? [id, learningSpaceId] : [id],
  });
  const row = result.rows[0];
  if (!row || !bool(row.is_indexed) || (row.section_id != null && !bool(row.section_is_indexed)) || !bool(row.portfolio_is_indexed) || (text(row, "variant_kind") === "alternative" && !bool(row.show_alternative_to_students))) return null;
  const now = new Date();
  const portfolioStatus = resolvePortfolioPublication({ visible: bool(row.portfolio_visible), limited: bool(row.publication_limited), publishFrom: nullableText(row, "portfolio_publish_from"), publishUntil: nullableText(row, "portfolio_publish_until") }, now);
  const sectionStatus = row.section_id == null ? portfolioStatus : resolveChildPublication({ mode: childMode({ visibility_mode: row.section_visibility_mode }), limited: bool(row.section_publication_limited), publishFrom: nullableText(row, "section_publish_from"), publishUntil: nullableText(row, "section_publish_until") }, portfolioStatus, now);
  if (resolveChildPublication({ mode: childMode(row), limited: false, publishFrom: null, publishUntil: null }, sectionStatus, now).state !== "visible") return null;
  return { learningSpaceId: text(row, "learning_space_id"), sourceId: nullableText(row, "source_id") ?? text(row, "relative_path"), fileName: text(row, "file_name"), extension: text(row, "extension") };
}

export async function getAdminResourceAsset(id: string, learningSpaceId?: string) {
  const database = await getDatabase();
  const result = await database.execute({
    sql: `SELECT source_resource_assets.relative_path, source_resource_assets.source_id, source_resource_assets.file_name,
      source_resource_assets.extension, source_resource_assets.resource_scope, portfolios.learning_space_id
      FROM source_resource_assets JOIN portfolios ON portfolios.id = source_resource_assets.portfolio_id
      LEFT JOIN exercises ON exercises.id = source_resource_assets.exercise_id
      WHERE source_resource_assets.id = ? AND source_resource_assets.is_indexed = 1 AND source_resource_assets.archived_at IS NULL
        AND portfolios.is_indexed = 1
        AND (source_resource_assets.resource_scope = 'portfolio' OR exercises.is_indexed = 1)
        ${learningSpaceId ? "AND portfolios.learning_space_id = ?" : ""}`,
    args: learningSpaceId ? [id, learningSpaceId] : [id],
  });
  const row = result.rows[0];
  return row ? {
    learningSpaceId: text(row, "learning_space_id"),
    sourceId: nullableText(row, "source_id") ?? text(row, "relative_path"),
    fileName: text(row, "file_name"),
    extension: text(row, "extension"),
  } : null;
}

export async function getPublicResourceAsset(id: string, learningSpaceId?: string) {
  const database = await getDatabase();
  const result = await database.execute({
    sql: `SELECT source_resource_assets.relative_path, source_resource_assets.source_id, source_resource_assets.file_name,
      source_resource_assets.extension, source_resource_assets.resource_scope, source_resource_assets.semantic_role,
      exercises.section_id, exercises.visibility_mode AS exercise_visibility_mode, exercises.is_indexed AS exercise_is_indexed,
      exercises.show_alternative_to_students,
      sections.visibility_mode AS section_visibility_mode, sections.publication_limited AS section_publication_limited,
      sections.publish_from AS section_publish_from, sections.publish_until AS section_publish_until,
      sections.is_indexed AS section_is_indexed,
      portfolios.visible AS portfolio_visible, portfolios.publication_limited,
      portfolios.publish_from AS portfolio_publish_from, portfolios.publish_until AS portfolio_publish_until,
      portfolios.is_indexed AS portfolio_is_indexed, portfolios.learning_space_id
      FROM source_resource_assets
      JOIN portfolios ON portfolios.id = source_resource_assets.portfolio_id
      LEFT JOIN exercises ON exercises.id = source_resource_assets.exercise_id
      LEFT JOIN sections ON sections.id = exercises.section_id
      WHERE source_resource_assets.id = ? AND source_resource_assets.is_indexed = 1 AND source_resource_assets.archived_at IS NULL
        ${learningSpaceId ? "AND portfolios.learning_space_id = ?" : ""}`,
    args: learningSpaceId ? [id, learningSpaceId] : [id],
  });
  const row = result.rows[0];
  if (!row || !bool(row.portfolio_is_indexed)) return null;
  const now = new Date();
  const portfolioStatus = resolvePortfolioPublication({
    visible: bool(row.portfolio_visible), limited: bool(row.publication_limited),
    publishFrom: nullableText(row, "portfolio_publish_from"), publishUntil: nullableText(row, "portfolio_publish_until"),
  }, now);
  if (portfolioStatus.state !== "visible") return null;

  if (text(row, "resource_scope") === "exercise") {
    if (!bool(row.exercise_is_indexed) || (row.section_id != null && !bool(row.section_is_indexed))) return null;
    if (text(row, "semantic_role") === "alternative_solution" && !bool(row.show_alternative_to_students)) return null;
    const sectionStatus = row.section_id == null ? portfolioStatus : resolveChildPublication({
      mode: childMode({ visibility_mode: row.section_visibility_mode }), limited: bool(row.section_publication_limited),
      publishFrom: nullableText(row, "section_publish_from"), publishUntil: nullableText(row, "section_publish_until"),
    }, portfolioStatus, now);
    const exerciseStatus = resolveChildPublication({
      mode: childMode({ visibility_mode: row.exercise_visibility_mode }), limited: false, publishFrom: null, publishUntil: null,
    }, sectionStatus, now);
    if (exerciseStatus.state !== "visible") return null;
  }

  return {
    learningSpaceId: text(row, "learning_space_id"),
    sourceId: nullableText(row, "source_id") ?? text(row, "relative_path"),
    fileName: text(row, "file_name"),
    extension: text(row, "extension"),
  };
}

export async function getPublicPortfolioDocument(portfolioId: string, kind: PortfolioDocumentKind, learningSpaceId?: string) {
  const database = await getDatabase();
  const result = await database.execute({ sql: `SELECT * FROM portfolios WHERE id = ? AND is_indexed = 1${learningSpaceId ? " AND learning_space_id = ?" : ""}`, args: learningSpaceId ? [portfolioId, learningSpaceId] : [portfolioId] });
  const portfolio = result.rows[0];
  if (!portfolio || resolvePortfolioPublication({ visible: bool(portfolio.visible), limited: bool(portfolio.publication_limited), publishFrom: nullableText(portfolio, "publish_from"), publishUntil: nullableText(portfolio, "publish_until") }).state !== "visible") return null;
  const columns = portfolioDocumentColumns(kind);
  const sourceId = nullableText(portfolio, columns.sourceId);
  const relativePath = nullableText(portfolio, columns.path);
  if (!sourceId && !relativePath) return null;
  const { fileName, extension } = portfolioDocumentFileDescriptor(relativePath);
  return { learningSpaceId: text(portfolio, "learning_space_id"), sourceId: sourceId ?? relativePath!, fileName, extension };
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
  const { fileName, extension } = portfolioDocumentFileDescriptor(relativePath);
  return { learningSpaceId: text(portfolio, "learning_space_id"), sourceId: sourceId ?? relativePath!, fileName, extension };
}

function portfolioDocumentColumns(kind: PortfolioDocumentKind) {
  if (kind === "assignment") return { path: "assignment_pdf_path", sourceId: "assignment_pdf_source_id" } as const;
  if (kind === "hints") return { path: "hints_document_path", sourceId: "hints_document_source_id" } as const;
  return { path: "final_solutions_pdf_path", sourceId: "final_solutions_pdf_source_id" } as const;
}

function portfolioDocumentFileDescriptor(relativePath: string | null) {
  const fileName = (relativePath ?? "document.pdf").split("/").at(-1) ?? "document.pdf";
  const lastDot = fileName.lastIndexOf(".");
  const extension = lastDot > 0 && lastDot < fileName.length - 1
    ? fileName.slice(lastDot + 1).toLowerCase()
    : "pdf";
  return { fileName, extension };
}


export interface CreateErrorReportInput {
  exerciseId?: string;
  exerciseCode?: string;
  learningSpaceId?: string;
  portfolioId?: string;
  documentKind?: ErrorReportDocumentKind;
  variant?: "standard" | "alternative" | null;
  message: string;
  reporterUserId?: string;
  reporterName?: string;
  rateLimitKey: string;
}

export async function getVisiblePortfolioContext(portfolioId: string): Promise<{ id: string; learningSpaceId: string } | null> {
  const result = await (await getDatabase()).execute({
    sql: "SELECT * FROM portfolios WHERE id = ? AND is_indexed = 1",
    args: [portfolioId],
  });
  const portfolio = result.rows[0];
  if (!portfolio || resolvePortfolioPublication({
    visible: bool(portfolio.visible),
    limited: bool(portfolio.publication_limited),
    publishFrom: nullableText(portfolio, "publish_from"),
    publishUntil: nullableText(portfolio, "publish_until"),
  }).state !== "visible") return null;
  return { id: text(portfolio, "id"), learningSpaceId: text(portfolio, "learning_space_id") };
}

export async function createErrorReport(input: CreateErrorReportInput): Promise<{ issueId: string }> {
  if (input.message.trim().length < 3 || input.message.trim().length > 2_000) throw new Error("De melding is ongeldig of de oplossing is niet beschikbaar.");
  const isPortfolioFlow = Boolean(input.portfolioId);
  const initialExercise = input.exerciseId ? await getVisibleExercise(input.exerciseId, input.learningSpaceId) : null;
  if (!isPortfolioFlow && !initialExercise) throw new Error("De melding is ongeldig of de oplossing is niet beschikbaar.");
  const learningSpaceId = input.learningSpaceId ?? initialExercise?.learningSpaceId;
  const portfolioId = input.portfolioId ?? initialExercise?.portfolioId;
  if (!learningSpaceId || !portfolioId) throw new Error("De portfolio is niet beschikbaar.");
  const portfolio = await getStudentPortfolio(portfolioId, learningSpaceId);
  if (!portfolio) throw new Error("De portfolio is niet beschikbaar.");
  const requestedExerciseCode = normalizeErrorReportExerciseCode(input.exerciseCode ?? initialExercise?.code ?? "");
  if (!requestedExerciseCode) throw new Error("Vul een geldige oefening in, bijvoorbeeld 5 of 5a.");
  const portfolioExercise = listErrorReportExerciseIdentities(portfolio.sections, portfolio.exercises)
    .find((item) => initialExercise ? item.id === initialExercise.id : normalizeErrorReportExerciseCode(item.code) === requestedExerciseCode);
  const exerciseId = portfolioExercise?.id ?? null;
  const exercise = exerciseId === initialExercise?.id ? initialExercise : exerciseId ? await getVisibleExercise(exerciseId, learningSpaceId) : null;
  if (initialExercise && (initialExercise.learningSpaceId !== learningSpaceId || initialExercise.portfolioId !== portfolioId)) throw new Error("De gekozen oefening hoort niet bij deze portfolio.");

  const documentKind = input.documentKind ?? (isPortfolioFlow ? "final_solutions" : "exercise_solution");
  let variant: "standard" | "alternative" | null;
  let assetSnapshot: string;
  let sourceLastModifiedAt: string | null = null;
  if (documentKind === "assignment" || documentKind === "hints") {
    if (!isPortfolioFlow || input.variant != null) throw new Error("De gekozen documentvariant is ongeldig.");
    const documentPath = documentKind === "assignment" ? portfolio.assignmentPdfPath : portfolio.hintsDocumentPath;
    if (!documentPath) throw new Error("Het gekozen document is niet beschikbaar.");
    variant = null;
    assetSnapshot = JSON.stringify([{ documentKind, relativePath: documentPath }]);
  } else if (documentKind === "final_solutions" || documentKind === "exercise_solution") {
    variant = input.variant ?? "standard";
    if (variant !== "standard" && variant !== "alternative") throw new Error("De gekozen documentvariant is ongeldig.");
    if (documentKind === "final_solutions") {
      if (!isPortfolioFlow) throw new Error("De gekozen documentvariant is ongeldig.");
      if (!portfolio.finalSolutionsPdfPath) throw new Error("Het gekozen document is niet beschikbaar.");
      if (!exerciseId && variant === "alternative") throw new Error("Voor een onbekende oefening is alleen de standaarduitwerking beschikbaar.");
      if (variant === "alternative" && !portfolioExercise?.hasAlternativeSolution) throw new Error("Deze alternatieve uitwerking bestaat niet.");
      assetSnapshot = JSON.stringify([{ documentKind, relativePath: portfolio.finalSolutionsPdfPath, variant }]);
    } else {
      if (isPortfolioFlow || !exercise) throw new Error("De gekozen documentvariant is ongeldig.");
      const matchingAssets = exercise!.assets.filter((asset) => asset.kind === variant);
      if (matchingAssets.length === 0) throw new Error("Deze oplossingsvariant bestaat niet.");
      assetSnapshot = JSON.stringify(matchingAssets.map((asset) => ({ id: asset.id, fileName: asset.fileName, lastModifiedAt: asset.lastModifiedAt })));
      sourceLastModifiedAt = matchingAssets.map((asset) => asset.lastModifiedAt).filter(Boolean).sort().at(-1) ?? null;
    }
  } else {
    throw new Error("Het gekozen document is ongeldig.");
  }

  const reporterName = input.reporterName?.trim() || null;
  if (reporterName && reporterName.length > 100) throw new Error("De naam mag maximaal 100 tekens bevatten.");
  const database = await getDatabase();
  const sectionId = exerciseId
    ? nullableText((await database.execute({ sql: "SELECT section_id FROM exercises WHERE id = ?", args: [exerciseId] })).rows[0] ?? {}, "section_id")
    : null;
  const now = new Date();
  const windowStartedAt = new Date(Math.floor(now.getTime() / 600_000) * 600_000).toISOString();
  const current = await database.execute({ sql: "SELECT attempts FROM error_report_rate_limits WHERE key = ?", args: [input.rateLimitKey] });
  if (Number(current.rows[0]?.attempts ?? 0) >= 5) throw new ErrorReportRateLimitError();
  const exerciseIdentity = exerciseId ?? `code:${requestedExerciseCode}`;
  const threadId = stableId("error-thread", learningSpaceId, portfolioId, exerciseIdentity);
  await database.execute({
    sql: `INSERT INTO error_report_threads
      (id, learning_space_id, portfolio_id, exercise_id, exercise_code, status, pinned, admin_note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'TODO', 0, '', ?, ?)
      ON CONFLICT DO NOTHING`,
    args: [threadId, learningSpaceId, portfolioId, exerciseId, requestedExerciseCode, now.toISOString(), now.toISOString()],
  });
  const resolvedThread = (await database.execute({
    sql: `SELECT id FROM error_report_threads
      WHERE learning_space_id = ? AND portfolio_id = ?
        AND COALESCE(exercise_id, 'code:' || LOWER(exercise_code)) = ?`,
    args: [learningSpaceId, portfolioId, exerciseIdentity],
  })).rows[0];
  if (!resolvedThread) throw new Error("De foutmelding kon niet worden gegroepeerd.");
  const resolvedThreadId = text(resolvedThread, "id");
  const issueId = stableId("error-issue", learningSpaceId, portfolioId, documentKind, exerciseIdentity, variant ?? "");
  await database.execute({
    sql: `INSERT INTO error_report_issues
      (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, variant_kind, status, pinned, admin_note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TODO', 0, '', ?, ?)
      ON CONFLICT DO NOTHING`,
    args: [issueId, resolvedThreadId, learningSpaceId, portfolioId, exerciseId, requestedExerciseCode, documentKind, variant, now.toISOString(), now.toISOString()],
  });
  const variantCondition = variant === null ? { sql: "variant_kind IS NULL", args: [] } : { sql: "variant_kind = ?", args: [variant] };
  const resolvedIssue = (await database.execute({
    sql: `SELECT id FROM error_report_issues
      WHERE learning_space_id = ? AND portfolio_id = ? AND document_kind = ?
        AND COALESCE(exercise_id, 'code:' || LOWER(exercise_code)) = ?
        AND ${variantCondition.sql}`,
    args: [learningSpaceId, portfolioId, documentKind, exerciseIdentity, ...variantCondition.args],
  })).rows[0];
  if (!resolvedIssue) throw new Error("De foutlocatie kon niet worden opgeslagen.");
  const resolvedIssueId = text(resolvedIssue, "id");
  const reporterUserId = input.reporterUserId ?? null;
  const reportStatement: InStatement = {
    sql: `INSERT INTO error_reports
      (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, source_last_modified_at, message,
        reporter_name, status, pinned, admin_note, created_at, completed_at, updated_at, issue_id, reporter_user_id,
        handled_at, student_dismissed_at, teacher_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'TODO', 0, '', ?, NULL, ?, ?, ?, NULL, NULL, NULL)`,
    args: [randomUUID(), portfolioId, sectionId, exerciseId, variant ?? "standard", assetSnapshot,
      sourceLastModifiedAt, input.message.trim(), reporterUserId ? null : reporterName,
      now.toISOString(), now.toISOString(), resolvedIssueId, reporterUserId],
  };
  await database.batch([
    { sql: "DELETE FROM error_report_rate_limits WHERE window_started_at < ?", args: [new Date(now.getTime() - 3_600_000).toISOString()] },
    { sql: `INSERT INTO error_report_rate_limits (key, window_started_at, attempts) VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET attempts = error_report_rate_limits.attempts + 1, window_started_at = excluded.window_started_at`, args: [input.rateLimitKey, windowStartedAt] },
    reportStatement,
    { sql: `UPDATE error_report_issues SET status = 'TODO', completed_at = NULL, updated_at = ? WHERE id = ?`, args: [now.toISOString(), resolvedIssueId] },
    { sql: `UPDATE error_report_threads SET status = 'TODO', updated_at = ? WHERE id = ?`, args: [now.toISOString(), resolvedThreadId] },
  ]);
  return { issueId: resolvedIssueId };
}

export interface AdminErrorReport {
  id: string;
  portfolioId: string;
  portfolioCode: string;
  portfolioTitle: string;
  sectionTitle: string | null;
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
  handledAt: string | null;
  studentDismissedAt: string | null;
  teacherResponse: string | null;
  solutionConfiguredVisible: boolean;
  solutionStatus: EffectivePublication;
  solutionVisible: boolean;
}

export type ErrorReportDocumentKind = "assignment" | "final_solutions" | "hints" | "exercise_solution";

export interface ErrorReportIssue {
  id: string;
  threadId: string;
  learningSpaceId: string;
  portfolioId: string;
  exerciseId: string | null;
  exerciseCode: string;
  documentKind: ErrorReportDocumentKind;
  variantKind: "standard" | "alternative" | null;
  status: "TODO" | "DONE";
  pinned: boolean;
  adminNote: string;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface GroupedErrorReportIssue extends Omit<ErrorReportIssue, "variantKind"> {
  portfolioCode: string;
  portfolioTitle: string;
  sectionTitle: string | null;
  isMatchedExercise: boolean;
  variant: "standard" | "alternative" | null;
  reportCount: number;
  reporterCount: number;
  latestReportAt: string | null;
  hasLegacyAnonymousReports: boolean;
  solutionConfiguredVisible: boolean | null;
  solutionStatus: EffectivePublication | null;
}

export interface ErrorReportIssueDetail {
  id: string;
  issueId: string;
  reporterUserId: string | null;
  reporterName: string | null;
  reporterDisplayName: string | null;
  message: string;
  createdAt: string;
  handledAt: string | null;
  studentDismissedAt: string | null;
  teacherResponse: string | null;
}

export interface GroupedErrorReportThread {
  id: string;
  learningSpaceId: string;
  portfolioId: string;
  portfolioCode: string;
  portfolioTitle: string;
  exerciseId: string | null;
  exerciseCode: string;
  sectionTitle: string | null;
  isMatchedExercise: boolean;
  status: "TODO" | "DONE";
  pinned: boolean;
  adminNote: string;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
  issueCount: number;
  reportCount: number;
  latestReportAt: string | null;
  customNote: string | null;
  noteLabel: string | null;
  notePosition: ExerciseNotePosition | null;
  solutionConfiguredVisible: boolean | null;
  solutionStatus: EffectivePublication | null;
}

export interface ErrorReportThreadIssueDetail {
  threadId: string;
  issueId: string;
  documentKind: ErrorReportDocumentKind;
  variant: "standard" | "alternative" | null;
  reportCount: number;
  latestReportAt: string | null;
  reports: ErrorReportIssueDetail[];
}

export async function getErrorReportIssue(id: string): Promise<ErrorReportIssue | null> {
  const row = (await (await getDatabase()).execute({
    sql: "SELECT * FROM error_report_issues WHERE id = ?",
    args: [id],
  })).rows[0];
  if (!row) return null;
  return {
    id: text(row, "id"),
    threadId: text(row, "thread_id"),
    learningSpaceId: text(row, "learning_space_id"),
    portfolioId: text(row, "portfolio_id"),
    exerciseId: nullableText(row, "exercise_id"),
    exerciseCode: text(row, "exercise_code"),
    documentKind: text(row, "document_kind") as ErrorReportDocumentKind,
    variantKind: nullableText(row, "variant_kind") as "standard" | "alternative" | null,
    status: text(row, "status") === "DONE" ? "DONE" : "TODO",
    pinned: bool(row.pinned),
    adminNote: nullableText(row, "admin_note") ?? "",
    createdAt: text(row, "created_at"),
    completedAt: nullableText(row, "completed_at"),
    updatedAt: text(row, "updated_at"),
  };
}

export async function getGroupedErrorReportIssues(learningSpaceId?: string): Promise<GroupedErrorReportIssue[]> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const result = await database.execute({
    sql: `SELECT error_report_issues.*, portfolios.portfolio_code, portfolios.title AS portfolio_title,
      portfolios.title_override, exercises.section_id, sections.title AS section_title,
      exercises.visibility_mode AS exercise_visibility_mode,
      sections.visibility_mode AS section_visibility_mode,
      sections.publication_limited AS section_publication_limited,
      sections.publish_from AS section_publish_from,
      sections.publish_until AS section_publish_until,
      portfolios.visible AS portfolio_visible,
      portfolios.publication_limited,
      portfolios.publish_from AS portfolio_publish_from,
      portfolios.publish_until AS portfolio_publish_until,
      COALESCE(report_summary.report_count, 0) AS report_count,
      COALESCE(report_summary.reporter_count, 0) AS reporter_count,
      report_summary.latest_report_at,
      COALESCE(report_summary.has_legacy_anonymous_reports, 0) AS has_legacy_anonymous_reports
      FROM error_report_issues
      INNER JOIN portfolios ON portfolios.id = error_report_issues.portfolio_id
      LEFT JOIN exercises ON exercises.id = error_report_issues.exercise_id
      LEFT JOIN sections ON sections.id = exercises.section_id
      LEFT JOIN (
        SELECT issue_id, COUNT(*) AS report_count,
          COUNT(DISTINCT reporter_user_id) AS reporter_count,
          MAX(created_at) AS latest_report_at,
          MAX(CASE WHEN reporter_user_id IS NULL THEN 1 ELSE 0 END) AS has_legacy_anonymous_reports
        FROM error_reports
        WHERE issue_id IS NOT NULL
        GROUP BY issue_id
      ) report_summary ON report_summary.issue_id = error_report_issues.id
      WHERE error_report_issues.learning_space_id = ?
      ORDER BY error_report_issues.pinned DESC,
        CASE error_report_issues.status WHEN 'TODO' THEN 0 ELSE 1 END,
        error_report_issues.updated_at DESC,
        error_report_issues.id`,
    args: [spaceId],
  });
  const now = new Date();
  return result.rows.map((row) => {
    const exerciseId = nullableText(row, "exercise_id");
    const portfolioStatus = resolvePortfolioPublication({ visible: bool(row.portfolio_visible), limited: bool(row.publication_limited), publishFrom: nullableText(row, "portfolio_publish_from"), publishUntil: nullableText(row, "portfolio_publish_until") }, now);
    const sectionStatus = exerciseId ? row.section_id == null ? portfolioStatus : resolveChildPublication({ mode: childMode({ visibility_mode: row.section_visibility_mode }), limited: bool(row.section_publication_limited), publishFrom: nullableText(row, "section_publish_from"), publishUntil: nullableText(row, "section_publish_until") }, portfolioStatus, now) : null;
    const solutionStatus = sectionStatus ? resolveChildPublication({ mode: childMode({ visibility_mode: row.exercise_visibility_mode }), limited: false, publishFrom: null, publishUntil: null }, sectionStatus, now) : null;
    return {
      id: text(row, "id"),
      threadId: text(row, "thread_id"),
      learningSpaceId: text(row, "learning_space_id"),
      portfolioId: text(row, "portfolio_id"),
      portfolioCode: text(row, "portfolio_code"),
      portfolioTitle: nullableText(row, "title_override") ?? text(row, "portfolio_title"),
      sectionTitle: nullableText(row, "section_title") ?? (exerciseId ? null : "Onbekende oefening"),
      exerciseId,
      exerciseCode: text(row, "exercise_code"),
      isMatchedExercise: exerciseId !== null,
      documentKind: text(row, "document_kind") as ErrorReportDocumentKind,
      variant: nullableText(row, "variant_kind") as "standard" | "alternative" | null,
      status: text(row, "status") === "DONE" ? "DONE" : "TODO",
      pinned: bool(row.pinned),
      adminNote: nullableText(row, "admin_note") ?? "",
      createdAt: text(row, "created_at"),
      completedAt: nullableText(row, "completed_at"),
      updatedAt: text(row, "updated_at"),
      reportCount: Number(row.report_count),
      reporterCount: Number(row.reporter_count),
      latestReportAt: nullableText(row, "latest_report_at"),
      hasLegacyAnonymousReports: bool(row.has_legacy_anonymous_reports),
      solutionConfiguredVisible: exerciseId ? childMode({ visibility_mode: row.exercise_visibility_mode }) === "visible" : null,
      solutionStatus,
    };
  });
}

export async function getGroupedErrorReportThreads(learningSpaceId?: string): Promise<GroupedErrorReportThread[]> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const result = await database.execute({
    sql: `SELECT error_report_threads.*, portfolios.portfolio_code, portfolios.title AS portfolio_title,
      portfolios.title_override, exercises.section_id, sections.title AS section_title,
      exercises.custom_note, exercises.note_label, exercises.note_position,
      exercises.visibility_mode AS exercise_visibility_mode,
      sections.visibility_mode AS section_visibility_mode,
      sections.publication_limited AS section_publication_limited,
      sections.publish_from AS section_publish_from,
      sections.publish_until AS section_publish_until,
      portfolios.visible AS portfolio_visible,
      portfolios.publication_limited,
      portfolios.publish_from AS portfolio_publish_from,
      portfolios.publish_until AS portfolio_publish_until,
      COALESCE(thread_summary.issue_count, 0) AS issue_count,
      COALESCE(thread_summary.report_count, 0) AS report_count,
      thread_summary.latest_report_at
      FROM error_report_threads
      INNER JOIN portfolios ON portfolios.id = error_report_threads.portfolio_id
      LEFT JOIN exercises ON exercises.id = error_report_threads.exercise_id
      LEFT JOIN sections ON sections.id = exercises.section_id
      LEFT JOIN (
        SELECT error_report_issues.thread_id,
          COUNT(DISTINCT error_report_issues.id) AS issue_count,
          COUNT(error_reports.id) AS report_count,
          MAX(error_reports.created_at) AS latest_report_at
        FROM error_report_issues
        LEFT JOIN error_reports ON error_reports.issue_id = error_report_issues.id
        GROUP BY error_report_issues.thread_id
      ) thread_summary ON thread_summary.thread_id = error_report_threads.id
      WHERE error_report_threads.learning_space_id = ?
      ORDER BY error_report_threads.pinned DESC,
        CASE error_report_threads.status WHEN 'TODO' THEN 0 ELSE 1 END,
        error_report_threads.updated_at DESC,
        error_report_threads.id`,
    args: [spaceId],
  });
  const now = new Date();
  return result.rows.map((row) => {
    const exerciseId = nullableText(row, "exercise_id");
    const portfolioStatus = resolvePortfolioPublication({ visible: bool(row.portfolio_visible), limited: bool(row.publication_limited), publishFrom: nullableText(row, "portfolio_publish_from"), publishUntil: nullableText(row, "portfolio_publish_until") }, now);
    const sectionStatus = exerciseId ? row.section_id == null ? portfolioStatus : resolveChildPublication({ mode: childMode({ visibility_mode: row.section_visibility_mode }), limited: bool(row.section_publication_limited), publishFrom: nullableText(row, "section_publish_from"), publishUntil: nullableText(row, "section_publish_until") }, portfolioStatus, now) : null;
    const solutionStatus = sectionStatus ? resolveChildPublication({ mode: childMode({ visibility_mode: row.exercise_visibility_mode }), limited: false, publishFrom: null, publishUntil: null }, sectionStatus, now) : null;
    return {
      id: text(row, "id"),
      learningSpaceId: text(row, "learning_space_id"),
      portfolioId: text(row, "portfolio_id"),
      portfolioCode: text(row, "portfolio_code"),
      portfolioTitle: nullableText(row, "title_override") ?? text(row, "portfolio_title"),
      exerciseId,
      exerciseCode: text(row, "exercise_code"),
      sectionTitle: nullableText(row, "section_title") ?? (exerciseId ? null : "Onbekende oefening"),
      isMatchedExercise: exerciseId !== null,
      status: text(row, "status") === "DONE" ? "DONE" : "TODO",
      pinned: bool(row.pinned),
      adminNote: nullableText(row, "admin_note") ?? "",
      createdAt: text(row, "created_at"),
      completedAt: nullableText(row, "completed_at"),
      updatedAt: text(row, "updated_at"),
      issueCount: Number(row.issue_count),
      reportCount: Number(row.report_count),
      latestReportAt: nullableText(row, "latest_report_at"),
      customNote: exerciseId ? nullableText(row, "custom_note") : null,
      noteLabel: exerciseId ? nullableText(row, "note_label") : null,
      notePosition: exerciseId ? text(row, "note_position") as ExerciseNotePosition : null,
      solutionConfiguredVisible: exerciseId ? childMode({ visibility_mode: row.exercise_visibility_mode }) === "visible" : null,
      solutionStatus,
    };
  });
}

export async function listErrorReportIssuesForThreads(threadIds: string[], learningSpaceId?: string): Promise<ErrorReportThreadIssueDetail[]> {
  if (threadIds.length === 0) return [];
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const placeholders = threadIds.map(() => "?").join(", ");
  const result = await database.execute({
    sql: `SELECT error_report_issues.thread_id, error_report_issues.id AS issue_id,
      error_report_issues.document_kind, error_report_issues.variant_kind,
      error_reports.id AS report_id, error_reports.reporter_user_id, error_reports.reporter_name,
      users.display_name AS reporter_display_name, error_reports.message, error_reports.created_at AS report_created_at,
      error_reports.handled_at, error_reports.student_dismissed_at, error_reports.teacher_response,
      COUNT(error_reports.id) OVER (PARTITION BY error_report_issues.id) AS report_count,
      MAX(error_reports.created_at) OVER (PARTITION BY error_report_issues.id) AS latest_report_at
      FROM error_report_issues
      INNER JOIN error_report_threads ON error_report_threads.id = error_report_issues.thread_id
      LEFT JOIN error_reports ON error_reports.issue_id = error_report_issues.id
      LEFT JOIN users ON users.id = error_reports.reporter_user_id
      WHERE error_report_issues.thread_id IN (${placeholders})
        AND error_report_threads.learning_space_id = ?
      ORDER BY latest_report_at DESC, error_report_issues.id,
        error_reports.created_at DESC, error_reports.id DESC`,
    args: [...threadIds, spaceId],
  });
  const issues = new Map<string, ErrorReportThreadIssueDetail>();
  for (const row of result.rows) {
    const issueId = text(row, "issue_id");
    let issue = issues.get(issueId);
    if (!issue) {
      issue = {
        threadId: text(row, "thread_id"),
        issueId,
        documentKind: text(row, "document_kind") as ErrorReportDocumentKind,
        variant: nullableText(row, "variant_kind") as "standard" | "alternative" | null,
        reportCount: Number(row.report_count),
        latestReportAt: nullableText(row, "latest_report_at"),
        reports: [],
      };
      issues.set(issueId, issue);
    }
    const reportId = nullableText(row, "report_id");
    if (reportId) {
      issue.reports.push({
        id: reportId,
        issueId,
        reporterUserId: nullableText(row, "reporter_user_id"),
        reporterName: nullableText(row, "reporter_name"),
        reporterDisplayName: nullableText(row, "reporter_display_name"),
        message: text(row, "message"),
        createdAt: text(row, "report_created_at"),
        handledAt: nullableText(row, "handled_at"),
        studentDismissedAt: nullableText(row, "student_dismissed_at"),
        teacherResponse: nullableText(row, "teacher_response"),
      });
    }
  }
  return [...issues.values()];
}

export async function listErrorReportsForIssue(issueId: string, learningSpaceId?: string): Promise<ErrorReportIssueDetail[]> {
  return (await listErrorReportsForIssues([issueId], learningSpaceId)).filter((report) => report.issueId === issueId);
}

export async function listErrorReportsForIssues(issueIds: string[], learningSpaceId?: string): Promise<ErrorReportIssueDetail[]> {
  if (issueIds.length === 0) return [];
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const placeholders = issueIds.map(() => "?").join(", ");
  const result = await database.execute({
    sql: `SELECT error_reports.id, error_reports.issue_id, error_reports.reporter_user_id,
      error_reports.reporter_name, users.display_name AS reporter_display_name,
      error_reports.message, error_reports.created_at, error_reports.handled_at,
      error_reports.student_dismissed_at, error_reports.teacher_response
      FROM error_reports
      INNER JOIN error_report_issues ON error_report_issues.id = error_reports.issue_id
      LEFT JOIN users ON users.id = error_reports.reporter_user_id
      WHERE error_reports.issue_id IN (${placeholders}) AND error_report_issues.learning_space_id = ?
      ORDER BY error_reports.created_at DESC, error_reports.id DESC`,
    args: [...issueIds, spaceId],
  });
  return result.rows.map((row) => ({
    id: text(row, "id"),
    issueId: text(row, "issue_id"),
    reporterUserId: nullableText(row, "reporter_user_id"),
    reporterName: nullableText(row, "reporter_name"),
    reporterDisplayName: nullableText(row, "reporter_display_name"),
    message: text(row, "message"),
    createdAt: text(row, "created_at"),
    handledAt: nullableText(row, "handled_at"),
    studentDismissedAt: nullableText(row, "student_dismissed_at"),
    teacherResponse: nullableText(row, "teacher_response"),
  }));
}

export async function getOpenErrorIssueCount(learningSpaceId?: string): Promise<number> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const result = await database.execute({
    sql: "SELECT COUNT(*) AS count FROM error_report_issues WHERE status = 'TODO' AND learning_space_id = ?",
    args: [spaceId],
  });
  return Number(result.rows[0]?.count ?? 0);
}

export async function getOpenErrorThreadCount(learningSpaceId?: string): Promise<number> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const result = await database.execute({
    sql: "SELECT COUNT(*) AS count FROM error_report_threads WHERE status = 'TODO' AND learning_space_id = ?",
    args: [spaceId],
  });
  return Number(result.rows[0]?.count ?? 0);
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
    FROM error_reports JOIN portfolios ON portfolios.id = error_reports.portfolio_id LEFT JOIN sections ON sections.id = error_reports.section_id
    JOIN exercises ON exercises.id = error_reports.exercise_id WHERE portfolios.learning_space_id = ?`, args: [spaceId] });
  const now = new Date();
  return result.rows.map((row) => {
    const portfolioStatus = resolvePortfolioPublication({ visible: bool(row.portfolio_visible), limited: bool(row.publication_limited), publishFrom: nullableText(row, "portfolio_publish_from"), publishUntil: nullableText(row, "portfolio_publish_until") }, now);
    const sectionStatus = row.section_id == null ? portfolioStatus : resolveChildPublication({ mode: childMode({ visibility_mode: row.section_visibility_mode }), limited: bool(row.section_publication_limited), publishFrom: nullableText(row, "section_publish_from"), publishUntil: nullableText(row, "section_publish_until") }, portfolioStatus, now);
    const solutionStatus = resolveChildPublication({ mode: childMode({ visibility_mode: row.exercise_visibility_mode }), limited: false, publishFrom: null, publishUntil: null }, sectionStatus, now);
    return { id: text(row, "id"), portfolioId: text(row, "portfolio_id"), portfolioCode: text(row, "portfolio_code"), portfolioTitle: nullableText(row, "title_override") ?? text(row, "portfolio_title"), sectionTitle: nullableText(row, "section_title"), exerciseId: text(row, "exercise_id"), exerciseCode: text(row, "exercise_code"), variant: text(row, "variant_kind"), message: text(row, "message"), reporterName: nullableText(row, "reporter_name"), status: text(row, "status") === "DONE" ? "DONE" : "TODO", pinned: bool(row.pinned), adminNote: nullableText(row, "admin_note") ?? "", createdAt: text(row, "created_at"), completedAt: nullableText(row, "completed_at"), handledAt: nullableText(row, "handled_at"), studentDismissedAt: nullableText(row, "student_dismissed_at"), teacherResponse: nullableText(row, "teacher_response"), solutionConfiguredVisible: childMode({ visibility_mode: row.exercise_visibility_mode }) === "visible", solutionStatus, solutionVisible: solutionStatus.state === "visible" };
  });
}

export async function getErrorReportLearningSpaceId(id: string): Promise<string | null> {
  const row = (await (await getDatabase()).execute({
    sql: `SELECT portfolios.learning_space_id FROM error_reports
      INNER JOIN error_report_issues ON error_report_issues.id = error_reports.issue_id
      INNER JOIN error_report_threads ON error_report_threads.id = error_report_issues.thread_id
      INNER JOIN portfolios ON portfolios.id = error_report_threads.portfolio_id
        AND portfolios.learning_space_id = error_report_threads.learning_space_id
      WHERE error_reports.id = ?`,
    args: [id],
  })).rows[0];
  return row ? text(row, "learning_space_id") : null;
}

export async function getErrorReportThreadLearningSpaceId(threadId: string): Promise<string | null> {
  const row = (await (await getDatabase()).execute({
    sql: `SELECT portfolios.learning_space_id FROM error_report_threads
      INNER JOIN portfolios ON portfolios.id = error_report_threads.portfolio_id
      WHERE error_report_threads.id = ?`,
    args: [threadId],
  })).rows[0];
  return row ? text(row, "learning_space_id") : null;
}

export async function setErrorReportThreadStatus(threadId: string, status: "TODO" | "DONE"): Promise<void> {
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: "UPDATE error_report_threads SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?",
    args: [status, status === "DONE" ? now : null, now, threadId],
  });
}

export async function toggleErrorReportThreadPin(threadId: string): Promise<void> {
  await (await getDatabase()).execute({
    sql: "UPDATE error_report_threads SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?",
    args: [new Date().toISOString(), threadId],
  });
}

export async function saveErrorReportThreadNote(threadId: string, note: string): Promise<void> {
  await (await getDatabase()).execute({
    sql: "UPDATE error_report_threads SET admin_note = ?, updated_at = ? WHERE id = ?",
    args: [note.slice(0, 4000), new Date().toISOString(), threadId],
  });
}

export async function setErrorReportTeacherResponse(id: string, response: string | null): Promise<void> {
  await (await getDatabase()).execute({
    sql: "UPDATE error_reports SET teacher_response = ? WHERE id = ?",
    args: [response, id],
  });
}

export async function setErrorReportHandled(id: string, handled: boolean): Promise<void> {
  await (await getDatabase()).execute({
    sql: "UPDATE error_reports SET handled_at = ?, student_dismissed_at = NULL WHERE id = ?",
    args: [handled ? new Date().toISOString() : null, id],
  });
}

export async function setErrorReportTeacherResponseAndHandled(id: string, response: string | null): Promise<void> {
  const now = new Date().toISOString();
  await (await getDatabase()).batch([
    { sql: "UPDATE error_reports SET teacher_response = ? WHERE id = ?", args: [response, id] },
    { sql: "UPDATE error_reports SET handled_at = ?, student_dismissed_at = NULL WHERE id = ?", args: [now, id] },
  ]);
}

export async function deleteErrorReport(id: string): Promise<void> {
  const database = await getDatabase();
  const context = (await database.execute({
    sql: `SELECT error_reports.issue_id, error_report_issues.thread_id
      FROM error_reports
      INNER JOIN error_report_issues ON error_report_issues.id = error_reports.issue_id
      WHERE error_reports.id = ?`,
    args: [id],
  })).rows[0];
  if (!context) return;
  const issueId = text(context, "issue_id");
  const threadId = text(context, "thread_id");
  await database.batch([
    { sql: "DELETE FROM error_reports WHERE id = ? AND issue_id = ?", args: [id, issueId] },
    { sql: "DELETE FROM error_report_issues WHERE id = ? AND NOT EXISTS (SELECT 1 FROM error_reports WHERE issue_id = ?)", args: [issueId, issueId] },
    { sql: "DELETE FROM error_report_threads WHERE id = ? AND NOT EXISTS (SELECT 1 FROM error_report_issues WHERE thread_id = ?)", args: [threadId, threadId] },
  ]);
}

export async function getOldDoneErrorThreadCount(now = new Date(), learningSpaceId?: string): Promise<number> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const result = await database.execute({ sql: "SELECT COUNT(*) AS count FROM error_report_threads WHERE status = 'DONE' AND completed_at < ? AND learning_space_id = ?", args: [cutoff, spaceId] });
  return Number(result.rows[0]?.count ?? 0);
}

export async function deleteOldDoneErrorThreads(now = new Date(), learningSpaceId?: string): Promise<void> {
  const database = await getDatabase();
  const spaceId = learningSpaceId ?? await defaultLearningSpaceId();
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const targetThreads = "SELECT id FROM error_report_threads WHERE status = 'DONE' AND completed_at < ? AND learning_space_id = ?";
  await database.batch([
    { sql: `DELETE FROM error_reports WHERE issue_id IN (SELECT id FROM error_report_issues WHERE thread_id IN (${targetThreads}))`, args: [cutoff, spaceId] },
    { sql: `DELETE FROM error_report_issues WHERE thread_id IN (${targetThreads})`, args: [cutoff, spaceId] },
    { sql: `DELETE FROM error_report_threads WHERE id IN (${targetThreads})`, args: [cutoff, spaceId] },
  ]);
}
