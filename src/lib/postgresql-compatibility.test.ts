import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import type { IndexedPortfolio } from "./domain";
import { createUser } from "./identity";
import {
  getLearningSpace,
  getLearningSpaces,
  getSetting,
  releaseSyncLease,
  setSetting,
  tryAcquireSyncLease,
  updateLearningSpace,
  persistIndex,
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

    const space = await getLearningSpace("space-5");
    expect(space).not.toBeNull();
    await updateLearningSpace("space-5", {
      subjectId: subject.id,
      collectionLabelSingular: space!.collectionLabelSingular,
      collectionLabelPlural: space!.collectionLabelPlural,
      exerciseLabelSingular: space!.exerciseLabelSingular,
      exerciseLabelPlural: space!.exerciseLabelPlural,
      exerciseLabelShort: space!.exerciseLabelShort,
      name: space!.name,
      slug: space!.slug,
      shortLabel: space!.shortLabel,
      description: space!.description,
      cardColor: space!.cardColor,
      sortOrder: space!.sortOrder,
      sourceType: space!.sourceType,
      primarySource: space!.primarySource ?? undefined,
      mirrorSource: space!.mirrorSource,
      levelPresentation: space!.levelPresentation,
    });
    expect((await getLearningSpace("space-5"))?.subjectId).toBe(subject.id);
    expect((await getLearningSpaces()).length).toBeGreaterThan(0);

    const settingKey = `postgres-compat-${suffix}`;
    await setSetting(settingKey, "ok");
    expect(await getSetting(settingKey)).toBe("ok");
    expect(await tryAcquireSyncLease("space-5", `postgres-compat-${suffix}`)).toBe(true);
    await releaseSyncLease("space-5", `postgres-compat-${suffix}`);

    const portfolioCode = `pg-${suffix}`;
    const firstIndex = postgresExerciseMoveFixture(portfolioCode, 1, "postgres-move-old");
    await persistIndex([firstIndex], "local", "space-5");
    const originalExerciseId = String((await database.execute({
      sql: "SELECT id FROM exercises WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ? AND portfolio_code = ?)",
      args: ["space-5", portfolioCode],
    })).rows[0].id);
    await expect(persistIndex([postgresExerciseMoveFixture(portfolioCode, 2, "postgres-move-new")], "local", "space-5"))
      .resolves.toMatchObject({ added: 0, missing: 0 });
    expect((await database.execute({ sql: "SELECT id, is_indexed FROM exercises WHERE id = ?", args: [originalExerciseId] })).rows[0])
      .toMatchObject({ id: originalExerciseId, is_indexed: 1 });
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
      order: sectionOrder,
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
