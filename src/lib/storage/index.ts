import { LocalFilesystemProvider } from "@/lib/storage/local-filesystem-provider";
import type { StorageProvider } from "@/lib/storage/provider";
import { getLocalSourcePath } from "@/lib/repositories";
import { DEFAULT_LOCAL_SOURCE_PATH } from "@/lib/app-config";

export { DEFAULT_LOCAL_SOURCE_PATH };

export async function getStorageProvider(): Promise<StorageProvider> {
  return new LocalFilesystemProvider(await getLocalSourcePath());
}
