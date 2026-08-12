import { LocalFilesystemProvider } from "@/lib/storage/local-filesystem-provider";
import type { StorageProvider } from "@/lib/storage/provider";
import { getLearningSpace, getLearningSpaces, getSetting, type LearningSpace } from "@/lib/repositories";
import { DEFAULT_LOCAL_SOURCE_PATH } from "@/lib/app-config";

export { DEFAULT_LOCAL_SOURCE_PATH };

export async function getStorageProvider(spaceId?: string): Promise<StorageProvider> {
  const { provider } = await getStorageProviderWithType(spaceId);
  return provider;
}

export async function getStorageProviderWithType(spaceId?: string): Promise<{ provider: StorageProvider; type: "local" | "onedrive"; space: LearningSpace }> {
  const resolvedSpaceId = spaceId ?? (await getLearningSpaces(true)).at(-1)?.id;
  const space = resolvedSpaceId ? await getLearningSpace(resolvedSpaceId) : null;
  if (!space) throw new Error("Leeromgeving niet gevonden.");
  if (space.storageProvider === "onedrive") {
    const { OneDriveProvider } = await import("@/lib/storage/onedrive-provider");
    if (!space.oneDriveDriveId || !space.oneDriveFolderId) throw new Error("OneDrive is nog niet geconfigureerd voor deze leeromgeving.");
    return { provider: OneDriveProvider.fromSpaceConnection({ driveId: space.oneDriveDriveId, folderId: space.oneDriveFolderId }), type: "onedrive", space };
  }
  const legacyDefaultSpaceId = await getSetting("legacy_default_learning_space_id");
  const root = space.localSourcePath || (legacyDefaultSpaceId === space.id ? DEFAULT_LOCAL_SOURCE_PATH : "");
  if (!root) throw new Error("Vul eerst een lokale bronmap in voor deze leeromgeving.");
  return { provider: new LocalFilesystemProvider(root), type: "local", space };
}
