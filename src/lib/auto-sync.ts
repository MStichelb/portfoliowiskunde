import { getLatestSyncSummary } from "@/lib/repositories";

const inFlight = new Map<string, Promise<void>>();

export function isSyncStale(lastSyncAt: string | null | undefined, now = Date.now(), ttlSeconds = Number(process.env.PORTFOLIO_AUTO_SYNC_TTL_SECONDS ?? 180)): boolean {
  const timestamp = lastSyncAt ? Date.parse(lastSyncAt) : Number.NaN;
  return !Number.isFinite(timestamp) || now - timestamp >= Math.max(30, ttlSeconds) * 1000;
}

export async function maybeAutoSynchronize(learningSpaceId?: string): Promise<void> {
  const resolvedSpaceId = learningSpaceId ?? "default";
  const summary = await getLatestSyncSummary(learningSpaceId);
  const lastSync = summary?.finishedAt ?? summary?.startedAt;
  if (!isSyncStale(lastSync)) return;
  if (!inFlight.has(resolvedSpaceId)) {
    inFlight.set(resolvedSpaceId, import("@/lib/sync").then(({ synchronizeSource }) => synchronizeSource(learningSpaceId)).then(() => undefined).finally(() => { inFlight.delete(resolvedSpaceId); }));
  }
  await inFlight.get(resolvedSpaceId);
}
