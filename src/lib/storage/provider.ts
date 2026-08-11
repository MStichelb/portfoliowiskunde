export interface StorageEntry {
  name: string;
  relativePath: string;
  kind: "file" | "directory";
}

export interface StorageProvider {
  readonly id: string;
  list(relativePath?: string): Promise<StorageEntry[]>;
  readFile(relativePath: string): Promise<Buffer>;
}
