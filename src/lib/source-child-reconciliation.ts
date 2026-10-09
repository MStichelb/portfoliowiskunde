import { createHash, randomUUID } from "node:crypto";

import type { DatabaseClient, DatabaseRow, InStatement } from "@/lib/database";
import type { IndexedAsset, IndexedPortfolio, IndexedPortfolioResourceAsset } from "@/lib/domain";
import { getSourceAssetBindings } from "@/lib/source-asset-bindings";
import { SourceConfigurationError } from "@/lib/source-errors";
import { sourceBindingContextKey, supportsStableNativeIdentity } from "@/lib/source-identity";
import type { PortfolioReconciliation } from "@/lib/source-reconciliation";

const bool = (value: unknown) => value === true || Number(value) === 1;
const text = (row: DatabaseRow, field: string) => String(row[field] ?? "");
const nullableText = (row: DatabaseRow, field: string) => row[field] == null ? null : String(row[field]);
function conflict(detail: string): never {
  throw new SourceConfigurationError(`Conflict in de bronidentiteit: ${detail}. De bestaande index is behouden.`);
}
function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${createHash("sha256").update(parts.join("\u0000")).digest("base64url").slice(0, 30)}`;
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function groupBy<T>(items: readonly T[], keyFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(keyFor(item), [...(groups.get(keyFor(item)) ?? []), item]);
  return groups;
}

function indexedExerciseId(portfolioId: string, sectionId: string | null, code: string): string {
  return `${sectionId ?? portfolioId}-exercise-${code}`;
}

// Persistence contexts describe real parent relationships, never synthetic sections.
function exerciseContexts(portfolio: IndexedPortfolio, portfolioId: string, sectionIds: ReadonlyMap<string, string>) {
  return [
    { sectionId: null as string | null, relativePath: portfolio.relativePath, exercises: portfolio.exercises ?? [] },
    ...portfolio.sections.map((section) => ({ sectionId: sectionIds.get(JSON.stringify([portfolioId, section.code]))!,
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
  storageContextKey: string | null;
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
    const retainedByLogicalKey = groupBy(retainedAssets, (asset) => `${asset.storageContextKey ?? ""}\u0000${asset.step}\u0000${asset.extension.toLowerCase()}`);
    const duplicateByLogicalKey = groupBy(duplicateAssets, (asset) => `${asset.storageContextKey ?? ""}\u0000${asset.step}\u0000${asset.extension.toLowerCase()}`);
    if ([...retainedByLogicalKey.values(), ...duplicateByLogicalKey.values()].some((group) => group.length > 1)) return true;
    for (const duplicateAsset of duplicateAssets) {
      const logicalKey = `${duplicateAsset.storageContextKey ?? ""}\u0000${duplicateAsset.step}\u0000${duplicateAsset.extension.toLowerCase()}`;
      if (retainedAssets.some((asset) => asset.relativePath === duplicateAsset.relativePath && asset.storageContextKey === duplicateAsset.storageContextKey
        && `${asset.storageContextKey ?? ""}\u0000${asset.step}\u0000${asset.extension.toLowerCase()}` !== logicalKey)) return true;
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
        const retainedAsset = retainedAssets.find((asset) => asset.storageContextKey === duplicateAsset.storageContextKey && asset.step === duplicateAsset.step
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

/** Read-only child planning; the existing Fase-2 exercise and merge rules are kept here. */
export async function planSourceChildren(database: DatabaseClient, input: {
  learningSpaceId: string; providerType: string;
  source: { id: string; providerType: string } | null;
  portfolios: readonly PortfolioReconciliation[];
  sectionIds: ReadonlyMap<string, string>;
  timestamp: string;
}) {
  const { learningSpaceId: spaceId, providerType, source: publicationSource, timestamp: startedAt, sectionIds } = input;
  const indexablePortfolios = input.portfolios.map((item) => item.incoming);
  const resolvedPortfolioIds = new Map(input.portfolios.map((item) => [item.incoming.code, item.id]));
  const indexedExerciseContexts = (portfolio: IndexedPortfolio, portfolioId: string) => exerciseContexts(portfolio, portfolioId, sectionIds);
  const [existingAssets, existingVariants, existingResourceAssets, existingExercises, existingErrorThreads, existingErrorIssues] = await Promise.all([
    database.execute({ sql: `SELECT solution_assets.id, solution_assets.variant_id, solution_assets.relative_path, solution_assets.source_id, solution_assets.storage_context_key,
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
      source_id, relative_path, file_name, extension, step, source_version, is_indexed, archived_at, storage_context_key
      FROM source_resource_assets WHERE learning_space_id = ?`, args: [spaceId] }),
    database.execute({ sql: `SELECT exercises.* FROM exercises JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE portfolios.learning_space_id = ?`, args: [spaceId] }),
    database.execute({ sql: "SELECT id, exercise_id FROM error_report_threads WHERE learning_space_id = ?", args: [spaceId] }),
    database.execute({ sql: `SELECT id, exercise_id, document_kind, variant_kind FROM error_report_issues
      WHERE learning_space_id = ?`, args: [spaceId] }),
  ]);
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
  const resolvedVariantId = (exerciseId: string, kind: string) =>
    existingVariantRows.find((variant) => variant.exerciseId === exerciseId && variant.kind === kind)?.id ?? `${exerciseId}-${kind}`;
  const rawSolutionAssetRows = existingAssets.rows.map((row) => ({
    id: text(row, "id"), variantId: text(row, "variant_id"), exerciseId: text(row, "exercise_id"), storageContextKey: nullableText(row, "storage_context_key"),
    relativePath: text(row, "relative_path"), sourceId: text(row, "source_id"), fileName: text(row, "file_name"),
    extension: text(row, "extension"), step: Number(row.step), variant: text(row, "kind"),
    lastModifiedAt: nullableText(row, "last_modified_at"), sourceVersion: nullableText(row, "source_version"), isIndexed: bool(row.is_indexed),
  }));
  const errorThreadExerciseIds = new Set(existingErrorThreads.rows.map((row) => nullableText(row, "exercise_id")).filter((id): id is string => id !== null));
  const errorIssueKeysByExercise = groupBy(existingErrorIssues.rows.filter((row) => nullableText(row, "exercise_id") !== null).map((row) => ({
    exerciseId: text(row, "exercise_id"), key: `${text(row, "document_kind")}\u0000${nullableText(row, "variant_kind") ?? ""}`,
  })), (issue) => issue.exerciseId);

  // Reuse Fase-2 portfolio/code resolution and metadata merging; ambiguity now rejects publication.
  for (const portfolio of indexablePortfolios) {
    const portfolioId = resolvedPortfolioIds.get(portfolio.code)!;
    for (const context of indexedExerciseContexts(portfolio, portfolioId)) {
      for (const exercise of context.exercises) {
        const desiredId = indexedExerciseId(portfolioId, context.sectionId, exercise.code);
        const exact = existingExercisesById.get(desiredId);
        const candidates = existingExerciseRows.filter((candidate) => candidate.portfolioId === portfolioId
          && normalizeExerciseIdentityCode(candidate.code) === normalizeExerciseIdentityCode(exercise.code)
          && candidate.archivedAt === null && candidate.id !== exact?.id);
        if (candidates.length > 1 || (exact?.isIndexed && candidates.some((candidate) => candidate.isIndexed))) {
          conflict(`oefening ${exercise.code} heeft meerdere mogelijke parents`);
        }
        if (!exact) {
          if (candidates.length === 1) exerciseResolutions.set(desiredId, candidates[0].id);
          else {
            exerciseResolutions.set(desiredId, desiredId);
            if (candidates.length > 1) conflict(`oefening ${exercise.code} heeft meerdere mogelijke parents`);
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
          if (missingCandidates.length > 1) conflict(`oefening ${exercise.code} heeft meerdere ontbrekende kandidaten`);
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
          conflict(`oefening ${exercise.code} bevat conflicterende metadata, rapporten of uitwerkingen`);
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
  const storageContexts = new Set<string | null>([null]);
  const assetStorageContextKey = (asset: IndexedAsset | IndexedPortfolioResourceAsset): string | null => {
    const identity = asset.sourceIdentityContext;
    if (!identity) return null;
    if (!publicationSource || identity.providerType !== providerType || publicationSource.providerType !== identity.providerType) {
      throw new SourceConfigurationError("De assetidentiteit hoort niet bij de ingestelde broncontext.");
    }
    return sourceBindingContextKey({ ...identity, learningSpaceId: spaceId, configuredSourceId: publicationSource.id });
  };
  for (const portfolio of indexablePortfolios) {
    for (const asset of [...portfolio.resourceAssets, ...indexedExerciseContexts(portfolio, resolvedPortfolioIds.get(portfolio.code)!)
      .flatMap((context) => context.exercises.flatMap((exercise) => exercise.assets))]) storageContexts.add(assetStorageContextKey(asset));
  }
  const historicBindings = (await getSourceAssetBindings(database, spaceId)).map((binding) => {
    const retainedId = binding.exerciseId ? duplicateExerciseResolutions.get(binding.exerciseId)?.retainedId : undefined;
    const variant = binding.variantId ? existingVariantRows.find((row) => row.id === binding.variantId) : undefined;
    const retainedVariant = retainedId && variant ? existingVariantRows.find((row) => row.exerciseId === retainedId && row.kind === variant.kind) : undefined;
    return { ...binding, exerciseId: retainedId ?? binding.exerciseId,
      variantId: retainedId && variant ? retainedVariant?.id ?? `${retainedId}-${variant.kind}` : binding.variantId };
  });
  const nativeBindings = historicBindings.filter(supportsStableNativeIdentity);
  const nativeBindingsByItem = groupBy(nativeBindings, (binding) => JSON.stringify([sourceBindingContextKey(binding), binding.nativeItemId]));
  const bindingsByAppId = groupBy(historicBindings.flatMap((binding) =>
    [binding.resourceAssetId, binding.solutionAssetId].filter((id): id is string => id !== null).map((id) => ({ id, binding }))), (item) => item.id);
  const boundResourceIds = new Set(nativeBindings.flatMap((binding) => binding.resourceAssetId ? [binding.resourceAssetId] : []));
  const boundSolutionIds = new Set(nativeBindings.flatMap((binding) => binding.solutionAssetId ? [binding.solutionAssetId] : []));
  // Existing exact/logical matching stays partitioned; only compatible NULL rows get legacy aliases.
  const storageEntries = <T extends { id: string; storageContextKey: string | null }>(rows: readonly T[], key: (row: T, context: string | null) => string) => {
    const entries = rows.map((row) => [key(row, row.storageContextKey), row] as const);
    const exact = new Map(entries);
    for (const row of rows.filter((row) => row.storageContextKey === null)) {
      const references = (bindingsByAppId.get(row.id) ?? []).map((item) => item.binding);
      for (const context of storageContexts) {
        // NULL does not erase known scope. Only unbound rows, or path rows already observed in this context,
        // can participate in legacy aliases. Native rows are resolved exclusively through their binding.
        if (context === null || exact.has(key(row, context))) continue;
        if (references.length && (references.some(supportsStableNativeIdentity)
          || !references.some((binding) => sourceBindingContextKey(binding) === context))) continue;
        entries.push([key(row, context), row]);
      }
    }
    return entries;
  };
  const assetKey = (variantId: string, relativePath: string, context: string | null = null) => JSON.stringify([context, variantId, relativePath]);
  const solutionAssetLogicalKey = (variantId: string, step: number, extension: string, context: string | null = null) => JSON.stringify([context, variantId, step, extension.toLowerCase()]);
  const resourceAssetExactKey = (scope: string, resourceId: string, sourceAssetId: string, context: string | null = null) => JSON.stringify([context, scope, resourceId, sourceAssetId]);
  const resourceAssetLogicalKey = (scope: string, parentId: string, resourceId: string, step: number, extension: string, context: string | null = null) =>
    JSON.stringify([context, scope, parentId, resourceId, step, extension.toLowerCase()]);
  const solutionMergePlan = planSolutionAssetMerge(duplicateExerciseResolutions, existingVariantRows, rawSolutionAssetRows, startedAt);
  const existingSolutionAssetRows = solutionMergePlan.rows;
  const solutionRowsById = new Map(existingSolutionAssetRows.map((row) => [row.id, row]));
  // A Fase-2 legacy merge may not collapse assets that already have a native identity.
  for (const binding of historicBindings) {
    if (binding.solutionAssetId && !solutionRowsById.has(binding.solutionAssetId)) {
      conflict("de oefeningsmerge zou een gebonden asset-ID verwijderen");
    }
  }

  const activeSolutionAssetRows = existingSolutionAssetRows.filter((asset) => asset.isIndexed);
  const existingAssetVersions = new Map(storageEntries(activeSolutionAssetRows, (asset, context) => assetKey(asset.variantId, asset.relativePath, context)));
  const existingSolutionAssetsByPathKey = new Map(storageEntries(existingSolutionAssetRows, (asset, context) => assetKey(asset.variantId, asset.relativePath, context)));
  const existingSolutionAssetsByLogicalKey = groupBy(storageEntries(activeSolutionAssetRows, (asset, context) => solutionAssetLogicalKey(asset.variantId, asset.step, asset.extension, context)), ([key]) => key);
  const existingResourceAssetRows = existingResourceAssets.rows.map((row) => ({
    id: text(row, "id"), portfolioId: text(row, "portfolio_id"), exerciseId: nullableText(row, "exercise_id"),
    scope: text(row, "resource_scope"), resourceId: text(row, "resource_id"), sourceId: text(row, "source_id"), storageContextKey: nullableText(row, "storage_context_key"),
    relativePath: text(row, "relative_path"), fileName: text(row, "file_name"), extension: text(row, "extension"),
    step: Number(row.step), sourceVersion: nullableText(row, "source_version"), isIndexed: bool(row.is_indexed),
    archivedAt: nullableText(row, "archived_at"),
  })).map((asset) => ({
    ...asset,
    exerciseId: asset.exerciseId ? duplicateExerciseResolutions.get(asset.exerciseId)?.retainedId ?? asset.exerciseId : null,
  }));
  const resourceRowsById = new Map(existingResourceAssetRows.map((row) => [row.id, row]));
  const existingResourceAssetsByExactKey = new Map(storageEntries(existingResourceAssetRows, (asset, context) => resourceAssetExactKey(asset.scope, asset.resourceId, asset.sourceId, context)));
  const activeResourceAssetsByExactKey = new Map(storageEntries(existingResourceAssetRows.filter((asset) => asset.isIndexed), (asset, context) => resourceAssetExactKey(asset.scope, asset.resourceId, asset.sourceId, context)));
  const existingResourceAssetsByLogicalKey = groupBy(storageEntries(existingResourceAssetRows.filter((asset) => asset.isIndexed), (asset, context) => resourceAssetLogicalKey(
    asset.scope, asset.scope === "portfolio" ? asset.portfolioId : asset.exerciseId ?? "", asset.resourceId, asset.step, asset.extension, context,
  )), ([key]) => key);
  const existingStorageAssetIds = new Set([...existingResourceAssetRows, ...existingSolutionAssetRows].map((asset) => asset.id));
  const newStorageAssetId = (prefix: string, parts: string[], context: string | null) => {
    const id = stableId(prefix, ...parts, ...(context ? [context] : []));
    // A historic ID may already belong to another partition; never overwrite it.
    return existingStorageAssetIds.has(id) ? `${prefix}-${randomUUID()}` : id;
  };
  const incomingSolutionAssetCounts = new Map<string, number>();
  const incomingSolutionPathCounts = new Map<string, number>();
  const incomingResourceAssetCounts = new Map<string, number>();
  const incomingResourceExactCounts = new Map<string, number>();
  for (const portfolio of indexablePortfolios) {
    const portfolioId = resolvedPortfolioIds.get(portfolio.code)!;
    for (const asset of portfolio.resourceAssets) {
      incrementCount(incomingResourceAssetCounts, resourceAssetLogicalKey("portfolio", portfolioId, asset.resourceId, 1, asset.extension, assetStorageContextKey(asset)));
      incrementCount(incomingResourceExactCounts, resourceAssetExactKey("portfolio", asset.resourceId, asset.sourceId, assetStorageContextKey(asset)));
    }
    for (const context of indexedExerciseContexts(portfolio, portfolioId)) {
      const sectionId = context.sectionId;
      for (const exercise of context.exercises) {
        const exerciseId = resolvedExerciseId(portfolioId, sectionId, exercise.code);
        for (const asset of exercise.assets) {
          incrementCount(incomingResourceAssetCounts, resourceAssetLogicalKey("exercise", exerciseId, asset.resourceId, asset.parsed.step, asset.parsed.extension, assetStorageContextKey(asset)));
          incrementCount(incomingResourceExactCounts, resourceAssetExactKey("exercise", asset.resourceId, asset.sourceId, assetStorageContextKey(asset)));
          if (asset.legacyVariant) {
            const variantId = resolvedVariantId(exerciseId, asset.legacyVariant);
            incrementCount(incomingSolutionAssetCounts, solutionAssetLogicalKey(variantId, asset.parsed.step, asset.parsed.extension, assetStorageContextKey(asset)));
            incrementCount(incomingSolutionPathCounts, assetKey(variantId, asset.relativePath, assetStorageContextKey(asset)));
          }
        }
      }
    }
  }
  const reconciledSolutionAssetIds = new Set<string>();
  const reconciledResourceAssetIds = new Set<string>();
  const legacyResourceCandidate = (exactKey: string, logicalKey: string) => {
    if ((incomingResourceExactCounts.get(exactKey) ?? 0) > 1) {
      if (JSON.parse(exactKey)[0] !== null) throw new SourceConfigurationError("Meerdere assets claimen dezelfde storage-identiteit. De bestaande index is behouden.");
      return { kind: "conflict" as const };
    }
    if (activeResourceAssetsByExactKey.has(exactKey)) return null;
    const candidates = (existingResourceAssetsByLogicalKey.get(logicalKey) ?? []).map(([, asset]) => asset)
      .filter((asset) => !boundResourceIds.has(asset.id) && !reconciledResourceAssetIds.has(asset.id));
    if (incomingResourceAssetCounts.get(logicalKey) !== 1) return candidates.length ? { kind: "conflict" as const } : null;
    if (candidates.length !== 1) return candidates.length > 1 ? { kind: "conflict" as const } : null;
    const candidate = candidates[0];
    const occupied = existingResourceAssetsByExactKey.get(exactKey);
    if (!occupied || occupied.id === candidate.id) return { kind: "reconcile" as const, candidate, stale: null };
    const occupiedLogicalKey = resourceAssetLogicalKey(
      occupied.scope, occupied.scope === "portfolio" ? occupied.portfolioId : occupied.exerciseId ?? "",
      occupied.resourceId, occupied.step, occupied.extension, JSON.parse(logicalKey)[0] as string | null,
    );
    if (occupied.isIndexed || occupiedLogicalKey !== logicalKey) return { kind: "conflict" as const };
    return { kind: "reconcile" as const, candidate, stale: occupied };
  };
  const legacySolutionCandidate = (pathKey: string, logicalKey: string) => {
    if ((incomingSolutionPathCounts.get(pathKey) ?? 0) > 1) {
      if (JSON.parse(pathKey)[0] !== null) throw new SourceConfigurationError("Meerdere bestanden claimen dezelfde storage-identiteit. De bestaande index is behouden.");
      return { kind: "conflict" as const };
    }
    if (existingAssetVersions.has(pathKey)) return null;
    const occupied = existingSolutionAssetsByPathKey.get(pathKey);
    if (occupied && solutionAssetLogicalKey(occupied.variantId, occupied.step, occupied.extension, JSON.parse(logicalKey)[0] as string | null) !== logicalKey) {
      return { kind: "conflict" as const };
    }
    const candidates = (existingSolutionAssetsByLogicalKey.get(logicalKey) ?? []).map(([, asset]) => asset)
      .filter((asset) => !boundSolutionIds.has(asset.id) && !reconciledSolutionAssetIds.has(asset.id));
    if (incomingSolutionAssetCounts.get(logicalKey) !== 1) return candidates.length ? { kind: "conflict" as const } : null;
    if (candidates.length !== 1) return candidates.length > 1 ? { kind: "conflict" as const } : null;
    const candidate = candidates[0];
    if (!occupied || occupied.id === candidate.id) return { kind: "reconcile" as const, candidate, stale: null };
    if (occupied.isIndexed) return { kind: "conflict" as const };
    return { kind: "reconcile" as const, candidate, stale: occupied };
  };

  type ResourceDecision = Exclude<ReturnType<typeof legacyResourceCandidate>, { kind: "conflict" }>;
  type SolutionDecision = Exclude<ReturnType<typeof legacySolutionCandidate>, { kind: "conflict" }>;
  const resourceDecisions = new Map<IndexedAsset | IndexedPortfolioResourceAsset, ResourceDecision>();
  const solutionDecisions = new Map<IndexedAsset, SolutionDecision>();
  const plannedResourceIds = new Map<IndexedAsset | IndexedPortfolioResourceAsset, string>();
  const plannedSolutionIds = new Map<IndexedAsset, string>();
  const plannedResources: { id: string; asset: IndexedAsset | IndexedPortfolioResourceAsset; scope: string; context: string | null }[] = [];
  const plannedSolutions: { id: string; variantId: string; asset: IndexedAsset; context: string | null }[] = [];
  const claimedResources = new Set<string>();
  const claimedSolutions = new Set<string>();
  const incomingNativeClaims = new Map<string, string>();
  const claim = (claims: Set<string>, id: string | undefined) => {
    if (!id) return;
    if (claims.has(id)) conflict("meerdere bronbestanden claimen hetzelfde app-asset-ID");
    claims.add(id);
  };
  const planAsset = (portfolio: IndexedPortfolio, portfolioId: string, exerciseId: string | null,
    asset: IndexedAsset | IndexedPortfolioResourceAsset) => {
    const context = assetStorageContextKey(asset);
    const identity = asset.sourceIdentityContext;
    const folderIdentity = portfolio.sourceIdentityContext;
    if (identity && (!identity.providerNamespace.trim() || !asset.sourceId.trim()
      || (identity.providerType === "local" ? identity.identityKind !== "path" : identity.identityKind !== "native")
      || (folderIdentity && (identity.providerType !== folderIdentity.providerType || identity.providerNamespace !== folderIdentity.providerNamespace
        || identity.identityKind !== folderIdentity.identityKind)))) conflict("de assetprovidercontext wijkt af van de mapcontext");
    const scope = exerciseId ? "exercise" : "portfolio";
    const step = "parsed" in asset ? asset.parsed.step : 1;
    const extension = "parsed" in asset ? asset.parsed.extension : asset.extension;
    const variantId = "legacyVariant" in asset && asset.legacyVariant ? resolvedVariantId(exerciseId!, asset.legacyVariant) : null;
    const exactKey = resourceAssetExactKey(scope, asset.resourceId, asset.sourceId, context);
    const logicalKey = resourceAssetLogicalKey(scope, exerciseId ?? portfolioId, asset.resourceId, step, extension, context);
    if ((incomingResourceExactCounts.get(exactKey) ?? 0) > 1) conflict("meerdere assets claimen dezelfde storage-identiteit");
    const native = identity && supportsStableNativeIdentity(identity);
    const matchingBindings = native ? (nativeBindingsByItem.get(JSON.stringify([context, asset.sourceId])) ?? []) : [];
    const parentClaim = JSON.stringify([portfolioId, exerciseId, scope, asset.resourceId, variantId]);
    if (native) {
      const nativeKey = JSON.stringify([context, asset.sourceId]);
      if (incomingNativeClaims.has(nativeKey) && incomingNativeClaims.get(nativeKey) !== parentClaim) conflict("een native bestand claimt verschillende resource- of parentcontexten");
      incomingNativeClaims.set(nativeKey, parentClaim);
    }
    for (const binding of matchingBindings) {
      if (binding.portfolioId !== portfolioId || binding.exerciseId !== exerciseId || binding.resourceScope !== scope
        || binding.resourceId !== asset.resourceId || (binding.variantId && binding.variantId !== variantId)) {
        conflict("de native assetbinding hoort bij een andere portfolio, oefening, resource of variant");
      }
    }
    const binding = matchingBindings[0];
    let resource: ReturnType<typeof legacyResourceCandidate> = null;
    const exactResource = existingResourceAssetsByExactKey.get(exactKey);
    if (binding?.resourceAssetId) {
      const row = resourceRowsById.get(binding.resourceAssetId);
      if (!row || row.portfolioId !== portfolioId || row.exerciseId !== exerciseId || row.scope !== scope || row.resourceId !== asset.resourceId) conflict("de native asset mist haar geldige parent");
      if (exactResource && exactResource.id !== row.id) conflict("de native assetidentiteit is al door een andere rij bezet");
      if (!exactResource || row.storageContextKey !== context) resource = { kind: "reconcile", candidate: row, stale: null };
    } else {
      // Bound rows may only be reused through their exact scoped native binding.
      if (exactResource && boundResourceIds.has(exactResource.id)) conflict("een andere native identiteit zou een gebonden asset overnemen");
      resource = legacyResourceCandidate(exactKey, logicalKey);
      if (resource?.kind === "conflict") conflict("de legacy bronresource heeft meerdere mogelijke matches");
      if (resource?.candidate && boundResourceIds.has(resource.candidate.id)) resource = null;
      if (resource?.stale && historicBindings.some((item) => item.resourceAssetId === resource?.stale?.id)) conflict("een legacy fallback zou historische assetbindings verwijderen");
    }
    const resourceId = resource?.candidate.id ?? exactResource?.id
      ?? newStorageAssetId("source-resource-asset", [spaceId, scope, asset.resourceId, asset.sourceId], context);
    plannedResourceIds.set(asset, resourceId);
    plannedResources.push({ id: resourceId, asset, scope, context });
    const resourceRow = resource?.candidate ?? exactResource;
    if (resourceRow && (resourceRow.portfolioId !== portfolioId || resourceRow.exerciseId !== exerciseId)) conflict("een resource match hoort bij een andere parent");
    claim(claimedResources, resourceId);
    if (resourceId) reconciledResourceAssetIds.add(resourceId);
    resourceDecisions.set(asset, resource);
    if (!variantId || !("parsed" in asset)) return;
    const pathKey = assetKey(variantId, asset.relativePath, context);
    const solutionLogical = solutionAssetLogicalKey(variantId, step, extension, context);
    if ((incomingSolutionPathCounts.get(pathKey) ?? 0) > 1) conflict("meerdere uitwerkingen claimen hetzelfde variantpad");
    const atPath = existingSolutionAssetsByPathKey.get(pathKey);
    let solution: ReturnType<typeof legacySolutionCandidate> = null;
    if (binding?.solutionAssetId) {
      const row = solutionRowsById.get(binding.solutionAssetId);
      if (!row || row.exerciseId !== exerciseId || row.variantId !== variantId) conflict("de native uitwerking mist haar geldige variantparent");
      // Native identity wins over paths and steps, including occupied paths in a proven swap.
      if (atPath?.id !== row.id || row.storageContextKey !== context) solution = { kind: "reconcile", candidate: row, stale: null };
    } else {
      if (atPath && boundSolutionIds.has(atPath.id)) conflict("het variantpad hoort bij een andere gebonden native uitwerking");
      solution = legacySolutionCandidate(pathKey, solutionLogical);
      if (solution?.kind === "conflict") conflict("de legacy uitwerking heeft meerdere mogelijke matches");
      if (solution?.candidate && boundSolutionIds.has(solution.candidate.id)) solution = null;
      if (solution?.stale && historicBindings.some((item) => item.solutionAssetId === solution?.stale?.id)) conflict("een legacy fallback zou historische uitwerkingsbindings verwijderen");
    }
    const solutionId = solution?.candidate.id ?? atPath?.id ?? newStorageAssetId("asset", [variantId, asset.relativePath], context);
    plannedSolutionIds.set(asset, solutionId);
    claim(claimedSolutions, solutionId);
    if (solutionId) reconciledSolutionAssetIds.add(solutionId);
    solutionDecisions.set(asset, solution);
    plannedSolutions.push({ id: solutionId, variantId, asset, context });
  };
  for (const portfolio of indexablePortfolios) {
    const portfolioId = resolvedPortfolioIds.get(portfolio.code)!;
    for (const asset of portfolio.resourceAssets) planAsset(portfolio, portfolioId, null, asset);
    for (const context of indexedExerciseContexts(portfolio, portfolioId)) {
      for (const exercise of context.exercises) {
        const exerciseId = resolvedExerciseId(portfolioId, context.sectionId, exercise.code);
        for (const asset of exercise.assets) planAsset(portfolio, portfolioId, exerciseId, asset);
      }
    }
  }
  const stagingStatements: InStatement[] = [];
  const plannedResourcesById = new Map(plannedResources.map((plan) => [plan.id, plan]));
  const plannedSolutionsById = new Map(plannedSolutions.map((plan) => [plan.id, plan]));
  const resourceStorageRows = new Map(existingResourceAssetRows.map((row) => [resourceAssetExactKey(row.scope, row.resourceId, row.sourceId, row.storageContextKey), row]));
  const solutionStoragePaths = new Map(existingSolutionAssetRows.map((row) => [assetKey(row.variantId, row.relativePath, row.storageContextKey), row]));
  const solutionStorageItems = new Map(existingSolutionAssetRows.map((row) => [JSON.stringify([row.storageContextKey, row.variantId, row.sourceId]), row]));
  const deletedLegacyResources = new Set([...resourceDecisions.values()].flatMap((decision) => decision?.stale ? [decision.stale.id] : []));
  for (const plan of plannedResources) {
    const occupied = resourceStorageRows.get(resourceAssetExactKey(plan.scope, plan.asset.resourceId, plan.asset.sourceId, plan.context));
    if (occupied && occupied.id !== plan.id && !deletedLegacyResources.has(occupied.id)) {
      const replacement = plannedResourcesById.get(occupied.id);
      if (!replacement || (replacement.context === plan.context && replacement.asset.sourceId === plan.asset.sourceId)) {
        conflict("de nieuwe native resource-identiteit is al bezet");
      }
    }
    const row = resourceRowsById.get(plan.id);
    if (row && (row.storageContextKey !== plan.context || row.sourceId !== plan.asset.sourceId)) stagingStatements.push({
      sql: "UPDATE source_resource_assets SET storage_context_key = ? WHERE id = ?",
      args: [JSON.stringify(["reconciliation", randomUUID()]), row.id],
    });
  }
  const deletedLegacySolutions = new Set([...solutionDecisions.values()].flatMap((decision) => decision?.stale ? [decision.stale.id] : []));
  for (const plan of plannedSolutions) {
    const atPath = solutionStoragePaths.get(assetKey(plan.variantId, plan.asset.relativePath, plan.context));
    const byItem = plan.context === null ? undefined : solutionStorageItems.get(JSON.stringify([plan.context, plan.variantId, plan.asset.sourceId]));
    const occupied = new Set([atPath, byItem].filter((row): row is ExistingSolutionAssetRow => row !== undefined));
    for (const row of occupied) {
      if (row.id === plan.id || deletedLegacySolutions.has(row.id)) continue;
      const replacement = plannedSolutionsById.get(row.id);
      if (!replacement || (replacement.context === plan.context && (replacement.asset.relativePath === plan.asset.relativePath || replacement.asset.sourceId === plan.asset.sourceId))) {
        conflict("het nieuwe native variantpad of item-ID is bezet zonder bewezen verplaatsing");
      }
    }
    const row = solutionRowsById.get(plan.id);
    if (row && (row.relativePath !== plan.asset.relativePath || row.storageContextKey !== plan.context || row.sourceId !== plan.asset.sourceId)) stagingStatements.push({
      // Release non-deferrable unique keys inside the same transaction; raw provider IDs remain intact.
      // Legacy NULL source IDs only acquire a scoped context with their final source write.
      sql: "UPDATE solution_assets SET relative_path = ?, storage_context_key = ? WHERE id = ?",
      args: [`__reconciliation__/${randomUUID()}`, row.sourceId ? JSON.stringify(["reconciliation", randomUUID()]) : null, row.id],
    });
  }
  return {
    indexedExerciseContexts, resolvedExerciseId, resolvedVariantId, duplicateExerciseResolutions, movedExerciseTargetSections,
    resourceAssetId: (asset: IndexedAsset | IndexedPortfolioResourceAsset) => plannedResourceIds.get(asset)!,
    solutionAssetId: (asset: IndexedAsset) => plannedSolutionIds.get(asset)!,
    existingVariantRows, solutionMergePlan, existingResourceAssetRows, activeSolutionAssetRows,
    assetStorageContextKey, assetKey, resourceAssetExactKey,
    existingResourceAssetsByExactKey, activeResourceAssetsByExactKey, existingAssetVersions, existingSolutionAssetsByPathKey,
    resourceReconciliationCandidate: (asset: IndexedAsset | IndexedPortfolioResourceAsset) => resourceDecisions.get(asset) ?? null,
    solutionReconciliationCandidate: (asset: IndexedAsset) => solutionDecisions.get(asset) ?? null,
    stagingStatements,
  };
}
