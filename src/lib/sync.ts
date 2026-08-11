import { persistIndex } from "@/lib/repositories";
import { indexSource } from "@/lib/storage/portfolio-indexer";
import { getStorageProvider } from "@/lib/storage";

export async function synchronizeSource() {
  const portfolios = await indexSource(getStorageProvider());
  const result = await persistIndex(portfolios);
  return { portfolios: portfolios.length, warnings: result.warnings };
}
