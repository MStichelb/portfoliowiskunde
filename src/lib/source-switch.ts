import { randomUUID } from "node:crypto";

import type { IndexedPortfolio, IndexWarning } from "@/lib/domain";
import {
  getIndexedSourceManifest,
  getLearningSpace,
  getLearningSpaceSource,
  getLatestWarnings,
  persistIndex,
  recordLearningSpaceSourceValidation,
  releaseSyncLease,
  tryAcquireSyncLease,
  type LearningSpace,
  type LearningSpaceSource,
} from "@/lib/repositories";
import { compareSourceManifests, sourceManifestFromIndex, type SourceComparison, type SourceManifestEntry } from "@/lib/source-comparison";
import { SourceAccessError, SourceConfigurationError } from "@/lib/source-errors";
import { getStorageProviderForSource } from "@/lib/storage";
import { indexSource } from "@/lib/storage/portfolio-indexer";
import type { StorageProvider } from "@/lib/storage/provider";

export interface SourceSwitchPreview {
  targetSourceId: string;
  targetRole: LearningSpaceSource["role"];
  targetProvider: LearningSpaceSource["providerType"];
  mirrorCompletedAt: string | null;
  comparison: SourceComparison;
}

export interface SourceSwitchResult extends SourceSwitchPreview {
  switched: boolean;
  confirmationRequired: boolean;
}

interface SourceSwitchDependencies {
  getSpace?: typeof getLearningSpace;
  getSource?: typeof getLearningSpaceSource;
  getProvider?: (learningSpaceId: string, sourceId: string) => Promise<{ provider: StorageProvider; type: LearningSpaceSource["providerType"]; space: LearningSpace; source: LearningSpaceSource }>;
  getCurrentManifest?: (learningSpaceId: string) => Promise<SourceManifestEntry[]>;
  getCurrentWarnings?: (learningSpaceId: string) => Promise<IndexWarning[]>;
  index?: typeof indexSource;
  persist?: typeof persistIndex;
  recordValidation?: typeof recordLearningSpaceSourceValidation;
  acquireLease?: typeof tryAcquireSyncLease;
  releaseLease?: typeof releaseSyncLease;
}

export async function compareLearningSpaceSources(
  learningSpaceId: string,
  targetSourceId: string,
  dependencies: SourceSwitchDependencies = {},
): Promise<SourceSwitchPreview> {
  const inspected = await inspectSwitchTarget(learningSpaceId, targetSourceId, dependencies);
  await (dependencies.recordValidation ?? recordLearningSpaceSourceValidation)(
    inspected.source.id,
    "valid",
    null,
    inspected.mirrorCompletedAt ?? undefined,
  );
  return previewFromInspection(inspected);
}

export async function switchLearningSpaceSource(
  learningSpaceId: string,
  targetSourceId: string,
  confirmDifferences: boolean,
  dependencies: SourceSwitchDependencies = {},
): Promise<SourceSwitchResult> {
  const ownerId = randomUUID();
  const acquireLease = dependencies.acquireLease ?? tryAcquireSyncLease;
  const releaseLease = dependencies.releaseLease ?? releaseSyncLease;
  if (!await acquireLease(learningSpaceId, ownerId)) throw new SourceAccessError("Er loopt al een synchronisatie voor deze leeromgeving.");
  try {
    const inspected = await inspectSwitchTarget(learningSpaceId, targetSourceId, dependencies);
    const preview = previewFromInspection(inspected);
    if (preview.comparison.hasDifferences && !confirmDifferences) {
      await (dependencies.recordValidation ?? recordLearningSpaceSourceValidation)(
        inspected.source.id,
        "valid",
        "De bron is technisch geldig, maar verschilt van de actieve index.",
        inspected.mirrorCompletedAt ?? undefined,
      );
      return { ...preview, switched: false, confirmationRequired: true };
    }

    const latestSpace = await (dependencies.getSpace ?? getLearningSpace)(learningSpaceId);
    const latestTarget = await (dependencies.getSource ?? getLearningSpaceSource)(targetSourceId);
    if (!latestSpace?.isActive) throw new SourceAccessError("Een gearchiveerde leeromgeving kan niet van bron wisselen.");
    if (!latestTarget || latestTarget.learningSpaceId !== learningSpaceId) throw new SourceConfigurationError("Switchdoel niet gevonden.");
    if (latestTarget.isActive) return { ...preview, switched: false, confirmationRequired: false };

    await (dependencies.persist ?? persistIndex)(inspected.portfolios, inspected.source.providerType, learningSpaceId, {
      sourceId: inspected.source.id,
      activateSourceId: inspected.source.id,
      mirrorCompletedAt: inspected.mirrorCompletedAt ?? undefined,
    });
    return { ...preview, switched: true, confirmationRequired: false };
  } catch (error) {
    const source = await (dependencies.getSource ?? getLearningSpaceSource)(targetSourceId).catch(() => null);
    if (source?.learningSpaceId === learningSpaceId) {
      await (dependencies.recordValidation ?? recordLearningSpaceSourceValidation)(
        source.id,
        "invalid",
        error instanceof Error ? error.message : "Bronvalidatie mislukt.",
      ).catch(() => undefined);
    }
    throw error;
  } finally {
    await releaseLease(learningSpaceId, ownerId).catch(() => undefined);
  }
}

async function inspectSwitchTarget(
  learningSpaceId: string,
  targetSourceId: string,
  dependencies: SourceSwitchDependencies,
): Promise<{
  source: LearningSpaceSource;
  portfolios: IndexedPortfolio[];
  mirrorCompletedAt: string | null;
  comparison: SourceComparison;
}> {
  const [space, source] = await Promise.all([
    (dependencies.getSpace ?? getLearningSpace)(learningSpaceId),
    (dependencies.getSource ?? getLearningSpaceSource)(targetSourceId),
  ]);
  if (!space) throw new SourceConfigurationError("Leeromgeving niet gevonden.");
  if (!space.isActive) throw new SourceAccessError("Een gearchiveerde leeromgeving kan niet van bron wisselen.");
  if (!source || source.learningSpaceId !== learningSpaceId) throw new SourceConfigurationError("Switchdoel niet gevonden.");
  if (source.isActive) throw new SourceConfigurationError("Deze bron is al actief.");

  const configured = await (dependencies.getProvider ?? getStorageProviderForSource)(learningSpaceId, targetSourceId);
  await configured.provider.assertReadyForIndex?.();
  const readiness = configured.provider.getReadinessMetadata?.();
  const portfolios = await (dependencies.index ?? indexSource)(configured.provider);
  const [currentManifest, currentWarnings] = await Promise.all([
    (dependencies.getCurrentManifest ?? getIndexedSourceManifest)(learningSpaceId),
    dependencies.getCurrentWarnings
      ? dependencies.getCurrentWarnings(learningSpaceId)
      : getLatestWarnings(learningSpaceId).then((warnings) => warnings.map((warning): IndexWarning => ({
        severity: warning.severity === "info" ? "info" : "warning",
        path: warning.relativePath,
        message: warning.message,
      }))),
  ]);
  const targetWarnings = portfolios.flatMap((portfolio) => portfolio.warnings);
  return {
    source,
    portfolios,
    mirrorCompletedAt: readiness?.mirrorCompletedAt ?? null,
    comparison: compareSourceManifests(currentManifest, sourceManifestFromIndex(portfolios), currentWarnings, targetWarnings),
  };
}

function previewFromInspection(inspected: Awaited<ReturnType<typeof inspectSwitchTarget>>): SourceSwitchPreview {
  return {
    targetSourceId: inspected.source.id,
    targetRole: inspected.source.role,
    targetProvider: inspected.source.providerType,
    mirrorCompletedAt: inspected.mirrorCompletedAt,
    comparison: inspected.comparison,
  };
}
