import { promises as fs } from "node:fs";
import path from "node:path";

import type { StorageEntry, StorageProvider } from "@/lib/storage/provider";

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
