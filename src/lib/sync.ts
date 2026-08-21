import { randomUUID } from "node:crypto";

import { getLearningSpace, persistIndex, recordFailedSync, recordLearningSpaceSourceValidation, releaseSyncLease, tryAcquireSyncLease } from "@/lib/repositories";
import { indexSource } from "@/lib/storage/portfolio-indexer";
import { getStorageProviderWithType } from "@/lib/storage";
import { SourceAccessError, SourceConfigurationError } from "@/lib/source-errors";
import type { StorageProvider } from "@/lib/storage/provider";
import type { LearningSpace, LearningSpaceSource, StorageSourceType } from "@/lib/repositories";

interface SynchronizationDependencies {
  getConfiguredProvider?: (learningSpaceId?: string) => Promise<{ provider: StorageProvider; type: StorageSourceType; space: LearningSpace; source?: LearningSpaceSource }>;
  index?: typeof indexSource;
}

type SynchronizationStage = "provider-resolution" | "source-readiness" | "indexing" | "persistence";

export async function synchronizeSource(learningSpaceId?: string, dependencies: SynchronizationDependencies = {}) {
  if (learningSpaceId) {
    const requestedSpace = await getLearningSpace(learningSpaceId);
    if (requestedSpace && !requestedSpace.isActive) {
      return { portfolios: 0, warnings: 0, added: 0, updated: 0, missing: 0, skipped: true, skipReason: "archived" as const };
    }
  }
  let providerType = "local";
  let lease: { learningSpaceId: string; ownerId: string } | null = null;
  let source: LearningSpaceSource | undefined;
  let stage: SynchronizationStage = "provider-resolution";
  try {
    const configured = await (dependencies.getConfiguredProvider ?? getStorageProviderWithType)(learningSpaceId);
    providerType = configured.type;
    source = configured.source;
    const ownerId = randomUUID();
    const leaseSeconds = synchronizationLeaseSeconds();
    if (!await tryAcquireSyncLease(configured.space.id, ownerId, new Date(), leaseSeconds)) {
      return { portfolios: 0, warnings: 0, added: 0, updated: 0, missing: 0, skipped: true };
    }
    lease = { learningSpaceId: configured.space.id, ownerId };
    stage = "source-readiness";
    await configured.provider.assertReadyForIndex?.();
    const readiness = configured.provider.getReadinessMetadata?.();
    stage = "indexing";
    const portfolios = await (dependencies.index ?? indexSource)(configured.provider);
    const currentSpace = await getLearningSpace(configured.space.id);
    if (!currentSpace?.isActive) {
      return { portfolios: 0, warnings: 0, added: 0, updated: 0, missing: 0, skipped: true, skipReason: "archived" as const };
    }
    stage = "persistence";
    const result = await persistIndex(portfolios, configured.type, configured.space.id, {
      sourceId: configured.source?.id,
      mirrorCompletedAt: readiness?.mirrorCompletedAt,
    });
    return { portfolios: portfolios.length, ...result, skipped: false };
  } catch (error) {
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
    if (lease) await releaseSyncLease(lease.learningSpaceId, lease.ownerId).catch(() => {
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
