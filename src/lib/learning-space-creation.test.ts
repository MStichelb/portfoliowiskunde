import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { createUser } from "./identity";
import { createLearningSpaceForOwner, getActiveLearningSpaceSource, getAdminLearningSpaceBySlug, type LearningSpaceInput } from "./repositories";
import { ensureStorageConnection } from "./storage-connections";

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
  it("creates a teacher-owned LearningSpace and preserves their OneDrive connection", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const connection = await ensureStorageConnection(teacher.id, "onedrive");

    const space = await createLearningSpaceForOwner(oneDriveInput("teacher-created", connection.id), teacher.id);

    await expect(memberRole(space.id, teacher.id)).resolves.toBe("owner");
    await expect(getActiveLearningSpaceSource(space.id)).resolves.toMatchObject({ storageConnectionId: connection.id, providerType: "onedrive" });
  });

  it("also records a creating superadmin as owner", async () => {
    await useTemporaryDatabase();
    const superadmin = await createUser({ displayName: "Hoofdbeheerder", role: "superadmin" });

    const space = await createLearningSpaceForOwner(localInput("admin-created"), superadmin.id);

    await expect(memberRole(space.id, superadmin.id)).resolves.toBe("owner");
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
  return { name: slug, slug, shortLabel: slug, sortOrder: 10, sourceType: "local", localSourcePath: null };
}

function oneDriveInput(slug: string, storageConnectionId: string): LearningSpaceInput {
  return {
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
