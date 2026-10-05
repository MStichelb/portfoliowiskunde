import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import type { IndexedPortfolio } from "./domain";
import { createUser } from "./identity";
import { getLastSeenChangelogEntryId, markChangelogSeen } from "./changelog-read-state";
import { getChangelogForRole } from "./changelog";
import {
  createLearningSpaceForOwner,
  getLearningSpace,
  getActiveLearningSpaceSource,
  getLearningSpaceSource,
  getLearningSpaces,
  getSyncPublicationSnapshot,
  getSetting,
  releaseSyncLease,
  setSetting,
  tryAcquireSyncLease,
  updateLearningSpace,
  persistIndex,
  createTheme,
  getThemes,
  getAdminPortfolios,
  getIndexedSourceManifest,
  updateTheme,
  setPortfolioTheme,
  deleteTheme,
} from "./repositories";
import { uniqueSourceProfileName } from "./source-profile-name";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, INITIAL_SOURCE_PROFILE_TEMPLATE_ID } from "./source-profile-config";
import { createSourceProfileTemplate, updateSourceProfileTemplateMetadata } from "./source-profile-templates";
import { createSubject, renameSubject } from "./subjects";

const postgresUrl = process.env.POSTGRES_TEST_DATABASE_URL?.trim();
const describeWithPostgres = postgresUrl ? describe : describe.skip;
let originalDatabaseUrl: string | undefined;
let originalDatabasePath: string | undefined;

describeWithPostgres("PostgreSQL production compatibility", () => {
  beforeAll(() => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    originalDatabasePath = process.env.PORTFOLIO_DATABASE_PATH;
    process.env.DATABASE_URL = postgresUrl;
    delete process.env.PORTFOLIO_DATABASE_PATH;
    resetDatabaseForTests();
  });

  afterAll(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalDatabasePath === undefined) delete process.env.PORTFOLIO_DATABASE_PATH;
    else process.env.PORTFOLIO_DATABASE_PATH = originalDatabasePath;
    resetDatabaseForTests();
  });

  it("applies every migration and exercises representative shared repository queries", async () => {
    const database = await getDatabase();
    const applied = await database.execute("SELECT version FROM schema_migrations ORDER BY version");
    expect(applied.rows.map((row) => String(row.version))).toEqual(migrations.map((migration) => migration.version));

    const suffix = randomUUID();
    const superadmin = await createUser({ displayName: `PostgreSQL ${suffix}`, role: "superadmin" });
    expect(await getLastSeenChangelogEntryId(superadmin.id)).toBeNull();
    await markChangelogSeen(superadmin);
    expect(await getLastSeenChangelogEntryId(superadmin.id)).toBe(getChangelogForRole(superadmin.role)[0]?.id);

    const initialSubject = await createSubject(superadmin, { name: `Initial compat ${suffix}` });
    const subject = await createSubject(superadmin, { name: `Compat ${suffix}` });
    await expect(renameSubject(superadmin, subject.id, ` COMPAT ${suffix.toUpperCase()} `)).resolves.toBeUndefined();

    const template = await createSourceProfileTemplate(superadmin, {
      name: `Compat template ${suffix}`,
      sourceTemplateId: INITIAL_SOURCE_PROFILE_TEMPLATE_ID,
    });
    await expect(updateSourceProfileTemplateMetadata(superadmin, template.id, {
      name: ` COMPAT TEMPLATE ${suffix.toUpperCase()} `,
    })).resolves.toBeUndefined();

    const now = new Date().toISOString();
    const profileId = `postgres-compat-profile-${suffix}`;
    const profileName = `Compat profile ${suffix}`;
    await database.execute({
      sql: `INSERT INTO source_profiles
        (id, type, name, description, config_version, config_json, created_at, updated_at, management_learning_space_id, owner_user_id, archived_at)
        VALUES (?, 'custom', ?, NULL, 1, ?, ?, ?, NULL, ?, NULL)`,
      args: [profileId, profileName, JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG), now, now, superadmin.id],
    });
    await expect(uniqueSourceProfileName(superadmin.id, ` ${profileName.toUpperCase()} `, profileId))
      .resolves.toBe(profileName.toUpperCase());

    const spaceSlug = `postgres-compat-${suffix}`;
    const space = await createLearningSpaceForOwner({
      subjectId: initialSubject.id,
      name: `PostgreSQL compatibility ${suffix}`,
      slug: spaceSlug,
      shortLabel: `PG ${suffix.slice(0, 8)}`,
      sourceType: "local",
      localSourcePath: null,
    }, superadmin.id);
    expect(space.description).toBe("Overzicht van de portfolio's met oefeningen.");
    expect(space).toMatchObject({ themeLabelSingular: "Thema", themeLabelPlural: "Thema's", sectionLabelSingular: "Onderdeel", sectionLabelPlural: "Onderdelen", exerciseLabelShort: "Oef." });
    await updateLearningSpace(space.id, {
      subjectId: subject.id,
      themeLabelSingular: "Deel", themeLabelPlural: "Delen",
      sectionLabelSingular: "Sectie", sectionLabelPlural: "Secties",
      collectionLabelSingular: space.collectionLabelSingular,
      collectionLabelPlural: space.collectionLabelPlural,
      exerciseLabelSingular: space.exerciseLabelSingular,
      exerciseLabelPlural: space.exerciseLabelPlural,
      exerciseLabelShort: space.exerciseLabelShort,
      name: space.name,
      slug: space.slug,
      shortLabel: space.shortLabel,
      description: space.description,
      cardColor: space.cardColor,
      sortOrder: space.sortOrder,
      sourceType: space.sourceType,
      primarySource: space.primarySource ?? undefined,
      mirrorSource: space.mirrorSource,
      levelPresentation: space.levelPresentation,
    });
    expect((await getLearningSpace(space.id))?.subjectId).toBe(subject.id);
    await expect(getLearningSpace(space.id)).resolves.toMatchObject({
      themeLabelSingular: "Deel", themeLabelPlural: "Delen", sectionLabelSingular: "Sectie", sectionLabelPlural: "Secties",
      collectionLabelSingular: space.collectionLabelSingular, exerciseLabelPlural: space.exerciseLabelPlural, exerciseLabelShort: "Oef.", description: space.description,
    });
    expect((await getLearningSpaces()).length).toBeGreaterThan(0);

    const settingKey = `postgres-compat-${suffix}`;
    await setSetting(settingKey, "ok");
    expect(await getSetting(settingKey)).toBe("ok");
    const portfolioCode = `pg-${suffix}`;
    const firstIndex = postgresExerciseMoveFixture(portfolioCode, 1, "postgres-move-old");
    const leaseOwner = `postgres-compat-${suffix}`;
    expect(await tryAcquireSyncLease(space.id, leaseOwner)).toBe(true);
    const activeSource = await getActiveLearningSpaceSource(space.id);
    expect(activeSource).toMatchObject({
      learningSpaceId: space.id,
      providerType: "local",
      isActive: true,
    });
    if (!activeSource) throw new Error("De PostgreSQL-testfixture heeft geen actieve synchronisatiebron.");
    const storedSource = await getLearningSpaceSource(activeSource.id);
    expect(storedSource).toMatchObject({
      id: activeSource.id,
      learningSpaceId: space.id,
      role: "primary",
      providerType: activeSource.providerType,
      isActive: true,
      storageConnectionId: null,
      localSourcePath: null,
    });
    const publicationSnapshot = await getSyncPublicationSnapshot(space.id, activeSource.id);
    expect(publicationSnapshot).toMatchObject({
      learningSpaceId: space.id,
      sourceId: activeSource.id,
      sourceProviderType: activeSource.providerType,
      sourceStorageConnectionId: null,
      sourceLocalPath: null,
      activeSourceId: activeSource.id,
      sourceProfileConfigVersion: 1,
    });
    if (!publicationSnapshot) throw new Error("De PostgreSQL-testfixture heeft geen geldige publicatiesnapshot.");
    await persistIndex([firstIndex], activeSource.providerType, space.id, {
      sourceId: activeSource.id,
      publicationGuard: { ownerId: leaseOwner, leaseSeconds: 600, snapshot: publicationSnapshot },
    });
    await releaseSyncLease(space.id, leaseOwner);
    const originalExerciseId = String((await database.execute({
      sql: "SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ? AND portfolio_code = ?)",
      args: [space.id, portfolioCode],
    })).rows[0].id);
    await expect(persistIndex([postgresExerciseMoveFixture(portfolioCode, 2, "postgres-move-new")], activeSource.providerType, space.id))
      .resolves.toMatchObject({ added: 0, missing: 0 });
    expect((await database.execute({ sql: "SELECT id, is_indexed FROM exercises WHERE id = ?", args: [originalExerciseId] })).rows[0])
      .toMatchObject({ id: originalExerciseId, is_indexed: 1 });
    const directIndex = postgresExerciseMoveFixture(portfolioCode, 2, "postgres-move-new");
    directIndex.exercises = directIndex.sections[0].exercises;
    directIndex.sections = [];
    await persistIndex([directIndex], activeSource.providerType, space.id);
    expect((await database.execute({ sql: "SELECT id, section_id FROM exercises WHERE id = ?", args: [originalExerciseId] })).rows[0])
      .toMatchObject({ id: originalExerciseId, section_id: null });
    expect((await getAdminPortfolios(space.id))[0]).toMatchObject({
      sections: [], exercises: [expect.objectContaining({ id: originalExerciseId })],
    });
    await persistIndex([directIndex], activeSource.providerType, space.id);
    const conflictingIndex = structuredClone(directIndex);
    conflictingIndex.sections = firstIndex.sections;
    await expect(persistIndex([conflictingIndex], activeSource.providerType, space.id)).rejects.toThrow("Oefeningscode 20a");
    expect((await database.execute({ sql: "SELECT id, section_id FROM exercises WHERE id = ?", args: [originalExerciseId] })).rows[0])
      .toMatchObject({ id: originalExerciseId, section_id: null });
    await expect(persistIndex([firstIndex], activeSource.providerType, space.id)).resolves.toMatchObject({ added: 0, missing: 0 });
    expect((await getAdminPortfolios(space.id))[0].sections[0].exercises[0].id).toBe(originalExerciseId);
    await persistIndex([directIndex], activeSource.providerType, space.id);
    await expect(database.execute({
      sql: "INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix) SELECT ?, portfolio_id, NULL, exercise_code, exercise_number, exercise_suffix FROM exercises WHERE id = ?",
      args: [`duplicate-direct-${suffix}`, originalExerciseId],
    })).rejects.toThrow();

    const themeConfig = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    themeConfig.scanner.portfolio.themeMode = "folder";
    await database.execute({
      sql: "UPDATE source_profiles SET config_json = ? WHERE id IN (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = ?)",
      args: [JSON.stringify(themeConfig), space.id],
    });
    await createTheme(space.id, "Analyse", 60);
    await expect(createTheme(space.id, "Analyse")).rejects.toThrow();
    directIndex.sourceTheme = { name: "Analyse", relativePath: "Analyse", sourceId: `folder-${suffix}` };
    await persistIndex([directIndex], activeSource.providerType, space.id, { sourceId: activeSource.id });
    const theme = (await getThemes(space.id)).find((item) => item.sourceTheme)!;
    expect(theme).toMatchObject({ name: "Analyse", sortOrder: 70, sourceTheme: { ...directIndex.sourceTheme, scope: activeSource.id } });
    await updateTheme(theme.id, space.id, "Eigen analyse");
    const themeBefore = (await database.execute({ sql: "SELECT * FROM themes WHERE id = ?", args: [theme.id] })).rows[0];
    const portfolioId = (await getAdminPortfolios(space.id))[0].id;
    await persistIndex([directIndex], activeSource.providerType, space.id, { sourceId: activeSource.id });
    expect((await database.execute({ sql: "SELECT * FROM themes WHERE id = ?", args: [theme.id] })).rows[0]).toEqual(themeBefore);
    expect(await getThemes(space.id)).toHaveLength(2);
    expect((await getAdminPortfolios(space.id))[0]).toMatchObject({ id: portfolioId, themeId: theme.id });
    await setPortfolioTheme(portfolioId, space.id, null);
    expect((await getAdminPortfolios(space.id))[0].themeId).toBe(theme.id);
    await expect(deleteTheme(theme.id, space.id)).rejects.toThrow("bepaald door de bronmappen");
    expect((await getIndexedSourceManifest(space.id)).find((entry) => entry.kind === "portfolio")?.sourceTheme).toEqual(directIndex.sourceTheme);
    await expect(database.execute({
      sql: `INSERT INTO themes (id, learning_space_id, name, created_at, updated_at, source_scope, source_id, source_folder_name, source_relative_path)
        SELECT ?, learning_space_id, name, created_at, updated_at, source_scope, source_id, source_folder_name, source_relative_path FROM themes WHERE id = ?`,
      args: [`duplicate-theme-${suffix}`, theme.id],
    })).rejects.toThrow();
    delete directIndex.sourceTheme;
    await persistIndex([directIndex], activeSource.providerType, space.id, { sourceId: activeSource.id });
    expect((await getAdminPortfolios(space.id))[0].themeId).toBeNull();
    expect((await database.execute({ sql: "SELECT * FROM themes WHERE id = ?", args: [theme.id] })).rows[0]).toEqual(themeBefore);
  }, 60_000);
});

function postgresExerciseMoveFixture(portfolioCode: string, sectionOrder: number, sourceId: string): IndexedPortfolio {
  const portfolioPath = `Portfolio ${portfolioCode}`;
  const sectionPath = `${portfolioPath}/${sectionOrder} Sectie`;
  const fileName = `${portfolioCode}-Oef20a.png`;
  return {
    code: portfolioCode,
    title: "PostgreSQL reconciliation",
    relativePath: portfolioPath,
    assignmentPdfPath: null,
    assignmentPdfSourceId: null,
    hintsDocumentPath: null,
    hintsDocumentSourceId: null,
    finalSolutionsPdfPath: null,
    finalSolutionsPdfSourceId: null,
    resourceAssets: [],
    sections: [{
      code: String(sectionOrder),
      sortOrder: sectionOrder,
      title: "Sectie",
      relativePath: sectionPath,
      exercises: [{
        code: "20a",
        number: 20,
        suffix: "a",
        levelSource: "basis",
        assets: [{
          resourceId: "worked-solution",
          semanticRole: "worked_solution",
          legacyVariant: "standard",
          relativePath: `${sectionPath}/${fileName}`,
          sourceId,
          fileName,
          lastModifiedAt: "2026-10-04T10:00:00.000Z",
          sourceVersion: sourceId,
          parsed: {
            portfolioCode,
            exerciseNumber: 20,
            exerciseSuffix: "a",
            exerciseCode: "20a",
            variant: "standard",
            step: 1,
            extension: "png",
          },
        }],
      }],
    }],
    warnings: [],
  };
}
