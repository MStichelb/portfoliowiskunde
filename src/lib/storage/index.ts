import { LocalFilesystemProvider } from "@/lib/storage/local-filesystem-provider";
import type { StorageProvider } from "@/lib/storage/provider";

const DEFAULT_SOURCE_PATH =
  "C:\\Users\\mathi\\OneDrive - EDUGO Scholengroep\\6WIS - Wiskunde\\testmapapplicatie";

export function getStorageProvider(): StorageProvider {
  return new LocalFilesystemProvider(
    process.env.PORTFOLIO_SOURCE_PATH ?? DEFAULT_SOURCE_PATH,
  );
}
