import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import {
  detectLearningSpaceHeader,
  getLearningSpaceHeaderAsset,
} from "./learning-space-header";
import { getLearningSpace } from "./repositories";
import type { StorageEntry, StorageProvider } from "./storage/provider";
import { synchronizeSource } from "./sync";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("LearningSpace header recognition", () => {
  it("returns no custom header when the root has no recognized header", async () => {
    await expect(detectLearningSpaceHeader(provider([
      file("banner.png"),
      file("header.jpeg"),
      file("header.webp"),
    ]))).resolves.toBeNull();
  });

  it("recognizes root PNG and JPG names case-insensitively", async () => {
    await expect(detectLearningSpaceHeader(provider([file("HEADER.PNG", "opaque-png")]))).resolves.toMatchObject({
      sourceId: "opaque-png", fileName: "HEADER.PNG", extension: "png",
    });
    await expect(detectLearningSpaceHeader(provider([file("Header.JpG", "opaque-jpg")]))).resolves.toMatchObject({
      sourceId: "opaque-jpg", fileName: "Header.JpG", extension: "jpg",
    });
  });

  it("deterministically prefers PNG when both supported files exist", async () => {
    await expect(detectLearningSpaceHeader(provider([
      file("header.jpg", "jpg-id"),
      file("header.png", "png-id"),
    ]))).resolves.toMatchObject({ sourceId: "png-id", extension: "png" });
  });

  it("ignores matching files below the source root", async () => {
    await expect(detectLearningSpaceHeader(provider([
      file("header.png", "nested-id", "afbeeldingen/header.png"),
    ]))).resolves.toBeNull();
  });
});

describe("LearningSpace header synchronization", () => {
  it("activates and replaces the primary-source header only after successful sync", async () => {
    const configured = await setupDatabase();
    await sync(configured, [file("header.png", "header-v1", "header.png", "v1")]);
    const first = await getLearningSpaceHeaderAsset(configured.space.id);
    expect(first).toMatchObject({
      learningSpaceSourceId: configured.source.id,
      sourceId: "header-v1",
      sourceVersion: "v1",
      extension: "png",
    });

    await sync(configured, [file("header.jpg", "header-v2", "header.jpg", "v2")]);
    expect(await getLearningSpaceHeaderAsset(configured.space.id)).toMatchObject({
      id: first?.id,
      learningSpaceSourceId: configured.source.id,
      sourceId: "header-v2",
      sourceVersion: "v2",
      extension: "jpg",
    });
  });

  it("falls back to the default after a successful sync without a header", async () => {
    const configured = await setupDatabase();
    await sync(configured, [file("header.png", "header-v1")]);
    expect(await getLearningSpaceHeaderAsset(configured.space.id)).not.toBeNull();

    await sync(configured, []);
    expect(await getLearningSpaceHeaderAsset(configured.space.id)).toBeNull();
  });

  it("keeps the last valid header when detection makes synchronization fail", async () => {
    const configured = await setupDatabase();
    await sync(configured, [file("header.png", "header-valid", "header.png", "valid-version")]);
    const before = await getLearningSpaceHeaderAsset(configured.space.id);
    const failingProvider = provider([]);
    vi.mocked(failingProvider.list).mockRejectedValue(new Error("provider tijdelijk niet bereikbaar"));

    await expect(synchronizeSource(configured.space.id, {
      getConfiguredProvider: async () => ({ ...configured, provider: failingProvider }),
      index: async () => [],
    })).rejects.toThrow("provider tijdelijk niet bereikbaar");

    expect(await getLearningSpaceHeaderAsset(configured.space.id)).toEqual(before);
  });
});

async function setupDatabase() {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-learning-space-header-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await getDatabase();
  const space = (await getLearningSpace("space-5"))!;
  const source = space.primarySource!;
  return { space, source, type: source.providerType };
}

async function sync(
  configured: Awaited<ReturnType<typeof setupDatabase>>,
  entries: StorageEntry[],
) {
  return synchronizeSource(configured.space.id, {
    getConfiguredProvider: async () => ({ ...configured, provider: provider(entries) }),
    index: async () => [],
  });
}

function provider(entries: StorageEntry[]): StorageProvider {
  return {
    id: "header-test-provider",
    list: vi.fn(async () => entries),
    readFile: vi.fn(async () => Buffer.from("")),
  };
}

function file(name: string, sourceId = name, relativePath = name, sourceVersion?: string): StorageEntry {
  return { name, relativePath, sourceId, sourceVersion, kind: "file" };
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
