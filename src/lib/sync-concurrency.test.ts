import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import type { IndexedPortfolio } from "./domain";
import {
  getActiveLearningSpaceSource,
  getAdminPortfolios,
  getLearningSpace,
  getLearningSpaceSource,
  persistIndex,
  releaseSyncLease,
  tryAcquireSyncLease,
  type LearningSpaceSource,
} from "./repositories";
import type { StorageProvider } from "./storage/provider";
import { synchronizeSource } from "./sync";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("synchronization ownership fencing", () => {
  it("keeps a newer lease and index when an expired worker tries to publish and release", async () => {
    await setupDatabase();
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    await persistIndex([indexFixture("Bestaande index")], "local", "space-6", { sourceId: source.id });

    const firstIndex = deferred<IndexedPortfolio[]>();
    const firstStarted = deferred<void>();
    const firstRun = synchronizeSource("space-6", syncDependencies(source, async () => {
      firstStarted.resolve();
      return firstIndex.promise;
    }));
    await firstStarted.promise;

    const database = await getDatabase();
    const firstOwner = String((await database.execute("SELECT owner_id FROM sync_leases WHERE learning_space_id = 'space-6'")).rows[0].owner_id);
    let blockedProviderCalls = 0;
    await expect(synchronizeSource("space-6", {
      ...syncDependencies(source, async () => [indexFixture("Niet gebruikt")]),
      getConfiguredProvider: async () => {
        blockedProviderCalls += 1;
        return configuredProvider(source);
      },
    })).resolves.toMatchObject({ skipped: true });
    expect(blockedProviderCalls).toBe(0);

    await database.execute("UPDATE sync_leases SET acquired_until = '2000-01-01T00:00:00.000Z' WHERE learning_space_id = 'space-6'");
    const secondIndex = deferred<IndexedPortfolio[]>();
    const secondStarted = deferred<void>();
    const secondRun = synchronizeSource("space-6", syncDependencies(source, async () => {
      secondStarted.resolve();
      return secondIndex.promise;
    }));
    await secondStarted.promise;
    const secondOwner = String((await database.execute("SELECT owner_id FROM sync_leases WHERE learning_space_id = 'space-6'")).rows[0].owner_id);
    expect(secondOwner).not.toBe(firstOwner);

    firstIndex.resolve([indexFixture("Verouderde index")]);
    await expect(firstRun).resolves.toMatchObject({ skipped: true, skipReason: "stale" });
    expect((await database.execute("SELECT owner_id FROM sync_leases WHERE learning_space_id = 'space-6'")).rows[0].owner_id).toBe(secondOwner);
    expect((await getAdminPortfolios("space-6")).find((portfolio) => portfolio.code === "88")?.title).toBe("Bestaande index");

    secondIndex.resolve([indexFixture("Nieuwste index")]);
    await expect(secondRun).resolves.toMatchObject({ skipped: false });
    expect((await getAdminPortfolios("space-6")).find((portfolio) => portfolio.code === "88")?.title).toBe("Nieuwste index");
  });

  it("resolves the source only after lease acquisition", async () => {
    await setupDatabase();
    const originalSource = (await getActiveLearningSpaceSource("space-6"))!;
    const replacement = await insertMirrorSource("space-6");
    const acquisitionStarted = deferred<void>();
    const continueAcquisition = deferred<void>();
    let resolvedSourceId: string | null = null;

    const run = synchronizeSource("space-6", {
      acquireLease: async (learningSpaceId, ownerId, now, leaseSeconds) => {
        acquisitionStarted.resolve();
        await continueAcquisition.promise;
        return tryAcquireSyncLease(learningSpaceId, ownerId, now, leaseSeconds);
      },
      releaseLease: releaseSyncLease,
      getConfiguredProvider: async () => {
        const activeSource = (await getActiveLearningSpaceSource("space-6"))!;
        resolvedSourceId = activeSource.id;
        return configuredProvider(activeSource);
      },
      index: async () => [indexFixture("Nieuwe bron")],
    });

    await acquisitionStarted.promise;
    await activateSource(originalSource.id, replacement.id);
    continueAcquisition.resolve();

    await expect(run).resolves.toMatchObject({ skipped: false });
    expect(resolvedSourceId).toBe(replacement.id);
  });

  it("rejects an old source snapshot changed between resolve and persistence without touching the index", async () => {
    await setupDatabase();
    const originalSource = (await getActiveLearningSpaceSource("space-6"))!;
    const replacement = await insertMirrorSource("space-6");
    await persistIndex([indexFixture("Bestaande index")], "local", "space-6", { sourceId: originalSource.id });
    const pendingIndex = deferred<IndexedPortfolio[]>();
    const indexingStarted = deferred<void>();
    const run = synchronizeSource("space-6", syncDependencies(originalSource, async () => {
      indexingStarted.resolve();
      return pendingIndex.promise;
    }));

    await indexingStarted.promise;
    await activateSource(originalSource.id, replacement.id);
    pendingIndex.resolve([indexFixture("Verouderde bron")]);

    await expect(run).resolves.toMatchObject({ skipped: true, skipReason: "stale" });
    expect((await getAdminPortfolios("space-6")).find((portfolio) => portfolio.code === "88")?.title).toBe("Bestaande index");
  });

  it("rejects a changed source-profile snapshot without touching the index", async () => {
    await setupDatabase();
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    await persistIndex([indexFixture("Bestaande index")], "local", "space-6", { sourceId: source.id });
    const pendingIndex = deferred<IndexedPortfolio[]>();
    const indexingStarted = deferred<void>();
    const run = synchronizeSource("space-6", syncDependencies(source, async () => {
      indexingStarted.resolve();
      return pendingIndex.promise;
    }));

    await indexingStarted.promise;
    const database = await getDatabase();
    const profile = (await database.execute(`SELECT source_profiles.id, source_profiles.config_json FROM source_profiles
      INNER JOIN learning_space_source_profiles ON learning_space_source_profiles.source_profile_id = source_profiles.id
      WHERE learning_space_source_profiles.learning_space_id = 'space-6'`)).rows[0];
    const config = JSON.parse(String(profile.config_json));
    config.scanner.portfolio.marker = "Bundel";
    await database.execute({
      sql: "UPDATE source_profiles SET config_json = ?, updated_at = ? WHERE id = ?",
      args: [JSON.stringify(config), new Date(Date.now() + 1_000).toISOString(), String(profile.id)],
    });
    pendingIndex.resolve([indexFixture("Verouderd profiel")]);

    await expect(run).resolves.toMatchObject({ skipped: true, skipReason: "stale" });
    expect((await getAdminPortfolios("space-6")).find((portfolio) => portfolio.code === "88")?.title).toBe("Bestaande index");
  });

  it("keeps a normal synchronization idempotent", async () => {
    await setupDatabase();
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    const dependencies = syncDependencies(source, async () => [indexFixture("Idempotente index")]);

    await expect(synchronizeSource("space-6", dependencies)).resolves.toMatchObject({ skipped: false, missing: 0 });
    await expect(synchronizeSource("space-6", dependencies)).resolves.toMatchObject({ skipped: false, added: 0, missing: 0 });
    expect((await getAdminPortfolios("space-6")).filter((portfolio) => portfolio.code === "88")).toHaveLength(1);
  });
});

function syncDependencies(source: LearningSpaceSource, index: () => Promise<IndexedPortfolio[]>) {
  return {
    getConfiguredProvider: async () => configuredProvider(source),
    index: async () => index(),
  };
}

async function configuredProvider(source: LearningSpaceSource) {
  return {
    provider: emptyProvider(),
    type: source.providerType,
    space: (await getLearningSpace(source.learningSpaceId))!,
    source,
  };
}

function emptyProvider(): StorageProvider {
  return {
    id: "sync-concurrency-provider",
    async list() { return []; },
    async readFile() { return Buffer.from(""); },
  };
}

function indexFixture(title: string): IndexedPortfolio {
  return {
    code: "88",
    title,
    relativePath: "Portfolio 88 Test",
    assignmentPdfPath: null,
    assignmentPdfSourceId: null,
    hintsDocumentPath: null,
    hintsDocumentSourceId: null,
    finalSolutionsPdfPath: null,
    finalSolutionsPdfSourceId: null,
    resourceAssets: [],
    sections: [{
      code: "1",
      sortOrder: 1,
      title: "Onderdeel",
      relativePath: "Portfolio 88 Test/1 Onderdeel",
      exercises: [{ code: "1", number: 1, suffix: "", levelSource: null, assets: [] }],
    }],
    warnings: [],
  };
}

async function setupDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-sync-concurrency-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await getDatabase();
}

async function insertMirrorSource(learningSpaceId: string): Promise<LearningSpaceSource> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const id = `${learningSpaceId}:h2-mirror`;
  await database.execute({
    sql: `INSERT INTO learning_space_sources
      (id, learning_space_id, role, provider_type, is_active, local_source_path, created_at, updated_at)
      VALUES (?, ?, 'mirror', 'local', 0, 'test-source', ?, ?)`,
    args: [id, learningSpaceId, now, now],
  });
  return (await getLearningSpaceSource(id))!;
}

async function activateSource(previousSourceId: string, nextSourceId: string): Promise<void> {
  const now = new Date().toISOString();
  await (await getDatabase()).batch([
    { sql: "UPDATE learning_space_sources SET is_active = 0, updated_at = ? WHERE id = ?", args: [now, previousSourceId] },
    { sql: "UPDATE learning_space_sources SET is_active = 1, updated_at = ? WHERE id = ?", args: [now, nextSourceId] },
  ]);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
      if (attempt === 9) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
