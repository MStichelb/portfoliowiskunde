import { persistIndex, recordFailedSync } from "@/lib/repositories";
import { indexSource } from "@/lib/storage/portfolio-indexer";
import { getStorageProviderWithType } from "@/lib/storage";

export async function synchronizeSource() {
  let providerType = "local";
  try {
    const configured = await getStorageProviderWithType();
    providerType = configured.type;
    const portfolios = await indexSource(configured.provider);
    const result = await persistIndex(portfolios, configured.type);
    return { portfolios: portfolios.length, ...result };
  } catch (error) {
    await recordFailedSync(providerType, error).catch(() => undefined);
    throw error;
  }
}
