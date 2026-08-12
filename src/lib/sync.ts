import { persistIndex, recordFailedSync } from "@/lib/repositories";
import { indexSource } from "@/lib/storage/portfolio-indexer";
import { getStorageProviderWithType } from "@/lib/storage";
import { SourceAccessError } from "@/lib/source-errors";

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
    if (isNodeIoError(error, "ENOENT")) throw new SourceAccessError("De ingestelde bronmap bestaat niet of is niet bereikbaar.");
    if (isNodeIoError(error, "EACCES") || isNodeIoError(error, "EPERM")) throw new SourceAccessError("De ingestelde bronmap is niet leesbaar.");
    throw error;
  }
}

function isNodeIoError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}
