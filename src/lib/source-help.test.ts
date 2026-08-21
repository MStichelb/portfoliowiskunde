import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("source setup help", () => {
  it("covers the supported source workflow without embedding secrets", async () => {
    const help = await readFile(path.join(process.cwd(), "docs", "BRONNEN-INSTELLEN.md"), "utf8");
    for (const subject of ["Primaire bron", "Mirror", "OneDrive", "drive-ID", "map-ID", "service account", "_mirror-complete.json", "Bronnen vergelijken", "lage overlap", "read-only", "rclone"]) {
      expect(help.toLowerCase()).toContain(subject.toLowerCase());
    }
    expect(help).not.toMatch(/ADMIN_PASSWORD|BEGIN PRIVATE KEY|client_secret/i);
  });
});
