import type { StorageEntry, StorageProvider } from "@/lib/storage/provider";
import { getOneDriveConnection, graphJson, readGraphFile, type GraphDriveItem } from "@/lib/onedrive";

interface GraphChildrenResponse {
  value: GraphDriveItem[];
  "@odata.nextLink"?: string;
}

export class OneDriveProvider implements StorageProvider {
  readonly id = "onedrive";
  private readonly directories = new Map<string, string>();

  private constructor(private readonly driveId: string, rootFolderId: string) {
    this.directories.set("", rootFolderId);
  }

  static async fromStoredConnection(): Promise<OneDriveProvider> {
    const connection = await getOneDriveConnection();
    if (!connection) throw new Error("OneDrive is nog niet verbonden of de bronmap is nog niet geconfigureerd.");
    return new OneDriveProvider(connection.driveId, connection.folderId);
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
    return readGraphFile(this.driveId, sourceId);
  }

  private async listChildren(parentId: string): Promise<GraphDriveItem[]> {
    const items: GraphDriveItem[] = [];
    let url: string | undefined = `/drives/${encodeURIComponent(this.driveId)}/items/${encodeURIComponent(parentId)}/children?$select=id,name,eTag,lastModifiedDateTime,file,folder&$top=200`;
    while (url) {
      const response: GraphChildrenResponse = await graphJson<GraphChildrenResponse>(url);
      items.push(...response.value);
      url = response["@odata.nextLink"];
    }
    return items;
  }
}

function normalizePath(value: string): string {
  const segments = value.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) throw new Error("Ongeldig OneDrive-pad.");
  return segments.join("/");
}
