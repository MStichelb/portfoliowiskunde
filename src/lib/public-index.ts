import { after } from "next/server";

import { isSyncStale, maybeAutoSynchronize } from "@/lib/auto-sync";
import { getLatestSyncSummary, hasValidLearningSpaceIndex } from "@/lib/repositories";
import { hasConfiguredActiveSource } from "@/lib/storage";

export type PublicIndexPreparation = "fresh" | "deferred" | "blocking" | "unconfigured" | "prefetch-skipped";

interface PublicIndexDependencies {
  getLatestSyncSummary?: typeof getLatestSyncSummary;
  hasValidIndex?: typeof hasValidLearningSpaceIndex;
  hasConfiguredSource?: typeof hasConfiguredActiveSource;
  autoSynchronize?: (learningSpaceId: string) => Promise<void>;
  defer?: (task: () => Promise<void>) => void;
  isPrefetch?: boolean;
}

export async function preparePublicIndex(
  learningSpaceId: string,
  dependencies: PublicIndexDependencies = {},
): Promise<PublicIndexPreparation> {
  if (dependencies.isPrefetch) return "prefetch-skipped";

  const hasConfiguredSource = dependencies.hasConfiguredSource ?? hasConfiguredActiveSource;
  if (!await hasConfiguredSource(learningSpaceId)) return "unconfigured";

  const [summary, hasValidIndex] = await Promise.all([
    (dependencies.getLatestSyncSummary ?? getLatestSyncSummary)(learningSpaceId),
    (dependencies.hasValidIndex ?? hasValidLearningSpaceIndex)(learningSpaceId),
  ]);
  const lastAttemptAt = summary?.finishedAt ?? summary?.startedAt;
  if (!isSyncStale(lastAttemptAt)) return "fresh";

  const autoSynchronize = dependencies.autoSynchronize ?? ((spaceId: string) => maybeAutoSynchronize(spaceId));
  if (!hasValidIndex) {
    await autoSynchronize(learningSpaceId);
    return "blocking";
  }

  const defer = dependencies.defer ?? after;
  defer(() => autoSynchronize(learningSpaceId).catch(() => undefined));
  return "deferred";
}

export function isNextPrefetchRequest(requestHeaders: Pick<Headers, "get">): boolean {
  return requestHeaders.get("next-router-prefetch") === "1" || requestHeaders.get("purpose") === "prefetch";
}
