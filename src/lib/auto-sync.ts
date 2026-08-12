import { getLatestSyncSummary } from "@/lib/repositories";

const inFlight = new Map<string, Promise<void>>();

interface AutoSyncDependencies {
  getLatestSyncSummary?: typeof getLatestSyncSummary;
  synchronize?: (learningSpaceId?: string) => Promise<unknown>;
}

export function isSyncStale(lastSyncAt: string | null | undefined, now = Date.now(), ttlSeconds = Number(process.env.PORTFOLIO_AUTO_SYNC_TTL_SECONDS ?? 180)): boolean {
  const timestamp = lastSyncAt ? Date.parse(lastSyncAt) : Number.NaN;
  const safeTtlSeconds = Number.isFinite(ttlSeconds) ? Math.max(30, ttlSeconds) : 180;
  return !Number.isFinite(timestamp) || now - timestamp >= safeTtlSeconds * 1000;
}

export async function maybeAutoSynchronize(learningSpaceId?: string, dependencies: AutoSyncDependencies = {}): Promise<void> {
  const resolvedSpaceId = learningSpaceId ?? "default";
  const summary = await (dependencies.getLatestSyncSummary ?? getLatestSyncSummary)(learningSpaceId);
  const lastSync = summary?.finishedAt ?? summary?.startedAt;
  if (!isSyncStale(lastSync)) return;
  if (!inFlight.has(resolvedSpaceId)) {
    const synchronize = dependencies.synchronize ?? ((spaceId?: string) => import("@/lib/sync").then(({ synchronizeSource }) => synchronizeSource(spaceId)));
    inFlight.set(resolvedSpaceId, synchronize(learningSpaceId)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => { inFlight.delete(resolvedSpaceId); }));
  }
  await inFlight.get(resolvedSpaceId);
}
