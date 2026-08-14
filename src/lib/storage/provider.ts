export interface StorageEntry {
  name: string;
  relativePath: string;
  sourceId?: string;
  kind: "file" | "directory";
  lastModifiedAt?: string;
  sourceVersion?: string;
}

export type ByteRangeRequest =
  | { kind: "offset"; start: number; end?: number }
  | { kind: "suffix"; length: number };

export interface OpenFileOptions {
  range?: ByteRangeRequest;
  headOnly?: boolean;
  signal?: AbortSignal;
}

export interface OpenedFile {
  body: ReadableStream<Uint8Array> | null;
  contentLength: number;
  totalLength: number;
  contentType?: string;
  contentRange?: string;
  etag?: string;
  lastModified?: string;
  acceptRanges: boolean;
}

export interface StorageProvider {
  readonly id: string;
  list(relativePath?: string): Promise<StorageEntry[]>;
  openFile?(sourceId: string, options?: OpenFileOptions): Promise<OpenedFile>;
  readFile(sourceId: string): Promise<Buffer>;
}
