export interface StorageEntry {
  name: string;
  relativePath: string;
  sourceId?: string;
  kind: "file" | "directory";
  lastModifiedAt?: string;
  sourceVersion?: string;
}

export interface StorageProvider {
  readonly id: string;
  list(relativePath?: string): Promise<StorageEntry[]>;
  readFile(sourceId: string): Promise<Buffer>;
}
