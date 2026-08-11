import { getLatestSyncSummary } from "@/lib/repositories";

let inFlight: Promise<void> | undefined;

export function isSyncStale(lastSyncAt: string | null | undefined, now = Date.now(), ttlSeconds = Number(process.env.PORTFOLIO_AUTO_SYNC_TTL_SECONDS ?? 180)): boolean {
  const timestamp = lastSyncAt ? Date.parse(lastSyncAt) : Number.NaN;
  return !Number.isFinite(timestamp) || now - timestamp >= Math.max(30, ttlSeconds) * 1000;
}

export async function maybeAutoSynchronize(): Promise<void> {
  const summary = await getLatestSyncSummary();
  const lastSync = summary?.finishedAt ?? summary?.startedAt;
  if (!isSyncStale(lastSync)) return;
  if (!inFlight) {
    inFlight = import("@/lib/sync").then(({ synchronizeSource }) => synchronizeSource()).then(() => undefined).finally(() => { inFlight = undefined; });
  }
  await inFlight;
}
