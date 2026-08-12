import { persistIndex, recordFailedSync } from "@/lib/repositories";
import { indexSource } from "@/lib/storage/portfolio-indexer";
import { getStorageProviderWithType } from "@/lib/storage";

export async function synchronizeSource(learningSpaceId?: string) {
  let providerType = "local";
  try {
    const configured = await getStorageProviderWithType(learningSpaceId);
    providerType = configured.type;
    const portfolios = await indexSource(configured.provider);
    const result = await persistIndex(portfolios, configured.type, configured.space.id);
    return { portfolios: portfolios.length, ...result };
  } catch (error) {
    if (learningSpaceId) await recordFailedSync(providerType, error, learningSpaceId).catch(() => undefined);
    throw error;
  }
}
