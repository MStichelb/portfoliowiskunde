import type { StorageEntry, StorageProvider } from "@/lib/storage/provider";
import { SourceAccessError, SourceConfigurationError } from "@/lib/source-errors";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const SHORTCUT_MIME_TYPE = "application/vnd.google-apps.shortcut";

interface GoogleDriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  version?: string;
  md5Checksum?: string;
  trashed?: boolean;
}

interface GoogleDriveListResponse {
  files?: GoogleDriveFile[];
  nextPageToken?: string;
}

interface GoogleDriveProviderDependencies {
  fetch?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
}

export class GoogleDriveProvider implements StorageProvider {
  readonly id = "google-drive";
  private readonly directories = new Map<string, string>();
  private readonly fetchImplementation: typeof fetch;
  private readonly getAccessToken: () => Promise<string>;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly maxRetries: number;
  private rootVerified = false;

  private constructor(private readonly rootFolderId: string, dependencies: GoogleDriveProviderDependencies = {}) {
    if (!isGoogleDriveId(rootFolderId)) throw new SourceConfigurationError("De Google Drive folder-ID is ongeldig.");
    this.directories.set("", rootFolderId);
    this.fetchImplementation = dependencies.fetch ?? fetch;
    this.getAccessToken = dependencies.getAccessToken ?? (() => import("@/lib/google-drive-auth").then((module) => module.getGoogleDriveAccessToken()));
    this.sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.maxRetries = dependencies.maxRetries ?? 2;
  }

  static fromSpaceConnection(connection: { folderId: string }, dependencies: GoogleDriveProviderDependencies = {}): GoogleDriveProvider {
    return new GoogleDriveProvider(connection.folderId, dependencies);
  }

  async list(relativePath = ""): Promise<StorageEntry[]> {
    const normalizedPath = normalizePath(relativePath);
    const parentId = this.directories.get(normalizedPath);
    if (!parentId) throw new SourceAccessError("Google Drive-map valt buiten de ingestelde bronmap of werd nog niet veilig opgelost.");
    if (!this.rootVerified) await this.verifyRootFolder();

    const files = await this.listChildren(parentId);
    const entries = files
      .filter((file) => !file.trashed && file.mimeType !== SHORTCUT_MIME_TYPE)
      .map((file) => this.toStorageEntry(file, normalizedPath));
    assertUniqueNames(entries, normalizedPath);
    for (const entry of entries) {
      if (entry.kind === "directory" && entry.sourceId) this.directories.set(entry.relativePath, entry.sourceId);
    }
    return entries.sort((left, right) => left.name.localeCompare(right.name, "nl") || (left.sourceId ?? "").localeCompare(right.sourceId ?? ""));
  }

  async readFile(sourceId: string): Promise<Buffer> {
    if (!isGoogleDriveId(sourceId)) throw new SourceAccessError("Ongeldige Google Drive-bestandsidentiteit.");
    const response = await this.request(`/files/${encodeURIComponent(sourceId)}?alt=media&supportsAllDrives=true`);
    return Buffer.from(await response.arrayBuffer());
  }

  private async verifyRootFolder(): Promise<void> {
    const fields = encodeURIComponent("id,name,mimeType,trashed");
    const root = await this.requestJson<GoogleDriveFile>(`/files/${encodeURIComponent(this.rootFolderId)}?fields=${fields}&supportsAllDrives=true`);
    if (root.id !== this.rootFolderId || root.mimeType !== FOLDER_MIME_TYPE || root.trashed) {
      throw new SourceAccessError("De geconfigureerde Google Drive-bron is geen toegankelijke map.");
    }
    this.rootVerified = true;
  }

  private async listChildren(parentId: string): Promise<GoogleDriveFile[]> {
    const files: GoogleDriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const parameters = new URLSearchParams({
        q: `'${parentId}' in parents and trashed = false`,
        spaces: "drive",
        pageSize: "1000",
        orderBy: "name_natural",
        fields: "nextPageToken,files(id,name,mimeType,modifiedTime,version,md5Checksum,trashed)",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) parameters.set("pageToken", pageToken);
      const page = await this.requestJson<GoogleDriveListResponse>(`/files?${parameters}`);
      files.push(...(page.files ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }

  private toStorageEntry(file: GoogleDriveFile, parentPath: string): StorageEntry {
    if (!file.id || !isGoogleDriveId(file.id) || !file.name || !file.mimeType) {
      throw new SourceAccessError("Google Drive leverde onvolledige bestandsmetadata.");
    }
    const relativePath = parentPath ? `${parentPath}/${file.name}` : file.name;
    return {
      name: file.name,
      relativePath,
      sourceId: file.id,
      kind: file.mimeType === FOLDER_MIME_TYPE ? "directory" : "file",
      lastModifiedAt: file.modifiedTime,
      sourceVersion: file.version ?? file.md5Checksum,
    };
  }

  private async requestJson<T>(path: string): Promise<T> {
    const response = await this.request(path);
    try {
      return await response.json() as T;
    } catch {
      throw new SourceAccessError("Google Drive leverde een ongeldig antwoord.");
    }
  }

  private async request(path: string): Promise<Response> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const token = await this.getAccessToken();
      const response = await this.fetchImplementation(`${DRIVE_API_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (response.ok) return response;
      if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await this.sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : 250 * 2 ** attempt);
        continue;
      }
      throw googleDriveResponseError(response.status);
    }
    throw new SourceAccessError("Google Drive kon na meerdere pogingen niet worden bereikt.");
  }
}

function normalizePath(value: string): string {
  const segments = value.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) throw new SourceAccessError("Ongeldig Google Drive-pad.");
  return segments.join("/");
}

function isGoogleDriveId(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function assertUniqueNames(entries: StorageEntry[], parentPath: string): void {
  const names = new Set<string>();
  for (const entry of entries) {
    const key = entry.name.toLocaleLowerCase("nl");
    if (names.has(key)) {
      throw new SourceAccessError(`Google Drive bevat dubbele namen in ${parentPath || "de bronmap"}; paden zijn daardoor niet eenduidig.`);
    }
    names.add(key);
  }
}

function googleDriveResponseError(status: number): SourceAccessError {
  if (status === 401) return new SourceAccessError("Google Drive-authenticatie werd geweigerd. Controleer het service-accountkeybestand.");
  if (status === 403) return new SourceAccessError("Het Google service account heeft geen toegang tot deze map. Deel de mirrorfolder als Viewer.");
  if (status === 404) return new SourceAccessError("De Google Drive-map of het bestand bestaat niet of is niet gedeeld met het service account.");
  if (status === 429) return new SourceAccessError("Google Drive is tijdelijk overbelast. Probeer de synchronisatie later opnieuw.");
  return new SourceAccessError(`Google Drive kon niet worden gelezen (HTTP ${status}).`);
}
