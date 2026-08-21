import { LocalFilesystemProvider } from "@/lib/storage/local-filesystem-provider";
import type { StorageProvider } from "@/lib/storage/provider";
import {
  getActiveLearningSpaceSource,
  getLearningSpace,
  getLearningSpaceSource,
  getLearningSpaces,
  getSetting,
  type LearningSpace,
  type LearningSpaceSource,
} from "@/lib/repositories";
import { DEFAULT_LOCAL_SOURCE_PATH } from "@/lib/app-config";
import { SourceConfigurationError } from "@/lib/source-errors";
import { getGoogleServiceAccountConfigurationProblem } from "@/lib/google-service-account-config";

export { DEFAULT_LOCAL_SOURCE_PATH };

export async function getStorageProvider(spaceId?: string): Promise<StorageProvider> {
  const { provider } = await getStorageProviderWithType(spaceId);
  return provider;
}

export async function getStorageProviderWithType(spaceId?: string): Promise<{ provider: StorageProvider; type: LearningSpace["sourceType"]; space: LearningSpace; source: LearningSpaceSource }> {
  const resolvedSpaceId = spaceId ?? (await getLearningSpaces(true)).at(-1)?.id;
  const space = resolvedSpaceId ? await getLearningSpace(resolvedSpaceId) : null;
  if (!space) throw new SourceConfigurationError("Leeromgeving niet gevonden.");
  const source = await getActiveLearningSpaceSource(space.id);
  if (!source) throw new SourceConfigurationError("Deze leeromgeving heeft geen actieve bron.");
  return { ...(await providerForSource(space, source)), space, source };
}

export async function getStorageProviderForSource(learningSpaceId: string, sourceId: string): Promise<{ provider: StorageProvider; type: LearningSpace["sourceType"]; space: LearningSpace; source: LearningSpaceSource }> {
  const [space, source] = await Promise.all([getLearningSpace(learningSpaceId), getLearningSpaceSource(sourceId)]);
  if (!space || !source || source.learningSpaceId !== space.id) throw new SourceConfigurationError("Bron niet gevonden voor deze leeromgeving.");
  return { ...(await providerForSource(space, source)), space, source };
}

async function providerForSource(space: LearningSpace, source: LearningSpaceSource): Promise<{ provider: StorageProvider; type: LearningSpace["sourceType"] }> {
  if (source.providerType === "onedrive") {
    const { OneDriveProvider } = await import("@/lib/storage/onedrive-provider");
    if (!source.oneDriveDriveId || !source.oneDriveFolderId) throw new SourceConfigurationError("OneDrive is nog niet geconfigureerd voor deze bron.");
    return { provider: OneDriveProvider.fromSpaceConnection({ driveId: source.oneDriveDriveId, folderId: source.oneDriveFolderId }), type: "onedrive" };
  }
  if (source.providerType === "google_drive") {
    const problem = getGoogleServiceAccountConfigurationProblem();
    if (problem) throw new SourceConfigurationError(problem);
    if (!source.googleDriveFolderId) throw new SourceConfigurationError("Google Drive is nog niet geconfigureerd voor deze bron.");
    const { GoogleDriveProvider } = await import("@/lib/storage/google-drive-provider");
    return { provider: GoogleDriveProvider.fromSpaceConnection({ folderId: source.googleDriveFolderId }), type: "google_drive" };
  }
  if (process.env.NODE_ENV === "production") {
    throw new SourceConfigurationError("Lokale bestanden (test) zijn alleen beschikbaar voor lokale ontwikkeling. Configureer OneDrive of Google Drive voor productie.");
  }
  const legacyDefaultSpaceId = await getSetting("legacy_default_learning_space_id");
  const root = source.localSourcePath || (legacyDefaultSpaceId === space.id ? DEFAULT_LOCAL_SOURCE_PATH : "");
  if (!root) throw new SourceConfigurationError("Stel eerst een geldige bronmap in.");
  return { provider: new LocalFilesystemProvider(root), type: "local" };
}
