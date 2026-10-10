import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { getActiveLearningSpaceSource, getLearningSpace, persistIndex } from "./repositories";
import { synchronizeSource } from "./sync";
import { nativeBindingContext, sourceAssetBindingFixture, sourceBindingFixture } from "@/test/source-binding-fixture";
import { sourceChildState } from "@/test/source-child-reconciliation-scenarios";
import { rollbackStages, verifyReconciliationLifecycle, verifyReconciliationRollback, verifyReconciliationScopeIsolation } from "@/test/source-reconciliation-hardening-scenarios";
import type { StorageProvider } from "./storage/provider";

let directory: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks(); resetDatabaseForTests(); delete process.env.PORTFOLIO_DATABASE_PATH;
  if (directory) {
    try { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error; }
  }
  directory = undefined;
}, 30_000);

async function setup(providerType = "onedrive") {
  directory = await mkdtemp(path.join(os.tmpdir(), "reconciliation-hardening-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(directory, "metadata.db"); resetDatabaseForTests();
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE learning_space_sources SET provider_type = ? WHERE learning_space_id = 'space-6'", args: [providerType] });
  return { database, source: (await getActiveLearningSpaceSource("space-6"))! };
}

describe("reconciliation conflict and regression hardening", () => {
  it.each(rollbackStages)("fully rolls back real constraint failures after %s", async (stage) => {
    const { database, source } = await setup();
    await verifyReconciliationRollback(database, "space-6", source.id, stage);
  });

  it("returns every archived entity and both asset models with concrete owned metadata and stable repeated publication", async () => {
    const { database, source } = await setup();
    await verifyReconciliationLifecycle(database, "space-6", source.id);
  });

  it("isolates raw IDs across configured sources, OneDrive drives/roots and Google mirror providers/accounts/roots", async () => {
    const { database, source } = await setup();
    await verifyReconciliationScopeIsolation(database, "space-6", source.id);
  });

  it.each(["local", "legacy"])("blocks duplicate portfolio claims in %s scans before the writebatch", async (kind) => {
    const { database, source } = await setup(kind === "local" ? "local" : "onedrive");
    const indexed = sourceBindingFixture("91", { providerType: "local", providerNamespace: "root", identityKind: "path" });
    if (kind === "legacy") delete indexed.sourceIdentityContext;
    await persistIndex([indexed], source.providerType, "space-6", { sourceId: source.id });
    const before = await sourceChildState(database, "space-6"); const batch = vi.spyOn(database, "batch");
    await expect(persistIndex([indexed, structuredClone(indexed)], source.providerType, "space-6", { sourceId: source.id })).rejects.toThrow("dezelfde code");
    expect(batch).not.toHaveBeenCalled(); expect(await sourceChildState(database, "space-6")).toEqual(before);
  });

  it("blocks normalized section aliases before any writes", async () => {
    const { database, source } = await setup(); const indexed = sourceBindingFixture();
    await persistIndex([indexed], "onedrive", "space-6", { sourceId: source.id });
    indexed.sections.push({ ...indexed.sections[0], code: "01.01", sourceId: "other-section", exercises: [] });
    const before = await sourceChildState(database, "space-6"); const batch = vi.spyOn(database, "batch");
    await expect(persistIndex([indexed], "onedrive", "space-6", { sourceId: source.id })).rejects.toThrow("dezelfde code");
    expect(batch).not.toHaveBeenCalled(); expect(await sourceChildState(database, "space-6")).toEqual(before);
  });

  it.each(["portfolio", "section"])("retains the published hierarchy when the real indexer rejects duplicate %s codes", async (kind) => {
    const { database, source } = await setup();
    await persistIndex([sourceAssetBindingFixture()], "onedrive", "space-6", { sourceId: source.id });
    const before = await sourceChildState(database, "space-6");
    const provider: StorageProvider = {
      id: "onedrive", identityContext: nativeBindingContext,
      async list(relativePath = "") {
        const names = !relativePath ? kind === "portfolio" ? ["Portfolio 91 Eerste", "Portfolio 91 Tweede"] : ["Portfolio 91 Eerste"]
          : ["1.1 Eerste", "01.01 Tweede"];
        return names.map((name) => ({ name, relativePath: `${relativePath ? `${relativePath}/` : ""}${name}`, kind: "directory", sourceId: name }));
      },
      readFile: async () => Buffer.alloc(0),
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(synchronizeSource("space-6", { getConfiguredProvider: async () => ({ type: "onedrive", source, provider, space: (await getLearningSpace("space-6"))! }) }))
      .rejects.toThrow(/Dubbele (portfolio|onderdeel)code/);
    const after = await sourceChildState(database, "space-6");
    // Failure audit/validation are intentionally stored; the last successful publication is intact.
    for (const index of [0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15]) expect(after[index]).toEqual(before[index]);
    expect(after[5]).toContainEqual(expect.objectContaining({ status: "failed" }));
    expect(after[6]).toContainEqual(expect.objectContaining({ last_validation_status: "invalid" }));
    expect((await database.execute("SELECT * FROM sync_leases")).rows).toEqual([]);
  });

  it("keeps LocalFS logical code reuse without inferring continuity from a reused path", async () => {
    const { database, source } = await setup("local");
    const context = { providerType: "local", providerNamespace: "local-root", identityKind: "path" } as const;
    const indexed = sourceBindingFixture("91", context);
    await persistIndex([indexed], "local", "space-6", { sourceId: source.id });
    const old = (await database.execute("SELECT * FROM portfolios")).rows[0];
    await database.execute({ sql: "UPDATE portfolios SET title_override = 'Logische titel' WHERE id = ?", args: [String(old.id)] });
    await persistIndex([], "local", "space-6", { sourceId: source.id });
    indexed.sourceId = "recreated-path"; indexed.relativePath = "Andere map/Portfolio 91";
    await persistIndex([indexed], "local", "space-6", { sourceId: source.id });
    expect((await database.execute({ sql: "SELECT * FROM portfolios WHERE id = ?", args: [String(old.id)] })).rows[0]).toMatchObject({ title_override: "Logische titel", is_indexed: 1 });
    indexed.code = "92"; indexed.sections = [];
    const beforeConflict = await sourceChildState(database, "space-6");
    await expect(persistIndex([indexed], "local", "space-6", { sourceId: source.id })).rejects.toThrow("bronidentiteit");
    expect(await sourceChildState(database, "space-6")).toEqual(beforeConflict);
    indexed.sourceId = "new-path-for-new-code"; indexed.relativePath = "Portfolio 92 Nieuw";
    await persistIndex([indexed], "local", "space-6", { sourceId: source.id });
    const current = (await database.execute("SELECT * FROM portfolios WHERE portfolio_code = '92'")).rows[0];
    expect(current.id).not.toBe(old.id); expect(current.title_override).toBeNull();
  });
});
