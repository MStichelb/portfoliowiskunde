import { resolveByteRange } from "@/lib/byte-range";
import type { OpenFileOptions, OpenedFile, StorageEntry, StorageProvider } from "@/lib/storage/provider";
import { SourceAccessError, SourceConfigurationError, SourceFileNotFoundError, SourceTransientError } from "@/lib/source-errors";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const SHORTCUT_MIME_TYPE = "application/vnd.google-apps.shortcut";
const MIRROR_COMPLETION_MARKER = "_mirror-complete.json";
const INCOMPLETE_MIRROR_MESSAGE = "De Google Drive-mirror is momenteel niet volledig. De laatst geldige index blijft actief.";

interface GoogleDriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  version?: string;
  md5Checksum?: string;
  size?: string;
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
  private mirrorCompletedAt: string | undefined;

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

  async assertReadyForIndex(): Promise<void> {
    if (!this.rootVerified) await this.verifyRootFolder();
    const markers = (await this.listChildren(this.rootFolderId)).filter(
      (file) => !file.trashed && file.name === MIRROR_COMPLETION_MARKER,
    );
    const marker = markers.length === 1 ? markers[0] : undefined;
    if (!marker?.id || marker.mimeType === FOLDER_MIME_TYPE || marker.mimeType === SHORTCUT_MIME_TYPE) {
      throw incompleteMirrorError();
    }

    let payload: unknown;
    try {
      const response = await this.request(`/files/${encodeURIComponent(marker.id)}?alt=media&supportsAllDrives=true`);
      payload = await response.json();
    } catch (error) {
      if (error instanceof SourceTransientError) throw error;
      throw incompleteMirrorError();
    }
    const completedAt = completeMirrorTimestamp(payload);
    if (!completedAt) throw incompleteMirrorError();
    this.mirrorCompletedAt = completedAt;
  }

  getReadinessMetadata(): { mirrorCompletedAt?: string } {
    return { mirrorCompletedAt: this.mirrorCompletedAt };
  }

  async list(relativePath = ""): Promise<StorageEntry[]> {
    const normalizedPath = normalizePath(relativePath);
    const parentId = this.directories.get(normalizedPath);
    if (!parentId) throw new SourceAccessError("Google Drive-map valt buiten de ingestelde bronmap of werd nog niet veilig opgelost.");
    if (!this.rootVerified) await this.verifyRootFolder();

    const files = await this.listChildren(parentId);
    const entries = files
      .filter((file) => !file.trashed && file.mimeType !== SHORTCUT_MIME_TYPE && (normalizedPath !== "" || file.name !== MIRROR_COMPLETION_MARKER))
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

  async openFile(sourceId: string, options: OpenFileOptions = {}): Promise<OpenedFile> {
    if (!isGoogleDriveId(sourceId)) throw new SourceAccessError("Ongeldige Google Drive-bestandsidentiteit.");
    const fields = encodeURIComponent("id,name,size,mimeType,modifiedTime,md5Checksum,version,trashed");
    const metadata = await this.requestJson<GoogleDriveFile>(`/files/${encodeURIComponent(sourceId)}?fields=${fields}&supportsAllDrives=true`, { signal: options.signal });
    const totalLength = Number(metadata.size);
    if (metadata.id !== sourceId || metadata.trashed || metadata.mimeType === FOLDER_MIME_TYPE || !Number.isSafeInteger(totalLength) || totalLength < 0) {
      throw new SourceFileNotFoundError("Het Google Drive-bronbestand bestaat niet.");
    }
    const range = resolveByteRange(options.range, totalLength);
    if (options.headOnly) return googleOpenedFile(metadata, totalLength, range, null);

    const response = await this.request(`/files/${encodeURIComponent(sourceId)}?alt=media&supportsAllDrives=true`, {
      headers: range ? { Range: `bytes=${range.start}-${range.end}` } : undefined,
      signal: options.signal,
    });
    if (range && response.status !== 206) throw new SourceAccessError("Google Drive ondersteunde het gevraagde bytebereik niet.");
    if (!response.body) throw new SourceAccessError("Google Drive leverde geen bestandsstream.");
    return googleOpenedFile(metadata, totalLength, range, response.body);
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

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.request(path, init);
    try {
      return await response.json() as T;
    } catch {
      throw new SourceAccessError("Google Drive leverde een ongeldig antwoord.");
    }
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const token = await this.getAccessToken();
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      const response = await this.fetchImplementation(`${DRIVE_API_URL}${path}`, {
        ...init,
        headers,
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

function completeMirrorTimestamp(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const marker = value as Record<string, unknown>;
  return marker.status === "complete" && isIsoDate(marker.completedAt) ? marker.completedAt : null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function incompleteMirrorError(): SourceAccessError {
  return new SourceAccessError(INCOMPLETE_MIRROR_MESSAGE);
}

function googleDriveResponseError(status: number): SourceAccessError {
  if (status === 401) return new SourceAccessError("Google Drive-authenticatie werd geweigerd. Controleer het service-accountkeybestand.");
  if (status === 403) return new SourceAccessError("Het Google service account heeft geen toegang tot deze map. Deel de mirrorfolder als Viewer.");
  if (status === 404) return new SourceFileNotFoundError("De Google Drive-map of het bestand bestaat niet of is niet gedeeld met het service account.");
  if (status === 429 || status >= 500) return new SourceTransientError("Google Drive is tijdelijk niet beschikbaar. Probeer later opnieuw.");
  return new SourceAccessError(`Google Drive kon niet worden gelezen (HTTP ${status}).`);
}

function googleOpenedFile(
  metadata: GoogleDriveFile,
  totalLength: number,
  range: ReturnType<typeof resolveByteRange>,
  body: ReadableStream<Uint8Array> | null,
): OpenedFile {
  return {
    body,
    contentLength: range?.length ?? totalLength,
    totalLength,
    contentType: metadata.mimeType,
    contentRange: range ? `bytes ${range.start}-${range.end}/${totalLength}` : undefined,
    etag: metadata.md5Checksum ? `"${metadata.md5Checksum}"` : metadata.version ? `W/"${metadata.version}"` : undefined,
    lastModified: metadata.modifiedTime ? new Date(metadata.modifiedTime).toUTCString() : undefined,
    acceptRanges: true,
  };
}
