import { randomUUID } from "node:crypto";

import { persistIndex, recordFailedSync, releaseSyncLease, tryAcquireSyncLease } from "@/lib/repositories";
import { indexSource } from "@/lib/storage/portfolio-indexer";
import { getStorageProviderWithType } from "@/lib/storage";
import { SourceAccessError } from "@/lib/source-errors";

export async function synchronizeSource(learningSpaceId?: string) {
  let providerType = "local";
  let lease: { learningSpaceId: string; ownerId: string } | null = null;
  try {
    const configured = await getStorageProviderWithType(learningSpaceId);
    providerType = configured.type;
    const ownerId = randomUUID();
    const leaseSeconds = synchronizationLeaseSeconds();
    if (!await tryAcquireSyncLease(configured.space.id, ownerId, new Date(), leaseSeconds)) {
      return { portfolios: 0, warnings: 0, added: 0, updated: 0, missing: 0, skipped: true };
    }
    lease = { learningSpaceId: configured.space.id, ownerId };
    const portfolios = await indexSource(configured.provider);
    const result = await persistIndex(portfolios, configured.type, configured.space.id);
    return { portfolios: portfolios.length, ...result, skipped: false };
  } catch (error) {
    if (learningSpaceId) await recordFailedSync(providerType, error, learningSpaceId).catch(() => undefined);
    console.error("Synchronization failed.", { learningSpaceId: learningSpaceId ?? "default", providerType, errorType: error instanceof Error ? error.name : typeof error });
    if (isNodeIoError(error, "ENOENT")) throw new SourceAccessError("De ingestelde bronmap bestaat niet of is niet bereikbaar.");
    if (isNodeIoError(error, "EACCES") || isNodeIoError(error, "EPERM")) throw new SourceAccessError("De ingestelde bronmap is niet leesbaar.");
    if (providerType === "onedrive") throw new SourceAccessError("OneDrive kon niet worden gesynchroniseerd. Controleer de app-brede verbinding en de drive- en map-ID's.");
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
