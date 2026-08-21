import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import {
  archiveLearningSpace,
  getActiveLearningSpaceSource,
  getAdminPortfolios,
  getLearningSpace,
  getLearningSpaceSource,
  persistIndex,
  setExercisePublication,
  setPortfolioPublication,
  updateLearningSpace,
} from "./repositories";
import { SourceAccessError } from "./source-errors";
import { sourceManifestFromIndex } from "./source-comparison";
import { compareLearningSpaceSources, switchLearningSpaceSource } from "./source-switch";
import { indexSource } from "./storage/portfolio-indexer";
import type { StorageEntry, StorageProvider } from "./storage/provider";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EBUSY") throw error;
    }
  }
  temporaryDirectory = undefined;
});

describe("manual LearningSpace source switching", () => {
  it("keeps both configurations and logical metadata across mirror and primary switches", async () => {
    await setupDatabase();
    const { primary, mirror } = await configureDualSource();
    await persistIndex(await indexSource(portfolioProvider("primary")), "onedrive", "space-5", { sourceId: primary.id });
    const before = (await getAdminPortfolios("space-5"))[0];
    await setPortfolioPublication(before.id, "visible", false, null, null);
    const exerciseId = before.sections[0].exercises[0].id;
    await setExercisePublication([exerciseId], "hidden", null, null);

    const dependencies = providerDependencies(portfolioProvider("mirror"), "2026-08-21T13:39:00.000Z");
    const preview = await compareLearningSpaceSources("space-5", mirror.id, dependencies);
    expect(preview.comparison).toMatchObject({ hasDifferences: false, matchedFiles: 3 });
    expect(preview.mirrorCompletedAt).toBe("2026-08-21T13:39:00.000Z");

    const switched = await switchLearningSpaceSource("space-5", mirror.id, true, dependencies);
    expect(switched.switched).toBe(true);
    let space = (await getLearningSpace("space-5"))!;
    expect(space).toMatchObject({ sourceType: "google_drive", activeSourceId: mirror.id });
    expect(space.primarySource).toMatchObject({ providerType: "onedrive", oneDriveDriveId: "drive-primary", oneDriveFolderId: "folder-primary", isActive: false });
    expect(space.mirrorSource).toMatchObject({ providerType: "google_drive", googleDriveFolderId: "google-mirror", isActive: true, mirrorCompletedAt: "2026-08-21T13:39:00.000Z" });

    const afterMirror = (await getAdminPortfolios("space-5"))[0];
    expect(afterMirror.id).toBe(before.id);
    expect(afterMirror.sections[0].exercises[0]).toMatchObject({ id: exerciseId, visibilityMode: "hidden" });
    const database = await getDatabase();
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM portfolios WHERE learning_space_id = 'space-5'")).rows[0].count)).toBe(1);
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = 'space-5')")).rows[0].count)).toBe(1);
    expect(String((await database.execute("SELECT source_id FROM solution_assets WHERE relative_path LIKE '%PF1-Oef1.png'")).rows[0].source_id)).toBe("mirror:PF1-Oef1.png");

    const back = await switchLearningSpaceSource("space-5", primary.id, true, providerDependencies(portfolioProvider("primary-return")));
    expect(back.switched).toBe(true);
    space = (await getLearningSpace("space-5"))!;
    expect(space).toMatchObject({ sourceType: "onedrive", activeSourceId: primary.id });
    expect(space.primarySource).toMatchObject({ oneDriveDriveId: "drive-primary", isActive: true });
    expect(space.mirrorSource).toMatchObject({ googleDriveFolderId: "google-mirror", isActive: false });
    expect((await getAdminPortfolios("space-5"))[0].id).toBe(before.id);
  });

  it("requires explicit confirmation for content differences without treating them as a hard error", async () => {
    await setupDatabase();
    const { primary, mirror } = await configureDualSource();
    await persistIndex(await indexSource(portfolioProvider("primary")), "onedrive", "space-5", { sourceId: primary.id });
    const target = portfolioProvider("mirror", { omitExercise: true });
    const firstAttempt = await switchLearningSpaceSource("space-5", mirror.id, false, providerDependencies(target, "2026-08-21T13:39:00.000Z"));
    expect(firstAttempt).toMatchObject({ switched: false, confirmationRequired: true, comparison: { hasDifferences: true } });
    expect((await getActiveLearningSpaceSource("space-5"))?.id).toBe(primary.id);

    const confirmed = await switchLearningSpaceSource("space-5", mirror.id, true, providerDependencies(target, "2026-08-21T13:39:00.000Z"));
    expect(confirmed.switched).toBe(true);
    expect((await getActiveLearningSpaceSource("space-5"))?.id).toBe(mirror.id);
  });

  it("does not report a parser warning shared by the active source and switch target", async () => {
    await setupDatabase();
    const { mirror } = await configureDualSource();
    const warning = { severity: "warning" as const, path: "Portfolio 2A - Rekenen met matrices", message: "Geen eindoplossingen-PDF herkend." };
    const target = await indexSource(portfolioProvider("mirror"));
    target[0].warnings.push(warning);
    const preview = await compareLearningSpaceSources("space-5", mirror.id, {
      ...providerDependencies(portfolioProvider("mirror"), "2026-08-21T13:39:00.000Z"),
      getCurrentManifest: async () => sourceManifestFromIndex(target),
      getCurrentWarnings: async () => [warning],
      index: async () => target,
    });
    expect(preview.comparison).toMatchObject({ currentWarnings: [], targetWarnings: [], differenceCount: 0, hasDifferences: false });
  });

  it("blocks inaccessible and incomplete Google targets while preserving the active index", async () => {
    await setupDatabase();
    const { primary, mirror } = await configureDualSource();
    await persistIndex(await indexSource(portfolioProvider("primary")), "onedrive", "space-5", { sourceId: primary.id });
    const database = await getDatabase();
    const originalAssetId = String((await database.execute("SELECT source_id FROM solution_assets LIMIT 1")).rows[0].source_id);
    let indexStarted = false;
    const inaccessible: StorageProvider = {
      id: "google-drive",
      async assertReadyForIndex() { throw new SourceAccessError("De Google Drive-mirror is momenteel niet volledig. De laatst geldige index blijft actief."); },
      async list() { indexStarted = true; return []; },
      async readFile() { return Buffer.from(""); },
    };
    await expect(switchLearningSpaceSource("space-5", mirror.id, true, providerDependencies(inaccessible))).rejects.toThrow("laatst geldige index blijft actief");
    expect(indexStarted).toBe(false);
    expect((await getActiveLearningSpaceSource("space-5"))?.id).toBe(primary.id);
    expect(String((await database.execute("SELECT source_id FROM solution_assets LIMIT 1")).rows[0].source_id)).toBe(originalAssetId);
    expect((await getLearningSpaceSource(mirror.id))?.lastValidationStatus).toBe("invalid");
  });

  it("rolls back index changes when activating the validated target fails", async () => {
    await setupDatabase();
    const { primary, mirror } = await configureDualSource();
    await persistIndex(await indexSource(portfolioProvider("primary")), "onedrive", "space-5", { sourceId: primary.id });
    const database = await getDatabase();
    const before = await database.execute("SELECT id, source_id FROM solution_assets ORDER BY id");
    await database.execute(`CREATE TRIGGER fail_source_activation BEFORE UPDATE OF is_active ON learning_space_sources
      WHEN NEW.id = 'space-5:mirror' AND NEW.is_active = 1 BEGIN SELECT RAISE(ABORT, 'forced activation failure'); END`);

    await expect(switchLearningSpaceSource("space-5", mirror.id, true, providerDependencies(portfolioProvider("mirror"), "2026-08-21T13:39:00.000Z"))).rejects.toThrow();
    expect((await getActiveLearningSpaceSource("space-5"))?.id).toBe(primary.id);
    expect((await database.execute("SELECT id, source_id FROM solution_assets ORDER BY id")).rows).toEqual(before.rows);
  });

  it("blocks switching for archived LearningSpaces before opening the provider", async () => {
    await setupDatabase();
    const { mirror } = await configureDualSource();
    await archiveLearningSpace("space-5");
    let providerOpened = false;
    await expect(switchLearningSpaceSource("space-5", mirror.id, true, {
      getProvider: async () => { providerOpened = true; throw new Error("mag niet openen"); },
    })).rejects.toThrow("gearchiveerde leeromgeving");
    expect(providerOpened).toBe(false);
  });
});

async function setupDatabase() {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-source-switch-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await getDatabase();
}

async function configureDualSource() {
  await updateLearningSpace("space-5", {
    name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "onedrive",
    primarySource: { providerType: "onedrive", oneDriveDriveId: "drive-primary", oneDriveFolderId: "folder-primary", oneDriveFolderPath: "Portfolio/5" },
    mirrorSource: { providerType: "google_drive", googleDriveFolderId: "google-mirror", googleDriveFolderLabel: "Mirror 5" },
  });
  const space = (await getLearningSpace("space-5"))!;
  return { primary: space.primarySource!, mirror: space.mirrorSource! };
}

function providerDependencies(provider: StorageProvider, mirrorCompletedAt?: string) {
  const readyProvider: StorageProvider = mirrorCompletedAt ? {
    ...provider,
    async assertReadyForIndex() {},
    getReadinessMetadata: () => ({ mirrorCompletedAt }),
  } : provider;
  return {
    getProvider: async (learningSpaceId: string, sourceId: string) => {
      const [space, source] = await Promise.all([getLearningSpace(learningSpaceId), getLearningSpaceSource(sourceId)]);
      return { provider: readyProvider, type: source!.providerType, space: space!, source: source! };
    },
  };
}

function portfolioProvider(prefix: string, options: { omitExercise?: boolean } = {}): StorageProvider {
  const portfolio = "Portfolio 1 - Functies";
  const solutions = `${portfolio}/Uitwerkingen`;
  const section = `${solutions}/1 - Basis`;
  const file = (relativePath: string): StorageEntry => ({
    name: relativePath.split("/").at(-1)!, relativePath,
    sourceId: `${prefix}:${relativePath.split("/").at(-1)}`, kind: "file",
    lastModifiedAt: "2026-08-21T12:00:00.000Z", sourceVersion: `${prefix}-v1`,
  });
  const directory = (relativePath: string): StorageEntry => ({ name: relativePath.split("/").at(-1)!, relativePath, sourceId: `${prefix}:${relativePath}`, kind: "directory" });
  const tree: Record<string, StorageEntry[]> = {
    "": [directory(portfolio)],
    [portfolio]: [file(`${portfolio}/Portfolio 1 - Functies.pdf`), file(`${portfolio}/Eindoplossingen portfolio 1.pdf`), directory(solutions)],
    [solutions]: [directory(section)],
    [section]: options.omitExercise ? [] : [file(`${section}/PF1-Oef1.png`)],
  };
  return { id: prefix, async list(relativePath = "") { return tree[relativePath] ?? []; }, async readFile() { return Buffer.from(""); } };
}
