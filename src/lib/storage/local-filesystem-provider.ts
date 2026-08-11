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

    return entries
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map((entry) => ({
        name: entry.name,
        relativePath: this.toRelative(path.join(relativePath, entry.name)),
        kind: entry.isDirectory() ? ("directory" as const) : ("file" as const),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }

  async readFile(relativePath: string): Promise<Buffer> {
    return fs.readFile(this.resolve(relativePath));
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
