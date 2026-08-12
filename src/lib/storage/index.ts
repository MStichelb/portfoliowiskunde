import { LocalFilesystemProvider } from "@/lib/storage/local-filesystem-provider";
import type { StorageProvider } from "@/lib/storage/provider";
import { getLearningSpace, getLearningSpaces, getSetting, type LearningSpace } from "@/lib/repositories";
import { DEFAULT_LOCAL_SOURCE_PATH } from "@/lib/app-config";
import { SourceConfigurationError } from "@/lib/source-errors";

export { DEFAULT_LOCAL_SOURCE_PATH };

export async function getStorageProvider(spaceId?: string): Promise<StorageProvider> {
  const { provider } = await getStorageProviderWithType(spaceId);
  return provider;
}

export async function getStorageProviderWithType(spaceId?: string): Promise<{ provider: StorageProvider; type: "local" | "onedrive"; space: LearningSpace }> {
  const resolvedSpaceId = spaceId ?? (await getLearningSpaces(true)).at(-1)?.id;
  const space = resolvedSpaceId ? await getLearningSpace(resolvedSpaceId) : null;
  if (!space) throw new SourceConfigurationError("Leeromgeving niet gevonden.");
  if (space.storageProvider === "onedrive") {
    const { OneDriveProvider } = await import("@/lib/storage/onedrive-provider");
    if (!space.oneDriveDriveId || !space.oneDriveFolderId) throw new SourceConfigurationError("OneDrive is nog niet geconfigureerd voor deze leeromgeving.");
    return { provider: OneDriveProvider.fromSpaceConnection({ driveId: space.oneDriveDriveId, folderId: space.oneDriveFolderId }), type: "onedrive", space };
  }
  if (process.env.NODE_ENV === "production") {
    throw new SourceConfigurationError("Local filesystem is alleen beschikbaar voor lokale ontwikkeling. Configureer OneDrive voor productie.");
  }
  const legacyDefaultSpaceId = await getSetting("legacy_default_learning_space_id");
  const root = space.localSourcePath || (legacyDefaultSpaceId === space.id ? DEFAULT_LOCAL_SOURCE_PATH : "");
  if (!root) throw new SourceConfigurationError("Stel eerst een geldige bronmap in.");
  return { provider: new LocalFilesystemProvider(root), type: "local", space };
}
