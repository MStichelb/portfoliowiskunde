import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { resolveByteRange } from "@/lib/byte-range";
import { SourceFileNotFoundError } from "@/lib/source-errors";
import type { OpenFileOptions, OpenedFile, StorageEntry, StorageProvider } from "@/lib/storage/provider";

export class LocalFilesystemProvider implements StorageProvider {
  readonly id = "local-filesystem";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async list(relativePath = ""): Promise<StorageEntry[]> {
    const directory = this.resolve(relativePath);
    const entries = await fs.readdir(directory, { withFileTypes: true });

    const supportedEntries = entries
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map((entry) => ({ entry, relativePath: this.toRelative(path.join(relativePath, entry.name)) }));

    const mapped = await Promise.all(supportedEntries.map(async ({ entry, relativePath: entryPath }) => {
      const metadata = await fs.stat(this.resolve(entryPath));
      return {
        name: entry.name,
        relativePath: entryPath,
        sourceId: entryPath,
        kind: entry.isDirectory() ? ("directory" as const) : ("file" as const),
        lastModifiedAt: metadata.mtime.toISOString(),
        sourceVersion: `${metadata.size}-${metadata.mtimeMs}`,
      };
    }));

    return mapped.sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }

  async readFile(sourceId: string): Promise<Buffer> {
    return fs.readFile(this.resolve(sourceId));
  }

  async openFile(sourceId: string, options: OpenFileOptions = {}): Promise<OpenedFile> {
    const filePath = this.resolve(sourceId);
    const metadata = await fs.stat(filePath);
    if (!metadata.isFile()) throw new SourceFileNotFoundError("Het lokale bronbestand bestaat niet.");
    const range = resolveByteRange(options.range, metadata.size);
    const stream = options.headOnly ? null : createReadStream(filePath, {
      ...(range ? { start: range.start, end: range.end } : {}),
      signal: options.signal,
    });

    return {
      body: stream ? Readable.toWeb(stream) as ReadableStream<Uint8Array> : null,
      contentLength: range?.length ?? metadata.size,
      totalLength: metadata.size,
      contentType: contentTypeForPath(filePath),
      contentRange: range ? `bytes ${range.start}-${range.end}/${metadata.size}` : undefined,
      etag: `"${metadata.size.toString(16)}-${Math.trunc(metadata.mtimeMs).toString(16)}"`,
      lastModified: metadata.mtime.toUTCString(),
      acceptRanges: true,
    };
  }

  private resolve(relativePath: string): string {
    const candidate = path.resolve(this.root, relativePath);
    if (candidate !== this.root && !candidate.startsWith(`${this.root}${path.sep}`)) {
      throw new Error("Bestandspad valt buiten de ingestelde bronmap.");
    }
    return candidate;
  }

  private toRelative(value: string): string {
    return value.split(path.sep).join("/");
  }
}

function contentTypeForPath(filePath: string): string | undefined {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return undefined;
}
