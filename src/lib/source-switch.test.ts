import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import {
  BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
  BUILT_IN_DEFAULT_SOURCE_PROFILE_ID,
  parseSourceProfileConfig,
  type SourceProfileConfig,
} from "./source-profile-config";
import { getActiveSourceProfileForLearningSpace } from "./source-profiles";
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
import { synchronizeSource } from "./sync";

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
  it("uses the same active custom profile for synchronization, comparison and switching", async () => {
    await setupDatabase();
    const { primary, mirror } = await configureDualSource();
    const customConfig = await configureCustomExerciseHintProfile();
    const indexedConfigs: SourceProfileConfig[] = [];
    const captureIndex: typeof indexSource = async (provider, config) => {
      if (!config) throw new Error("De actieve bronprofielconfiguratie ontbreekt.");
      indexedConfigs.push(config);
      return indexSource(provider, config);
    };
    const primaryProvider = portfolioProvider("primary-custom", { exerciseFileName: "PF1-Oef1-hint.png" });
    const space = (await getLearningSpace("space-5"))!;

    await expect(synchronizeSource("space-5", {
      getConfiguredProvider: async () => ({ provider: primaryProvider, type: "onedrive", space, source: primary }),
      index: captureIndex,
    })).resolves.toMatchObject({ portfolios: 1, skipped: false });

    const database = await getDatabase();
    expect((await database.execute("SELECT resource_id, source_id FROM source_resource_assets WHERE learning_space_id = 'space-5' AND is_indexed = 1")).rows)
      .toEqual(expect.arrayContaining([expect.objectContaining({ resource_id: "exercise-hint", source_id: "primary-custom:PF1-Oef1-hint.png" })]));
    expect(Number((await database.execute(`SELECT COUNT(*) AS count FROM solution_assets WHERE variant_id IN (
      SELECT solution_variants.id FROM solution_variants WHERE solution_variants.exercise_id IN (
      SELECT exercises.id FROM exercises INNER JOIN portfolios ON portfolios.id = exercises.portfolio_id WHERE portfolios.learning_space_id = 'space-5'
    ))`)).rows[0].count)).toBe(0);

    const targetDependencies = {
      ...providerDependencies(portfolioProvider("mirror-custom", { exerciseFileName: "PF1-Oef1-hint.png" }), "2026-09-25T08:00:00.000Z"),
      index: captureIndex,
    };
    const preview = await compareLearningSpaceSources("space-5", mirror.id, targetDependencies);
    expect(preview.comparison).toMatchObject({ hasDifferences: false, matchedFiles: 3 });
    expect((await getActiveLearningSpaceSource("space-5"))?.id).toBe(primary.id);

    const switched = await switchLearningSpaceSource("space-5", mirror.id, true, targetDependencies);
    expect(switched).toMatchObject({ switched: true, confirmationRequired: false });
    expect((await getActiveLearningSpaceSource("space-5"))?.id).toBe(mirror.id);
    expect((await database.execute("SELECT resource_id, source_id FROM source_resource_assets WHERE learning_space_id = 'space-5' AND is_indexed = 1")).rows)
      .toEqual(expect.arrayContaining([expect.objectContaining({ resource_id: "exercise-hint", source_id: "mirror-custom:PF1-Oef1-hint.png" })]));
    expect(indexedConfigs).toHaveLength(3);
    expect(indexedConfigs).toEqual([customConfig, customConfig, customConfig]);
    expect(customConfig).not.toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
  });

  it("keeps the default profile behavior identical for synchronization, comparison and switching", async () => {
    await setupDatabase();
    const { primary, mirror } = await configureDualSource();
    const activeProfile = await getActiveSourceProfileForLearningSpace("space-5");
    expect(activeProfile?.config).toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    const indexedConfigs: SourceProfileConfig[] = [];
    const captureIndex: typeof indexSource = async (provider, config) => {
      if (!config) throw new Error("De actieve bronprofielconfiguratie ontbreekt.");
      indexedConfigs.push(config);
      return indexSource(provider, config);
    };
    const space = (await getLearningSpace("space-5"))!;
    await synchronizeSource("space-5", {
      getConfiguredProvider: async () => ({ provider: portfolioProvider("primary-default"), type: "onedrive", space, source: primary }),
      index: captureIndex,
    });
    const dependencies = { ...providerDependencies(portfolioProvider("mirror-default")), index: captureIndex };
    await compareLearningSpaceSources("space-5", mirror.id, dependencies);
    await switchLearningSpaceSource("space-5", mirror.id, true, dependencies);

    expect(indexedConfigs).toEqual([
      BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
      BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
      BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
    ]);
    expect(Number((await (await getDatabase()).execute(`SELECT COUNT(*) AS count FROM solution_assets WHERE variant_id IN (
      SELECT solution_variants.id FROM solution_variants WHERE solution_variants.exercise_id IN (
      SELECT exercises.id FROM exercises INNER JOIN portfolios ON portfolios.id = exercises.portfolio_id WHERE portfolios.learning_space_id = 'space-5'
    )) AND is_indexed = 1`)).rows[0].count)).toBe(1);
  });

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

  it("switches safely when two sources expose the same provider source IDs and paths", async () => {
    await setupDatabase();
    const { primary, mirror } = await configureDualSource();
    const sharedIdentity = { sourceIdPrefix: "shared-provider-id", sourceVersion: "primary-v1" };
    await persistIndex(await indexSource(portfolioProvider("primary-collision", sharedIdentity)), "onedrive", "space-5", { sourceId: primary.id });

    const database = await getDatabase();
    const before = (await database.execute(`SELECT id, source_id, relative_path, source_version, is_indexed, missing_since
      FROM source_resource_assets WHERE learning_space_id = 'space-5' AND resource_scope = 'exercise' ORDER BY id`)).rows;
    expect(before).toHaveLength(1);
    const assetId = String(before[0].id);
    expect(before[0]).toMatchObject({
      source_id: "shared-provider-id:PF1-Oef1.png",
      source_version: "primary-v1",
      is_indexed: 1,
      missing_since: null,
    });

    const switched = await switchLearningSpaceSource("space-5", mirror.id, true, providerDependencies(portfolioProvider("mirror-collision", {
      sourceIdPrefix: "shared-provider-id",
      sourceVersion: "mirror-v1",
    }), "2026-08-21T13:39:00.000Z"));
    expect(switched.switched).toBe(true);
    expect((await getActiveLearningSpaceSource("space-5"))?.id).toBe(mirror.id);

    const afterMirror = (await database.execute(`SELECT id, source_id, relative_path, source_version, is_indexed, missing_since
      FROM source_resource_assets WHERE learning_space_id = 'space-5' AND resource_scope = 'exercise' ORDER BY id`)).rows;
    expect(afterMirror).toHaveLength(1);
    expect(afterMirror[0]).toMatchObject({
      id: assetId,
      source_id: "shared-provider-id:PF1-Oef1.png",
      source_version: "mirror-v1",
      is_indexed: 1,
      missing_since: null,
    });

    const switchedBack = await switchLearningSpaceSource("space-5", primary.id, true, providerDependencies(portfolioProvider("primary-return-collision", {
      sourceIdPrefix: "shared-provider-id",
      sourceVersion: "primary-v2",
    })));
    expect(switchedBack.switched).toBe(true);
    expect((await getActiveLearningSpaceSource("space-5"))?.id).toBe(primary.id);

    const afterPrimary = (await database.execute(`SELECT id, source_id, relative_path, source_version, is_indexed, missing_since
      FROM source_resource_assets WHERE learning_space_id = 'space-5' AND resource_scope = 'exercise' ORDER BY id`)).rows;
    expect(afterPrimary).toHaveLength(1);
    expect(afterPrimary[0]).toMatchObject({
      id: assetId,
      source_id: "shared-provider-id:PF1-Oef1.png",
      source_version: "primary-v2",
      is_indexed: 1,
      missing_since: null,
    });
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
    await addPublicationMetadata();
    const before = await indexedState();
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
    expect(await indexedState()).toEqual(before);
    expect((await getLearningSpaceSource(mirror.id))?.lastValidationStatus).toBe("invalid");
  });

  it("keeps the active source, valid index and metadata when target indexing fails", async () => {
    await setupDatabase();
    const { primary, mirror } = await configureDualSource();
    await persistIndex(await indexSource(portfolioProvider("primary")), "onedrive", "space-5", { sourceId: primary.id });
    await addPublicationMetadata();
    const before = await indexedState();

    await expect(switchLearningSpaceSource("space-5", mirror.id, true, {
      ...providerDependencies(portfolioProvider("mirror")),
      index: async () => { throw new Error("forced target indexing failure"); },
    })).rejects.toThrow("forced target indexing failure");

    expect(await indexedState()).toEqual(before);
    expect((await getLearningSpaceSource(mirror.id))?.lastValidationStatus).toBe("invalid");
  });

  it("rejects an invalid active profile without changing the active source, index or metadata", async () => {
    await setupDatabase();
    const { primary, mirror } = await configureDualSource();
    await persistIndex(await indexSource(portfolioProvider("primary")), "onedrive", "space-5", { sourceId: primary.id });
    await addPublicationMetadata();
    const before = await indexedState();
    const database = await getDatabase();
    const profile = await getActiveSourceProfileForLearningSpace("space-5");
    await database.execute({
      sql: "UPDATE source_profiles SET config_json = ?, updated_at = ? WHERE id = ?",
      args: [JSON.stringify({ configVersion: 1 }), "2026-09-25T08:30:00.000Z", profile!.id],
    });
    let indexStarted = false;

    await expect(switchLearningSpaceSource("space-5", mirror.id, true, {
      ...providerDependencies(portfolioProvider("mirror")),
      index: async () => { indexStarted = true; return []; },
    })).rejects.toThrow();

    expect(indexStarted).toBe(false);
    expect(await indexedState()).toEqual(before);
    expect((await getLearningSpaceSource(mirror.id))?.lastValidationStatus).toBe("invalid");
  });

  it("rolls back index changes when activating the validated target fails", async () => {
    await setupDatabase();
    const { primary, mirror } = await configureDualSource();
    await persistIndex(await indexSource(portfolioProvider("primary")), "onedrive", "space-5", { sourceId: primary.id });
    await addPublicationMetadata();
    const indexedBefore = await indexedState();
    const database = await getDatabase();
    const before = await database.execute("SELECT id, source_id FROM solution_assets ORDER BY id");
    await database.execute(`CREATE TRIGGER fail_source_activation BEFORE UPDATE OF is_active ON learning_space_sources
      WHEN NEW.id = 'space-5:mirror' AND NEW.is_active = 1 BEGIN SELECT RAISE(ABORT, 'forced activation failure'); END`);

    await expect(switchLearningSpaceSource("space-5", mirror.id, true, providerDependencies(portfolioProvider("mirror"), "2026-08-21T13:39:00.000Z"))).rejects.toThrow();
    expect((await getActiveLearningSpaceSource("space-5"))?.id).toBe(primary.id);
    expect((await database.execute("SELECT id, source_id FROM solution_assets ORDER BY id")).rows).toEqual(before.rows);
    expect(await indexedState()).toEqual(indexedBefore);
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
    primarySource: {
      providerType: "onedrive", storageConnectionId: "connection-onedrive-user-legacy-superadmin",
      oneDriveDriveId: "drive-primary", oneDriveFolderId: "folder-primary", oneDriveFolderPath: "Portfolio/5",
    },
    mirrorSource: { providerType: "google_drive", googleDriveFolderId: "google-mirror", googleDriveFolderLabel: "Mirror 5" },
  });
  const space = (await getLearningSpace("space-5"))!;
  return { primary: space.primarySource!, mirror: space.mirrorSource! };
}

async function configureCustomExerciseHintProfile(): Promise<SourceProfileConfig> {
  const activeProfile = await getActiveSourceProfileForLearningSpace("space-5");
  if (!activeProfile || activeProfile.type !== "custom" || activeProfile.id === BUILT_IN_DEFAULT_SOURCE_PROFILE_ID) {
    throw new Error("De test verwacht een concreet, actief custom bronprofiel.");
  }
  const config = parseSourceProfileConfig({
    ...structuredClone(activeProfile.config),
    exerciseResources: [{
      id: "exercise-hint",
      kind: "source_file",
      label: "Hint per oefening",
      icon: "lightbulb",
      order: 10,
      semanticRole: "hint",
      location: { scope: "alongside_exercise" },
      recognition: {
        file: { target: "after_exercise_number", operator: "starts_with", value: "-hint", caseSensitive: false },
        directory: null,
        fileExtensions: ["png"],
      },
      allowMultiple: true,
      displayMode: "collapsible_each",
    }],
  });
  await (await getDatabase()).execute({
    sql: "UPDATE source_profiles SET config_version = ?, config_json = ?, updated_at = ? WHERE id = ?",
    args: [config.configVersion, JSON.stringify(config), "2026-09-25T08:00:00.000Z", activeProfile.id],
  });
  const validatedProfile = await getActiveSourceProfileForLearningSpace("space-5");
  if (!validatedProfile) throw new Error("Het actieve bronprofiel ontbreekt na configuratie.");
  return validatedProfile.config;
}

async function addPublicationMetadata(): Promise<void> {
  const portfolio = (await getAdminPortfolios("space-5"))[0];
  await setPortfolioPublication(portfolio.id, "visible", true, "2026-09-25T07:00:00.000Z", "2027-06-30T16:00:00.000Z");
  await setExercisePublication([portfolio.sections[0].exercises[0].id], "hidden", null, null);
}

async function indexedState() {
  const database = await getDatabase();
  return {
    activeSourceId: (await getActiveLearningSpaceSource("space-5"))?.id,
    portfolios: (await database.execute(`SELECT id, relative_path, visible, publication_limited, publish_from, publish_until, is_indexed, archived_at
      FROM portfolios WHERE learning_space_id = 'space-5' ORDER BY id`)).rows,
    exercises: (await database.execute(`SELECT exercises.id, exercises.visibility_mode, exercises.publish_from, exercises.publish_until,
      exercises.is_indexed, exercises.archived_at FROM exercises INNER JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE portfolios.learning_space_id = 'space-5' ORDER BY exercises.id`)).rows,
    solutionAssets: (await database.execute(`SELECT solution_assets.id, solution_assets.source_id, solution_assets.relative_path, solution_assets.is_indexed
      FROM solution_assets INNER JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      INNER JOIN exercises ON exercises.id = solution_variants.exercise_id
      INNER JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE portfolios.learning_space_id = 'space-5' ORDER BY solution_assets.id`)).rows,
    resourceAssets: (await database.execute("SELECT id, resource_id, source_id, relative_path, is_indexed FROM source_resource_assets WHERE learning_space_id = 'space-5' ORDER BY id")).rows,
  };
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

function portfolioProvider(
  prefix: string,
  options: { omitExercise?: boolean; sourceIdPrefix?: string; sourceVersion?: string; exerciseFileName?: string } = {},
): StorageProvider {
  const portfolio = "Portfolio 1 - Functies";
  const solutions = `${portfolio}/Uitwerkingen`;
  const section = `${solutions}/1 - Basis`;
  const sourceIdPrefix = options.sourceIdPrefix ?? prefix;
  const sourceVersion = options.sourceVersion ?? `${prefix}-v1`;
  const file = (relativePath: string): StorageEntry => ({
    name: relativePath.split("/").at(-1)!, relativePath,
    sourceId: `${sourceIdPrefix}:${relativePath.split("/").at(-1)}`, kind: "file",
    lastModifiedAt: "2026-08-21T12:00:00.000Z", sourceVersion,
  });
  const directory = (relativePath: string): StorageEntry => ({ name: relativePath.split("/").at(-1)!, relativePath, sourceId: `${sourceIdPrefix}:${relativePath}`, kind: "directory" });
  const tree: Record<string, StorageEntry[]> = {
    "": [directory(portfolio)],
    [portfolio]: [file(`${portfolio}/Portfolio 1 - Functies.pdf`), file(`${portfolio}/Eindoplossingen portfolio 1.pdf`), directory(solutions)],
    [solutions]: [directory(section)],
    [section]: options.omitExercise ? [] : [file(`${section}/${options.exerciseFileName ?? "PF1-Oef1.png"}`)],
  };
  return { id: prefix, async list(relativePath = "") { return tree[relativePath] ?? []; }, async readFile() { return Buffer.from(""); } };
}
