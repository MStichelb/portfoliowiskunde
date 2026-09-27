import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import { createUser } from "./identity";
import { getLearningSpace, updateLearningSpace } from "./repositories";
import { getActiveSourceProfileForLearningSpace } from "./source-profiles";
import { createSubject, setSubjectActive } from "./subjects";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("LearningSpace subjects", () => {
  it("backfills existing LearningSpaces to Wiskunde and adds the foreign-key relation in migration 043", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "learning-space-subject-migration-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 42)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-26T00:00:00.000Z"] },
      ], "write");
    }
    expect((await legacy.execute("PRAGMA table_info(learning_spaces)")).rows.some((row) => row.name === "subject_id")).toBe(false);
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    expect((await upgraded.execute("SELECT DISTINCT subject_id FROM learning_spaces")).rows).toEqual([
      expect.objectContaining({ subject_id: "subject-wiskunde" }),
    ]);
    expect((await upgraded.execute("SELECT version FROM schema_migrations WHERE version = '043_learning_space_subject'")).rows).toHaveLength(1);
    expect((await upgraded.execute("SELECT DISTINCT collection_label_singular, collection_label_plural FROM learning_spaces")).rows).toEqual([
      expect.objectContaining({ collection_label_singular: "Portfolio", collection_label_plural: "Portfolio's" }),
    ]);
    expect((await upgraded.execute("SELECT version FROM schema_migrations WHERE version = '044_learning_space_collection_terminology'")).rows).toHaveLength(1);
    expect((await upgraded.execute("SELECT DISTINCT exercise_label_singular, exercise_label_plural FROM learning_spaces")).rows).toEqual([
      expect.objectContaining({ exercise_label_singular: "Oefening", exercise_label_plural: "Oefeningen" }),
    ]);
    expect((await upgraded.execute("PRAGMA foreign_key_list(learning_spaces)")).rows).toContainEqual(
      expect.objectContaining({ table: "subjects", from: "subject_id", to: "id" }),
    );
    expect((await upgraded.execute("PRAGMA index_list(learning_spaces)")).rows.map((row) => row.name)).toContain("learning_spaces_subject_index");
    await expect(upgraded.execute("UPDATE learning_spaces SET subject_id = 'subject-onbekend' WHERE id = 'space-5'"))
      .rejects.toThrow();
  });

  it("changes only the subject and requested general fields while an inactive current subject remains readable", async () => {
    await useFreshDatabase();
    const superadmin = await createUser({ displayName: "Hoofdbeheerder", role: "superadmin" });
    const physics = await createSubject(superadmin, { name: "Fysica", sortOrder: 20 });
    const before = (await getLearningSpace("space-5"))!;
    const profileBefore = await getActiveSourceProfileForLearningSpace(before.id);

    await updateLearningSpace(before.id, inputFor(before, physics.id, "Vijfde jaar fysica"));
    await setSubjectActive(superadmin, physics.id, false);

    const inactive = (await getLearningSpace(before.id))!;
    expect(inactive).toMatchObject({ subjectId: physics.id, subjectName: "Fysica", subjectIsActive: false, name: "Vijfde jaar fysica" });
    expect(inactive.primarySource).toEqual(before.primarySource);
    expect((await getActiveSourceProfileForLearningSpace(before.id))?.id).toBe(profileBefore?.id);

    await expect(updateLearningSpace("space-6", inputFor((await getLearningSpace("space-6"))!, physics.id)))
      .rejects.toThrow("Het gekozen vak is niet actief.");
    expect(await getLearningSpace("space-6")).toMatchObject({ subjectId: "subject-wiskunde", subjectName: "Wiskunde" });

    await expect(updateLearningSpace(inactive.id, inputFor(inactive, physics.id, "Nog steeds leesbaar"))).resolves.toBeUndefined();
    expect(await getLearningSpace(inactive.id)).toMatchObject({ subjectId: physics.id, subjectIsActive: false, name: "Nog steeds leesbaar" });
  });

  it("trims custom collection labels and rejects empty labels without changing stored terminology", async () => {
    await useFreshDatabase();
    const space = (await getLearningSpace("space-5"))!;

    await updateLearningSpace(space.id, {
      ...inputFor(space, space.subjectId),
      collectionLabelSingular: "  Oefening  ",
      collectionLabelPlural: "  Oefeningen  ",
    });
    expect(await getLearningSpace(space.id)).toMatchObject({ collectionLabelSingular: "Oefening", collectionLabelPlural: "Oefeningen" });

    await expect(updateLearningSpace(space.id, {
      ...inputFor((await getLearningSpace(space.id))!, space.subjectId),
      collectionLabelSingular: "   ",
      collectionLabelPlural: "Oefeningen",
    })).rejects.toThrow("label in voor het enkelvoud");
    expect(await getLearningSpace(space.id)).toMatchObject({ collectionLabelSingular: "Oefening", collectionLabelPlural: "Oefeningen" });
  });

  it("trims custom exercise labels and rejects empty labels without changing stored terminology", async () => {
    await useFreshDatabase();
    const space = (await getLearningSpace("space-5"))!;

    await updateLearningSpace(space.id, {
      ...inputFor(space, space.subjectId),
      exerciseLabelSingular: "  Vraag  ",
      exerciseLabelPlural: "  Vragen  ",
    });
    expect(await getLearningSpace(space.id)).toMatchObject({ exerciseLabelSingular: "Vraag", exerciseLabelPlural: "Vragen" });

    await expect(updateLearningSpace(space.id, {
      ...inputFor((await getLearningSpace(space.id))!, space.subjectId),
      exerciseLabelSingular: "   ",
      exerciseLabelPlural: "Vragen",
    })).rejects.toThrow("label in voor het enkelvoud");
    expect(await getLearningSpace(space.id)).toMatchObject({ exerciseLabelSingular: "Vraag", exerciseLabelPlural: "Vragen" });
  });
});

function inputFor(space: NonNullable<Awaited<ReturnType<typeof getLearningSpace>>>, subjectId: string, name = space.name) {
  return {
    subjectId,
    name,
    slug: space.slug,
    shortLabel: space.shortLabel,
    description: space.description,
    cardColor: space.cardColor,
    sortOrder: space.sortOrder,
    sourceType: space.sourceType,
    primarySource: space.primarySource ? {
      providerType: space.primarySource.providerType,
      storageConnectionId: space.primarySource.storageConnectionId,
      localSourcePath: space.primarySource.localSourcePath,
      oneDriveDriveId: space.primarySource.oneDriveDriveId,
      oneDriveFolderId: space.primarySource.oneDriveFolderId,
      oneDriveFolderPath: space.primarySource.oneDriveFolderPath,
      googleDriveFolderId: space.primarySource.googleDriveFolderId,
      googleDriveFolderLabel: space.primarySource.googleDriveFolderLabel,
    } : undefined,
  };
}

async function useFreshDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "learning-space-subject-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await getDatabase();
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { await rm(directory, { recursive: true, force: true }); return; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
      if (attempt === 9) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
