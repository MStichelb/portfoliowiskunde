import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { createUser } from "./identity";
import { createLearningSpaceForOwner, getActiveLearningSpaceSource, getAdminLearningSpaceBySlug, updateLearningSpace, type LearningSpaceInput } from "./repositories";
import { ensureStorageConnection } from "./storage-connections";
import { createSubject, setSubjectActive } from "./subjects";

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

describe("transactional LearningSpace owner creation", () => {
  it.each([
    ["Portfolio", "Portfolio's", "Oefening", "Oefeningen", "Overzicht van de portfolio's met oefeningen."],
    ["Bundel", "Bundels", "Oefening", "Oefeningen", "Overzicht van de bundels met oefeningen."],
    ["Portfolio", "Portfolio's", "Opdracht", "Opdrachten", "Overzicht van de portfolio's met opdrachten."],
  ])("stores an initial description for %s and preserves it after terminology changes", async (singular: string, plural: string, exerciseSingular: string, exercisePlural: string, expected: string) => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const before = (await (await getDatabase()).execute("SELECT id, description FROM learning_spaces ORDER BY id")).rows;
    const input = { ...localInput("description-space"), collectionLabelSingular: singular, collectionLabelPlural: plural, exerciseLabelSingular: exerciseSingular, exerciseLabelPlural: exercisePlural };
    const space = await createLearningSpaceForOwner(input, teacher.id);
    expect(space.description).toBe(expected);
    const after = (await (await getDatabase()).execute({ sql: "SELECT id, description FROM learning_spaces WHERE id <> ? ORDER BY id", args: [space.id] })).rows;
    expect(after).toEqual(before);
    await updateLearningSpace(space.id, { ...input, collectionLabelSingular: "Boek", collectionLabelPlural: "Boeken", exerciseLabelSingular: "Vraag", exerciseLabelPlural: "Vragen" });
    await expect(getAdminLearningSpaceBySlug(space.slug)).resolves.toMatchObject({ description: expected, collectionLabelPlural: "Boeken", exerciseLabelPlural: "Vragen" });
  });

  it("preserves a custom creation description", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const space = await createLearningSpaceForOwner({ ...localInput("custom-description"), description: "Onze eigen beschrijving." }, teacher.id);
    expect(space.description).toBe("Onze eigen beschrijving.");
  });
  it("creates a teacher-owned LearningSpace and preserves their OneDrive connection", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const connection = await ensureStorageConnection(teacher.id, "onedrive");

    const space = await createLearningSpaceForOwner(oneDriveInput("teacher-created", connection.id), teacher.id);

    expect(space).toMatchObject({
      collectionLabelSingular: "Portfolio", collectionLabelPlural: "Portfolio's",
      exerciseLabelSingular: "Oefening", exerciseLabelPlural: "Oefeningen",
    });
    await expect(memberRole(space.id, teacher.id)).resolves.toBe("owner");
    await expect(getActiveLearningSpaceSource(space.id)).resolves.toMatchObject({ storageConnectionId: connection.id, providerType: "onedrive" });
  });

  it("also records a creating superadmin as owner", async () => {
    await useTemporaryDatabase();
    const superadmin = await createUser({ displayName: "Hoofdbeheerder", role: "superadmin" });

    const space = await createLearningSpaceForOwner(localInput("admin-created"), superadmin.id);

    await expect(memberRole(space.id, superadmin.id)).resolves.toBe("owner");
  });

  it("places a new LearningSpace without a supplied global order at the fallback bottom", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const globalMaximum = Number((await (await getDatabase()).execute("SELECT MAX(sort_order) AS maximum FROM learning_spaces")).rows[0]?.maximum);

    const space = await createLearningSpaceForOwner({ ...localInput("bottom-space"), sortOrder: undefined }, teacher.id);

    expect(space.sortOrder).toBe(globalMaximum + 10);
  });

  it("rolls back LearningSpace and sources when the owner membership cannot be inserted", async () => {
    await useTemporaryDatabase();

    await expect(createLearningSpaceForOwner(localInput("atomic-failure"), "missing-user")).rejects.toThrow();

    await expect(getAdminLearningSpaceBySlug("atomic-failure")).resolves.toBeNull();
  });

  it("keeps an existing owner intact when a duplicate slug fails", async () => {
    await useTemporaryDatabase();
    const first = await createUser({ displayName: "Eerste", role: "teacher" });
    const second = await createUser({ displayName: "Tweede", role: "teacher" });
    const space = await createLearningSpaceForOwner(localInput("duplicate-owner"), first.id);

    await expect(createLearningSpaceForOwner(localInput("duplicate-owner"), second.id)).rejects.toThrow();

    await expect(memberRole(space.id, first.id)).resolves.toBe("owner");
    await expect(memberRole(space.id, second.id)).resolves.toBeNull();
  });

  it("requires an existing active subject before creating any LearningSpace data", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const superadmin = await createUser({ displayName: "Hoofdbeheerder", role: "superadmin" });
    const inactive = await createSubject(superadmin, { name: "Fysica", sortOrder: 20 });
    await setSubjectActive(superadmin, inactive.id, false);

    await expect(createLearningSpaceForOwner({ ...localInput("missing-subject"), subjectId: "" }, teacher.id)).rejects.toThrow("Kies een vak.");
    await expect(createLearningSpaceForOwner({ ...localInput("unknown-subject"), subjectId: "subject-onbekend" }, teacher.id)).rejects.toThrow("bestaat niet");
    await expect(createLearningSpaceForOwner({ ...localInput("inactive-subject"), subjectId: inactive.id }, teacher.id)).rejects.toThrow("niet actief");

    await expect(getAdminLearningSpaceBySlug("missing-subject")).resolves.toBeNull();
    await expect(getAdminLearningSpaceBySlug("unknown-subject")).resolves.toBeNull();
    await expect(getAdminLearningSpaceBySlug("inactive-subject")).resolves.toBeNull();
  });
});

async function useTemporaryDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-space-owner-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await getDatabase();
}

async function memberRole(learningSpaceId: string, userId: string): Promise<string | null> {
  const row = (await (await getDatabase()).execute({
    sql: "SELECT role FROM learning_space_members WHERE learning_space_id = ? AND user_id = ?",
    args: [learningSpaceId, userId],
  })).rows[0];
  return typeof row?.role === "string" ? row.role : null;
}

function localInput(slug: string): LearningSpaceInput {
  return { subjectId: "subject-wiskunde", name: slug, slug, shortLabel: slug, sortOrder: 10, sourceType: "local", localSourcePath: null };
}

function oneDriveInput(slug: string, storageConnectionId: string): LearningSpaceInput {
  return {
    subjectId: "subject-wiskunde",
    name: slug,
    slug,
    shortLabel: slug,
    sortOrder: 10,
    sourceType: "onedrive",
    storageConnectionId,
    oneDriveDriveId: "drive-id",
    oneDriveFolderId: "folder-id",
  };
}
