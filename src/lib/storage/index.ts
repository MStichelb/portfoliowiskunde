import { LocalFilesystemProvider } from "@/lib/storage/local-filesystem-provider";
import type { StorageProvider } from "@/lib/storage/provider";
import { getLocalSourcePath, getStorageProviderType } from "@/lib/repositories";
import { DEFAULT_LOCAL_SOURCE_PATH } from "@/lib/app-config";

export { DEFAULT_LOCAL_SOURCE_PATH };

export async function getStorageProvider(): Promise<StorageProvider> {
  const { provider } = await getStorageProviderWithType();
  return provider;
}

export async function getStorageProviderWithType(): Promise<{ provider: StorageProvider; type: "local" | "onedrive" }> {
  const type = await getStorageProviderType();
  if (type === "onedrive") {
    const { OneDriveProvider } = await import("@/lib/storage/onedrive-provider");
    return { provider: await OneDriveProvider.fromStoredConnection(), type };
  }
  return { provider: new LocalFilesystemProvider(await getLocalSourcePath()), type };
}
