import { resolveByteRange } from "@/lib/byte-range";
import type { OpenFileOptions, OpenedFile, StorageEntry, StorageProvider } from "@/lib/storage/provider";
import { SourceAccessError, SourceFileNotFoundError } from "@/lib/source-errors";
import { getOneDriveConnection, graphJson, openGraphFile, readGraphFile, type GraphDriveItem } from "@/lib/onedrive";

interface GraphChildrenResponse {
  value: GraphDriveItem[];
  "@odata.nextLink"?: string;
}

interface OneDriveProviderDependencies {
  graphJson?: typeof graphJson;
  openGraphFile?: typeof openGraphFile;
  readGraphFile?: typeof readGraphFile;
}

export class OneDriveProvider implements StorageProvider {
  readonly id = "onedrive";
  private readonly directories = new Map<string, string>();
  private readonly graphJsonImplementation: typeof graphJson;
  private readonly openGraphFileImplementation: typeof openGraphFile;
  private readonly readGraphFileImplementation: typeof readGraphFile;

  private constructor(private readonly driveId: string, rootFolderId: string, storageConnectionId: string | null, dependencies: OneDriveProviderDependencies = {}) {
    this.directories.set("", rootFolderId);
    this.graphJsonImplementation = dependencies.graphJson ?? ((path) => graphJson(path, storageConnectionId ?? undefined));
    this.openGraphFileImplementation = dependencies.openGraphFile ?? ((driveId, itemId, range, signal) => openGraphFile(driveId, itemId, range, signal, {}, storageConnectionId ?? undefined));
    this.readGraphFileImplementation = dependencies.readGraphFile ?? ((driveId, itemId) => readGraphFile(driveId, itemId, storageConnectionId ?? undefined));
  }

  static async fromStoredConnection(): Promise<OneDriveProvider> {
    const connection = await getOneDriveConnection();
    if (!connection) throw new Error("OneDrive is nog niet verbonden of de bronmap is nog niet geconfigureerd.");
    return new OneDriveProvider(connection.driveId, connection.folderId, connection.storageConnectionId);
  }

  static fromSpaceConnection(connection: { driveId: string; folderId: string; storageConnectionId?: string | null }, dependencies: OneDriveProviderDependencies = {}): OneDriveProvider {
    return new OneDriveProvider(connection.driveId, connection.folderId, connection.storageConnectionId ?? null, dependencies);
  }

  async list(relativePath = ""): Promise<StorageEntry[]> {
    const normalizedPath = normalizePath(relativePath);
    const parentId = this.directories.get(normalizedPath);
    if (!parentId) throw new Error("OneDrive-map kon niet uit de huidige bronstructuur worden opgelost.");
    const items = await this.listChildren(parentId);
    const entries = items.filter((item) => item.file || item.folder).map((item) => {
      const entryPath = normalizedPath ? `${normalizedPath}/${item.name}` : item.name;
      if (item.folder) this.directories.set(entryPath, item.id);
      return {
        name: item.name,
        relativePath: entryPath,
        sourceId: item.id,
        kind: item.folder ? ("directory" as const) : ("file" as const),
        lastModifiedAt: item.lastModifiedDateTime,
        sourceVersion: item.eTag,
      };
    });
    return entries.sort((left, right) => left.name.localeCompare(right.name, "nl"));
  }

  async readFile(sourceId: string): Promise<Buffer> {
    if (!sourceId || sourceId.includes("/") || sourceId.includes("\\")) throw new Error("Ongeldige OneDrive-bestandsidentiteit.");
    return this.readGraphFileImplementation(this.driveId, sourceId);
  }

  async openFile(sourceId: string, options: OpenFileOptions = {}): Promise<OpenedFile> {
    if (!sourceId || sourceId.includes("/") || sourceId.includes("\\")) throw new SourceAccessError("Ongeldige OneDrive-bestandsidentiteit.");
    const metadata = await this.graphJsonImplementation<GraphDriveItem>(`/drives/${encodeURIComponent(this.driveId)}/items/${encodeURIComponent(sourceId)}?$select=id,size,eTag,lastModifiedDateTime,file`);
    if (metadata.id !== sourceId || !metadata.file || !Number.isSafeInteger(metadata.size) || metadata.size! < 0) {
      throw new SourceFileNotFoundError("Het OneDrive-bronbestand bestaat niet.");
    }
    const totalLength = metadata.size!;
    const range = resolveByteRange(options.range, totalLength);
    if (options.headOnly) return oneDriveOpenedFile(metadata, totalLength, range, null);

    const response = await this.openGraphFileImplementation(
      this.driveId,
      sourceId,
      range ? `bytes=${range.start}-${range.end}` : undefined,
      options.signal,
    );
    if (range && response.status !== 206) throw new SourceAccessError("OneDrive ondersteunde het gevraagde bytebereik niet.");
    if (!response.body) throw new SourceAccessError("OneDrive leverde geen bestandsstream.");
    return oneDriveOpenedFile(metadata, totalLength, range, response.body);
  }

  private async listChildren(parentId: string): Promise<GraphDriveItem[]> {
    const items: GraphDriveItem[] = [];
    let url: string | undefined = `/drives/${encodeURIComponent(this.driveId)}/items/${encodeURIComponent(parentId)}/children?$select=id,name,eTag,lastModifiedDateTime,file,folder&$top=200`;
    while (url) {
      const response: GraphChildrenResponse = await this.graphJsonImplementation<GraphChildrenResponse>(url);
      items.push(...response.value);
      url = response["@odata.nextLink"];
    }
    return items;
  }
}

function oneDriveOpenedFile(
  metadata: GraphDriveItem,
  totalLength: number,
  range: ReturnType<typeof resolveByteRange>,
  body: ReadableStream<Uint8Array> | null,
): OpenedFile {
  return {
    body,
    contentLength: range?.length ?? totalLength,
    totalLength,
    contentType: metadata.file?.mimeType,
    contentRange: range ? `bytes ${range.start}-${range.end}/${totalLength}` : undefined,
    etag: metadata.eTag,
    lastModified: metadata.lastModifiedDateTime ? new Date(metadata.lastModifiedDateTime).toUTCString() : undefined,
    acceptRanges: true,
  };
}

function normalizePath(value: string): string {
  const segments = value.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) throw new Error("Ongeldig OneDrive-pad.");
  return segments.join("/");
}
