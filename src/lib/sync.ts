import { randomUUID } from "node:crypto";

import {
  getActiveLearningSpaceSource,
  getLearningSpace,
  getLearningSpaces,
  getSyncPublicationSnapshot,
  persistIndex,
  recordFailedSync,
  recordLearningSpaceSourceValidation,
  releaseSyncLease,
  tryAcquireSyncLease,
} from "@/lib/repositories";
import { indexSource } from "@/lib/storage/portfolio-indexer";
import { getStorageProviderWithType } from "@/lib/storage";
import { SourceAccessError, SourceConfigurationError, StaleSynchronizationError } from "@/lib/source-errors";
import { detectLearningSpaceHeader } from "@/lib/learning-space-header";
import type { StorageProvider } from "@/lib/storage/provider";
import type { LearningSpace, LearningSpaceSource, StorageSourceType } from "@/lib/repositories";

interface SynchronizationDependencies {
  getConfiguredProvider?: (learningSpaceId?: string) => Promise<{ provider: StorageProvider; type: StorageSourceType; space: LearningSpace; source?: LearningSpaceSource }>;
  index?: typeof indexSource;
  acquireLease?: typeof tryAcquireSyncLease;
  releaseLease?: typeof releaseSyncLease;
}

type SynchronizationStage = "provider-resolution" | "source-readiness" | "indexing" | "persistence";

export async function synchronizeSource(learningSpaceId?: string, dependencies: SynchronizationDependencies = {}) {
  const requestedSpace = learningSpaceId
    ? await getLearningSpace(learningSpaceId)
    : (await getLearningSpaces(true)).at(-1) ?? null;
  if (!requestedSpace) throw new SourceConfigurationError("Leeromgeving niet gevonden.");
  if (!requestedSpace.isActive) {
    return { portfolios: 0, warnings: 0, added: 0, updated: 0, missing: 0, skipped: true, skipReason: "archived" as const };
  }
  let providerType = "local";
  let lease: { learningSpaceId: string; ownerId: string } | null = null;
  let source: LearningSpaceSource | undefined;
  let stage: SynchronizationStage = "provider-resolution";
  const acquireLease = dependencies.acquireLease ?? tryAcquireSyncLease;
  const releaseLease = dependencies.releaseLease ?? releaseSyncLease;
  try {
    const ownerId = randomUUID();
    const leaseSeconds = synchronizationLeaseSeconds();
    if (!await acquireLease(requestedSpace.id, ownerId, new Date(), leaseSeconds)) {
      return { portfolios: 0, warnings: 0, added: 0, updated: 0, missing: 0, skipped: true };
    }
    lease = { learningSpaceId: requestedSpace.id, ownerId };
    const configured = await (dependencies.getConfiguredProvider ?? getStorageProviderWithType)(requestedSpace.id);
    if (configured.space.id !== requestedSpace.id) throw new SourceConfigurationError("De synchronisatiebron hoort niet bij deze leeromgeving.");
    providerType = configured.type;
    source = configured.source ?? await getActiveLearningSpaceSource(requestedSpace.id) ?? undefined;
    if (!source) throw new SourceConfigurationError("Deze leeromgeving heeft geen actieve bron.");
    const snapshot = await getSyncPublicationSnapshot(requestedSpace.id, source.id);
    if (!snapshot || snapshot.activeSourceId !== source.id || source.providerType !== configured.type) {
      throw new StaleSynchronizationError("De actieve bron wijzigde vóór de synchronisatie kon starten.");
    }
    stage = "source-readiness";
    await configured.provider.assertReadyForIndex?.();
    const readiness = configured.provider.getReadinessMetadata?.();
    stage = "indexing";
    const [portfolios, header] = await Promise.all([
      (dependencies.index ?? indexSource)(configured.provider, snapshot.sourceProfileConfig),
      source.role === "mirror" ? Promise.resolve(undefined) : detectLearningSpaceHeader(configured.provider),
    ]);
    const currentSpace = await getLearningSpace(requestedSpace.id);
    if (!currentSpace?.isActive) {
      return { portfolios: 0, warnings: 0, added: 0, updated: 0, missing: 0, skipped: true, skipReason: "archived" as const };
    }
    stage = "persistence";
    const result = await persistIndex(portfolios, configured.type, requestedSpace.id, {
      sourceId: source.id,
      mirrorCompletedAt: readiness?.mirrorCompletedAt,
      ...(header === undefined ? {} : { header }),
      publicationGuard: { ownerId, leaseSeconds, snapshot },
    });
    return { portfolios: portfolios.length, ...result, skipped: false };
  } catch (error) {
    if (error instanceof StaleSynchronizationError) {
      return { portfolios: 0, warnings: 0, added: 0, updated: 0, missing: 0, skipped: true, skipReason: "stale" as const };
    }
    if (source && isSourceValidationFailure(error)) {
      await recordLearningSpaceSourceValidation(source.id, "invalid", error instanceof Error ? error.message : "Bronvalidatie mislukt.").catch(() => undefined);
    }
    if (learningSpaceId) await recordFailedSync(providerType, error, learningSpaceId).catch(() => undefined);
    console.error("Synchronization failed.", safeSynchronizationError(error, learningSpaceId, providerType, stage));
    if (isNodeIoError(error, "ENOENT")) throw new SourceAccessError("De ingestelde bronmap bestaat niet of is niet bereikbaar.");
    if (isNodeIoError(error, "EACCES") || isNodeIoError(error, "EPERM")) throw new SourceAccessError("De ingestelde bronmap is niet leesbaar.");
    if (error instanceof SourceAccessError || error instanceof SourceConfigurationError) throw error;
    if (providerType === "onedrive") throw new SourceAccessError("OneDrive kon niet worden gesynchroniseerd. Controleer de app-brede verbinding en de drive- en map-ID's.");
    if (providerType === "google_drive") throw new SourceAccessError("Google Drive kon niet worden gesynchroniseerd. Controleer het service account en de folder-ID.");
    throw error;
  } finally {
    if (lease) await releaseLease(lease.learningSpaceId, lease.ownerId).catch(() => {
      console.error("Synchronization lease release failed.", { learningSpaceId: lease?.learningSpaceId });
    });
  }
}

function synchronizationLeaseSeconds(): number {
  const configured = Number(process.env.PORTFOLIO_SYNC_LEASE_SECONDS ?? 600);
  return Number.isFinite(configured) ? Math.max(60, configured) : 600;
}

function isNodeIoError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

function isSourceValidationFailure(error: unknown): boolean {
  return error instanceof SourceAccessError
    || error instanceof SourceConfigurationError
    || isNodeIoError(error, "ENOENT")
    || isNodeIoError(error, "EACCES")
    || isNodeIoError(error, "EPERM");
}

export function safeSynchronizationError(
  error: unknown,
  learningSpaceId: string | undefined,
  providerType: string,
  stage: SynchronizationStage,
) {
  const candidate = error instanceof Error ? error as Error & { code?: unknown; cause?: unknown } : null;
  const cause = candidate?.cause instanceof Error ? candidate.cause as Error & { code?: unknown } : null;
  return {
    learningSpaceId: learningSpaceId ?? "default",
    providerType,
    stage,
    errorName: candidate?.constructor.name ?? typeof error,
    errorMessage: safeErrorMessage(candidate),
    errorCode: typeof candidate?.code === "string" || typeof candidate?.code === "number" ? candidate.code : undefined,
    causeName: cause?.constructor.name,
    causeMessage: cause ? safeErrorMessage(cause) : undefined,
    causeCode: typeof cause?.code === "string" || typeof cause?.code === "number" ? cause.code : undefined,
  };
}

function safeErrorMessage(error: (Error & { code?: unknown }) | null): string {
  if (!error) return "Onbekende synchronisatiefout.";
  if (typeof error.code === "string" && ["ENOENT", "EACCES", "EPERM"].includes(error.code)) {
    return `${error.code}: de lokale bron kon niet worden gelezen.`;
  }
  return error.message
    .replace(/(['"])[A-Za-z]:\\.*?\1/g, "$1[redacted-path]$1")
    .slice(0, 1000);
}
