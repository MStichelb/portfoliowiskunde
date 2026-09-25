import "server-only";

import { requireLearningSpaceManagement } from "@/lib/authorization";
import type { DatabaseRow } from "@/lib/database";
import { getDatabase } from "@/lib/database";
import type { AppUser } from "@/lib/identity";
import { portfolioCodeFromRelativePath } from "@/lib/parser";
import type { LearningSpaceSourceRole, StorageSourceType } from "@/lib/repositories";

export type SourceStatusAssessmentState = "no_problem_detected" | "attention_required" | "unknown";
export type SourceValidationState = "valid" | "invalid" | "unknown";
export type SyncAttemptResult = "succeeded" | "failed" | "running" | "unknown";

export interface LearningSpaceSourceStatusSource {
  id: string;
  role: LearningSpaceSourceRole;
  providerType: StorageSourceType;
  isActive: boolean;
  lastKnownValidation: {
    state: SourceValidationState;
    checkedAt: string | null;
    message: string | null;
  };
  mirrorCompletedAt: string | null;
}

export interface LearningSpaceSourceStatusSyncAttempt {
  sourceId: string | null;
  providerType: StorageSourceType | null;
  startedAt: string;
  finishedAt: string | null;
  result: SyncAttemptResult;
  portfolioCount: number | null;
  warningCount: number | null;
  failureMessage: string | null;
}

export interface KnownMissingSourceContent {
  state: "known";
  portfolios: number;
  sections: number;
  exercises: number;
  legacySolutionAssets: number;
  genericPortfolioResources: number;
  genericExerciseResources: number;
  genericResources: number;
  overlappingLegacyAndGenericExerciseAssets: number;
  totalFilesAndResources: number;
}

export interface UnknownMissingSourceContent {
  state: "unknown";
  portfolios: null;
  sections: null;
  exercises: null;
  legacySolutionAssets: null;
  genericPortfolioResources: null;
  genericExerciseResources: null;
  genericResources: null;
  overlappingLegacyAndGenericExerciseAssets: null;
  totalFilesAndResources: null;
}

export type MissingSourceContent = KnownMissingSourceContent | UnknownMissingSourceContent;

export interface LearningSpaceSourceStatusWarning {
  severity: "info" | "warning" | "unknown";
  relativePath: string;
  message: string;
  portfolio: {
    id: string;
    code: string;
    title: string;
  } | null;
}

export type LearningSpaceSourceWarnings = {
  state: "known";
  basedOnSuccessfulSyncAt: string;
  count: number;
  items: LearningSpaceSourceStatusWarning[];
} | {
  state: "unknown";
  basedOnSuccessfulSyncAt: null;
  count: null;
  items: null;
};

export type SourceStatusReason =
  | "no_active_source"
  | "active_source_not_checked"
  | "active_source_invalid"
  | "mirror_not_checked"
  | "mirror_invalid"
  | "no_usable_index"
  | "latest_sync_failed"
  | "missing_content"
  | "sync_warnings"
  | "profile_index_alignment_unknown";

export interface LearningSpaceSourceStatus {
  learningSpaceId: string;
  isArchived: boolean;
  observedAt: string;
  activeSource: LearningSpaceSourceStatusSource | null;
  sources: LearningSpaceSourceStatusSource[];
  profile: {
    id: string;
    name: string;
    configVersion: number;
    updatedAt: string;
    assignmentUpdatedAt: string;
  } | null;
  synchronization: {
    latestAttempt: LearningSpaceSourceStatusSyncAttempt | null;
    latestSuccessful: LearningSpaceSourceStatusSyncAttempt | null;
    inProgress: {
      state: "inferred_running" | "not_detected";
      evidence: "active_sync_lease" | "no_active_sync_lease";
      leaseExpiresAt: string | null;
    };
    usableIndex: {
      available: boolean;
      state: "available_from_latest_success" | "available_from_previous_success" | "available_while_syncing" | "available_without_sync_history" | "unavailable";
    };
    profileIndexAlignment: {
      state: "confirmed_current" | "unknown";
      reason: "profile_and_assignment_unchanged_since_sync" | "no_successful_sync" | "profile_missing" | "profile_or_assignment_changed_after_sync";
    };
  };
  missingContent: MissingSourceContent;
  warnings: LearningSpaceSourceWarnings;
  assessment: {
    state: SourceStatusAssessmentState;
    reasons: SourceStatusReason[];
    evidence: "stored_state_only";
  };
}

interface MissingCountSnapshot {
  portfolios: number;
  sections: number;
  exercises: number;
  legacySolutionAssets: number;
  genericPortfolioResources: number;
  genericExerciseResources: number;
  overlappingLegacyAndGenericExerciseAssets: number;
  hasIndexedPortfolio: boolean;
}

interface SourceProfileStatusRow {
  id: string;
  name: string;
  configVersion: number;
  updatedAt: string;
  assignmentUpdatedAt: string;
}

export async function getLearningSpaceSourceStatus(
  user: AppUser,
  learningSpaceId: string,
  now = new Date(),
): Promise<LearningSpaceSourceStatus> {
  await requireLearningSpaceManagement(user, learningSpaceId);
  const database = await getDatabase();
  const observedAt = now.toISOString();
  const [spaceAndSources, profileResult, latestAttemptResult, latestSuccessfulResult, countResult, warningResult, warningPortfolioResult, leaseResult] = await Promise.all([
    database.execute({
      sql: `SELECT learning_spaces.id AS learning_space_id, learning_spaces.is_active AS learning_space_is_active,
        learning_spaces.archived_at AS learning_space_archived_at,
        learning_space_sources.id AS source_id, learning_space_sources.role AS source_role,
        learning_space_sources.provider_type AS source_provider_type, learning_space_sources.is_active AS source_is_active,
        learning_space_sources.last_validated_at, learning_space_sources.last_validation_status,
        learning_space_sources.last_validation_message, learning_space_sources.mirror_completed_at
        FROM learning_spaces
        LEFT JOIN learning_space_sources ON learning_space_sources.learning_space_id = learning_spaces.id
        WHERE learning_spaces.id = ?
        ORDER BY CASE WHEN learning_space_sources.role = 'primary' THEN 0 ELSE 1 END`,
      args: [learningSpaceId],
    }),
    database.execute({
      sql: `SELECT source_profiles.id, source_profiles.name, source_profiles.config_version,
        source_profiles.updated_at AS profile_updated_at, learning_space_source_profiles.updated_at AS assignment_updated_at
        FROM learning_space_source_profiles
        INNER JOIN source_profiles ON source_profiles.id = learning_space_source_profiles.source_profile_id
        WHERE learning_space_source_profiles.learning_space_id = ? AND source_profiles.archived_at IS NULL`,
      args: [learningSpaceId],
    }),
    database.execute({
      sql: "SELECT * FROM sync_runs WHERE learning_space_id = ? ORDER BY started_at DESC LIMIT 1",
      args: [learningSpaceId],
    }),
    database.execute({
      sql: "SELECT * FROM sync_runs WHERE learning_space_id = ? AND status = 'completed' ORDER BY finished_at DESC, started_at DESC LIMIT 1",
      args: [learningSpaceId],
    }),
    database.execute({ sql: missingCountSql(), args: Array(9).fill(learningSpaceId) }),
    database.execute({
      sql: `SELECT sync_warnings.severity, sync_warnings.relative_path, sync_warnings.message
        FROM sync_warnings
        WHERE sync_warnings.sync_run_id = (
          SELECT id FROM sync_runs WHERE learning_space_id = ? AND status = 'completed'
          ORDER BY finished_at DESC, started_at DESC LIMIT 1
        ) ORDER BY sync_warnings.relative_path, sync_warnings.message`,
      args: [learningSpaceId],
    }),
    database.execute({
      sql: `SELECT id, COALESCE(portfolio_code, code) AS portfolio_code,
        COALESCE(title_override, title) AS portfolio_title
        FROM portfolios
        WHERE learning_space_id = ? AND archived_at IS NULL`,
      args: [learningSpaceId],
    }),
    database.execute({
      sql: "SELECT acquired_until FROM sync_leases WHERE learning_space_id = ? AND acquired_until > ? LIMIT 1",
      args: [learningSpaceId, observedAt],
    }),
  ]);

  const spaceRow = spaceAndSources.rows[0];
  if (!spaceRow) throw new Error("Leeromgeving niet gevonden.");
  const sources = spaceAndSources.rows
    .filter((row) => nullableText(row.source_id) !== null)
    .map(sourceStatusFromRow);
  const activeSource = sources.find((source) => source.isActive) ?? null;
  const profile = profileResult.rows[0] ? sourceProfileStatusFromRow(profileResult.rows[0]) : null;
  const latestAttempt = latestAttemptResult.rows[0] ? syncAttemptFromRow(latestAttemptResult.rows[0]) : null;
  const latestSuccessful = latestSuccessfulResult.rows[0] ? syncAttemptFromRow(latestSuccessfulResult.rows[0]) : null;
  const counts = missingCountsFromRow(countResult.rows[0] ?? {});
  const hasUsableIndex = latestSuccessful !== null || counts.hasIndexedPortfolio;
  const leaseExpiresAt = nullableText(leaseResult.rows[0]?.acquired_until);
  const inProgress = leaseExpiresAt !== null;
  const profileIndexAlignment = determineProfileIndexAlignment(profile, latestSuccessful);
  const missingContent = hasUsableIndex ? knownMissingContent(counts) : unknownMissingContent();
  const warnings = latestSuccessful?.finishedAt
    ? knownWarnings(latestSuccessful.finishedAt, warningResult.rows, warningPortfolioResult.rows)
    : unknownWarnings();
  const usableIndexState = determineUsableIndexState(hasUsableIndex, inProgress, latestAttempt, latestSuccessful);
  const assessment = assessStatus(activeSource, sources, latestAttempt, hasUsableIndex, missingContent, warnings, profileIndexAlignment.state);

  return {
    learningSpaceId,
    isArchived: !bool(spaceRow.learning_space_is_active) || nullableText(spaceRow.learning_space_archived_at) !== null,
    observedAt,
    activeSource,
    sources,
    profile,
    synchronization: {
      latestAttempt,
      latestSuccessful,
      inProgress: {
        state: inProgress ? "inferred_running" : "not_detected",
        evidence: inProgress ? "active_sync_lease" : "no_active_sync_lease",
        leaseExpiresAt,
      },
      usableIndex: { available: hasUsableIndex, state: usableIndexState },
      profileIndexAlignment,
    },
    missingContent,
    warnings,
    assessment,
  };
}

function missingCountSql(): string {
  return `SELECT
    (SELECT COUNT(*) FROM portfolios WHERE learning_space_id = ? AND is_indexed = 0 AND archived_at IS NULL) AS missing_portfolios,
    (SELECT COUNT(*) FROM sections INNER JOIN portfolios ON portfolios.id = sections.portfolio_id
      WHERE portfolios.learning_space_id = ? AND portfolios.archived_at IS NULL
        AND sections.is_indexed = 0 AND sections.archived_at IS NULL) AS missing_sections,
    (SELECT COUNT(*) FROM exercises INNER JOIN sections ON sections.id = exercises.section_id
      INNER JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE portfolios.learning_space_id = ? AND portfolios.archived_at IS NULL AND sections.archived_at IS NULL
        AND exercises.is_indexed = 0 AND exercises.archived_at IS NULL) AS missing_exercises,
    (SELECT COUNT(*) FROM solution_assets
      INNER JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      INNER JOIN exercises ON exercises.id = solution_variants.exercise_id
      INNER JOIN sections ON sections.id = exercises.section_id
      INNER JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE portfolios.learning_space_id = ? AND portfolios.archived_at IS NULL AND sections.archived_at IS NULL
        AND exercises.archived_at IS NULL AND solution_variants.archived_at IS NULL
        AND solution_assets.is_indexed = 0 AND solution_assets.archived_at IS NULL) AS missing_legacy_assets,
    (SELECT COUNT(*) FROM source_resource_assets
      INNER JOIN portfolios ON portfolios.id = source_resource_assets.portfolio_id
      WHERE source_resource_assets.learning_space_id = ? AND portfolios.archived_at IS NULL
        AND source_resource_assets.resource_scope = 'portfolio'
        AND source_resource_assets.is_indexed = 0 AND source_resource_assets.archived_at IS NULL) AS missing_generic_portfolio_resources,
    (SELECT COUNT(*) FROM source_resource_assets
      INNER JOIN portfolios ON portfolios.id = source_resource_assets.portfolio_id
      INNER JOIN exercises ON exercises.id = source_resource_assets.exercise_id
      INNER JOIN sections ON sections.id = exercises.section_id
      WHERE source_resource_assets.learning_space_id = ? AND portfolios.archived_at IS NULL
        AND sections.archived_at IS NULL AND exercises.archived_at IS NULL
        AND source_resource_assets.resource_scope = 'exercise'
        AND source_resource_assets.is_indexed = 0 AND source_resource_assets.archived_at IS NULL) AS missing_generic_exercise_resources,
    (SELECT COUNT(*) FROM solution_assets
      INNER JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      INNER JOIN exercises ON exercises.id = solution_variants.exercise_id
      INNER JOIN sections ON sections.id = exercises.section_id
      INNER JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE portfolios.learning_space_id = ? AND portfolios.archived_at IS NULL AND sections.archived_at IS NULL
        AND exercises.archived_at IS NULL AND solution_variants.archived_at IS NULL
        AND solution_assets.is_indexed = 0 AND solution_assets.archived_at IS NULL
        AND EXISTS (
          SELECT 1 FROM source_resource_assets
          WHERE source_resource_assets.learning_space_id = ?
            AND source_resource_assets.resource_scope = 'exercise'
            AND source_resource_assets.exercise_id = solution_variants.exercise_id
            AND source_resource_assets.relative_path = solution_assets.relative_path
            AND source_resource_assets.is_indexed = 0 AND source_resource_assets.archived_at IS NULL
        )) AS overlapping_legacy_generic_assets,
    (SELECT COUNT(*) FROM portfolios WHERE learning_space_id = ? AND is_indexed = 1 AND archived_at IS NULL) AS indexed_portfolios`;
}

function sourceStatusFromRow(row: DatabaseRow): LearningSpaceSourceStatusSource {
  const validationStatus = nullableText(row.last_validation_status);
  return {
    id: text(row.source_id),
    role: row.source_role === "mirror" ? "mirror" : "primary",
    providerType: providerType(row.source_provider_type),
    isActive: bool(row.source_is_active),
    lastKnownValidation: {
      state: validationStatus === "valid" || validationStatus === "invalid" ? validationStatus : "unknown",
      checkedAt: nullableText(row.last_validated_at),
      message: nullableText(row.last_validation_message),
    },
    mirrorCompletedAt: nullableText(row.mirror_completed_at),
  };
}

function sourceProfileStatusFromRow(row: DatabaseRow): SourceProfileStatusRow {
  return {
    id: text(row.id),
    name: text(row.name),
    configVersion: Number(row.config_version),
    updatedAt: text(row.profile_updated_at),
    assignmentUpdatedAt: text(row.assignment_updated_at),
  };
}

function syncAttemptFromRow(row: DatabaseRow): LearningSpaceSourceStatusSyncAttempt {
  const result = syncAttemptResult(row.status);
  return {
    sourceId: nullableText(row.source_id),
    providerType: nullableText(row.provider_type) ? providerType(row.provider_type) : null,
    startedAt: text(row.started_at),
    finishedAt: nullableText(row.finished_at),
    result,
    portfolioCount: result === "succeeded" ? Number(row.portfolio_count) : null,
    warningCount: result === "succeeded" ? Number(row.warning_count) : null,
    failureMessage: result === "failed" ? nullableText(row.failure_message) : null,
  };
}

function missingCountsFromRow(row: DatabaseRow): MissingCountSnapshot {
  return {
    portfolios: Number(row.missing_portfolios ?? 0),
    sections: Number(row.missing_sections ?? 0),
    exercises: Number(row.missing_exercises ?? 0),
    legacySolutionAssets: Number(row.missing_legacy_assets ?? 0),
    genericPortfolioResources: Number(row.missing_generic_portfolio_resources ?? 0),
    genericExerciseResources: Number(row.missing_generic_exercise_resources ?? 0),
    overlappingLegacyAndGenericExerciseAssets: Number(row.overlapping_legacy_generic_assets ?? 0),
    hasIndexedPortfolio: Number(row.indexed_portfolios ?? 0) > 0,
  };
}

function knownMissingContent(counts: MissingCountSnapshot): KnownMissingSourceContent {
  const genericResources = counts.genericPortfolioResources + counts.genericExerciseResources;
  return {
    state: "known",
    portfolios: counts.portfolios,
    sections: counts.sections,
    exercises: counts.exercises,
    legacySolutionAssets: counts.legacySolutionAssets,
    genericPortfolioResources: counts.genericPortfolioResources,
    genericExerciseResources: counts.genericExerciseResources,
    genericResources,
    overlappingLegacyAndGenericExerciseAssets: counts.overlappingLegacyAndGenericExerciseAssets,
    totalFilesAndResources: counts.legacySolutionAssets + genericResources - counts.overlappingLegacyAndGenericExerciseAssets,
  };
}

function unknownMissingContent(): UnknownMissingSourceContent {
  return {
    state: "unknown",
    portfolios: null,
    sections: null,
    exercises: null,
    legacySolutionAssets: null,
    genericPortfolioResources: null,
    genericExerciseResources: null,
    genericResources: null,
    overlappingLegacyAndGenericExerciseAssets: null,
    totalFilesAndResources: null,
  };
}

function knownWarnings(finishedAt: string, rows: DatabaseRow[], portfolioRows: DatabaseRow[]): LearningSpaceSourceWarnings {
  const portfoliosByCode = new Map<string, DatabaseRow[]>();
  for (const portfolio of portfolioRows) {
    const code = text(portfolio.portfolio_code);
    portfoliosByCode.set(code, [...(portfoliosByCode.get(code) ?? []), portfolio]);
  }
  const items = rows.map((row): LearningSpaceSourceStatusWarning => ({
    severity: row.severity === "info" ? "info" : row.severity === "warning" ? "warning" : "unknown",
    relativePath: text(row.relative_path),
    message: text(row.message),
    portfolio: warningPortfolio(row, portfoliosByCode),
  }));
  return { state: "known", basedOnSuccessfulSyncAt: finishedAt, count: items.length, items };
}

function warningPortfolio(row: DatabaseRow, portfoliosByCode: Map<string, DatabaseRow[]>): LearningSpaceSourceStatusWarning["portfolio"] {
  const code = portfolioCodeFromRelativePath(text(row.relative_path));
  if (!code) return null;
  const matches = portfoliosByCode.get(code) ?? [];
  if (matches.length !== 1) return null;
  return {
    id: text(matches[0].id),
    code,
    title: text(matches[0].portfolio_title),
  };
}

function unknownWarnings(): LearningSpaceSourceWarnings {
  return { state: "unknown", basedOnSuccessfulSyncAt: null, count: null, items: null };
}

function determineProfileIndexAlignment(
  profile: SourceProfileStatusRow | null,
  latestSuccessful: LearningSpaceSourceStatusSyncAttempt | null,
): LearningSpaceSourceStatus["synchronization"]["profileIndexAlignment"] {
  if (!profile) return { state: "unknown", reason: "profile_missing" };
  if (!latestSuccessful?.finishedAt) return { state: "unknown", reason: "no_successful_sync" };
  if (profile.updatedAt <= latestSuccessful.finishedAt && profile.assignmentUpdatedAt <= latestSuccessful.finishedAt) {
    return { state: "confirmed_current", reason: "profile_and_assignment_unchanged_since_sync" };
  }
  return { state: "unknown", reason: "profile_or_assignment_changed_after_sync" };
}

function determineUsableIndexState(
  available: boolean,
  inProgress: boolean,
  latestAttempt: LearningSpaceSourceStatusSyncAttempt | null,
  latestSuccessful: LearningSpaceSourceStatusSyncAttempt | null,
): LearningSpaceSourceStatus["synchronization"]["usableIndex"]["state"] {
  if (!available) return "unavailable";
  if (inProgress) return "available_while_syncing";
  if (latestAttempt?.result === "failed") return "available_from_previous_success";
  if (latestAttempt?.result === "succeeded" && latestSuccessful) return "available_from_latest_success";
  return "available_without_sync_history";
}

function assessStatus(
  activeSource: LearningSpaceSourceStatusSource | null,
  sources: LearningSpaceSourceStatusSource[],
  latestAttempt: LearningSpaceSourceStatusSyncAttempt | null,
  hasUsableIndex: boolean,
  missingContent: MissingSourceContent,
  warnings: LearningSpaceSourceWarnings,
  profileAlignment: "confirmed_current" | "unknown",
): LearningSpaceSourceStatus["assessment"] {
  const problems: SourceStatusReason[] = [];
  const unknowns: SourceStatusReason[] = [];
  if (!activeSource) unknowns.push("no_active_source");
  else if (activeSource.lastKnownValidation.state === "invalid") problems.push("active_source_invalid");
  else if (activeSource.lastKnownValidation.state === "unknown") unknowns.push("active_source_not_checked");
  const mirror = sources.find((source) => source.role === "mirror");
  if (mirror?.lastKnownValidation.state === "invalid") problems.push("mirror_invalid");
  else if (mirror?.lastKnownValidation.state === "unknown") unknowns.push("mirror_not_checked");
  if (!hasUsableIndex) problems.push("no_usable_index");
  if (latestAttempt?.result === "failed") problems.push("latest_sync_failed");
  if (missingContent.state === "known" && (
    missingContent.portfolios + missingContent.sections + missingContent.exercises + missingContent.totalFilesAndResources > 0
  )) problems.push("missing_content");
  if (warnings.state === "known" && warnings.count > 0) problems.push("sync_warnings");
  if (profileAlignment === "unknown") unknowns.push("profile_index_alignment_unknown");
  const reasons = problems.length > 0 ? [...problems, ...unknowns] : unknowns;
  return {
    state: problems.length > 0 ? "attention_required" : unknowns.length > 0 ? "unknown" : "no_problem_detected",
    reasons,
    evidence: "stored_state_only",
  };
}

function syncAttemptResult(value: unknown): SyncAttemptResult {
  if (value === "completed") return "succeeded";
  if (value === "failed" || value === "running") return value;
  return "unknown";
}

function providerType(value: unknown): StorageSourceType {
  if (value === "onedrive" || value === "google_drive") return value;
  return "local";
}

function bool(value: unknown): boolean {
  return value === true || Number(value) === 1;
}

function text(value: unknown): string {
  return String(value ?? "");
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
