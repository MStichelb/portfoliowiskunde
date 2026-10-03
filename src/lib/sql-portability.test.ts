import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PORTABILITY_GUARDS = [
  { name: "GLOB", pattern: /\bGLOB\b/i },
  { name: "PRAGMA", pattern: /\bPRAGMA\b/i },
  { name: "AUTOINCREMENT", pattern: /\bAUTOINCREMENT\b/i },
  { name: "INSERT OR", pattern: /\bINSERT\s+OR\s+(?:IGNORE|REPLACE|ABORT|FAIL|ROLLBACK)\b/i },
  { name: "WITHOUT ROWID", pattern: /\bWITHOUT\s+ROWID\b/i },
  { name: "COLLATE NOCASE", pattern: /\bCOLLATE\s+NOCASE\b/i },
  { name: "SQLite date/time function", pattern: /\b(?:strftime|julianday|unixepoch)\s*\(/i },
  { name: "SQLite-only function", pattern: /\b(?:last_insert_rowid|randomblob|group_concat)\s*\(/i },
  { name: "untyped nullable parameter", pattern: /\?\s+IS\s+(?:NOT\s+)?NULL/i },
  { name: "parameter-to-parameter comparison", pattern: /\?\s*(?:=|<>|!=)\s*\?/i },
  { name: "untyped nullable COALESCE parameter", pattern: /COALESCE\s*\(\s*\?\s*,\s*''\s*\)/i },
] as const;

describe("shared runtime SQL portability", () => {
  it("contains no known SQLite-only syntax or PostgreSQL-unsafe untyped parameter patterns", async () => {
    const sourceRoot = path.join(process.cwd(), "src", "lib");
    const files = (await productionTypeScriptFiles(sourceRoot)).sort();
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const { name, pattern } of PORTABILITY_GUARDS) {
        if (pattern.test(source)) violations.push(`${path.relative(process.cwd(), file)}: ${name}`);
      }
    }

    expect(violations).toEqual([]);
  });
});

async function productionTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(entryPath);
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) return [];
    return [entryPath];
  }));
  return nested.flat();
}
