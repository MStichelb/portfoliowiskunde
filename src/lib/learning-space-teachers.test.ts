import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { createUser } from "./identity";
import {
  listLearningSpaceTeacherCandidates,
  listLearningSpaceTeachers,
  removeLearningSpaceTeacherAccess,
  setIndividualLearningSpaceAccess,
  setLearningSpaceTeacherAccess,
  upsertManagedMembership,
} from "./user-management";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("LearningSpace teacher access", () => {
  it("derives owners, editors and viewers without duplicates or students", async () => {
    await useTemporaryDatabase();
    const owner = await createUser({ displayName: "Olivia Owner", firstName: "Olivia", lastName: "Owner", role: "teacher" });
    const editor = await createUser({ displayName: "Elias Editor", firstName: "Elias", lastName: "Editor", role: "teacher" });
    const viewer = await createUser({ displayName: "Vera Viewer", firstName: "Vera", lastName: "Viewer", role: "teacher" });
    const student = await createUser({ displayName: "Sam Student", firstName: "Sam", lastName: "Student", role: "student" });

    await upsertManagedMembership("space-5", owner.id, "owner");
    await upsertManagedMembership("space-5", editor.id, "editor");
    await setIndividualLearningSpaceAccess(owner.id, "space-5", true);
    await setIndividualLearningSpaceAccess(editor.id, "space-5", true);
    await setIndividualLearningSpaceAccess(viewer.id, "space-5", true);
    await setIndividualLearningSpaceAccess(student.id, "space-5", true);

    expect(await listLearningSpaceTeachers("space-5")).toEqual([
      { userId: owner.id, firstName: "Olivia", lastName: "Owner", role: "owner", isSuperadmin: false },
      { userId: editor.id, firstName: "Elias", lastName: "Editor", role: "editor", isSuperadmin: false },
      { userId: viewer.id, firstName: "Vera", lastName: "Viewer", role: "viewer", isSuperadmin: false },
    ]);
  });

  it("offers only active teachers and superadmins and never offers the current owner", async () => {
    await useTemporaryDatabase();
    const owner = await createUser({ displayName: "Olivia Owner", role: "teacher" });
    const active = await createUser({ displayName: "Vera Viewer", role: "teacher" });
    const activeAdmin = await createUser({ displayName: "Active Admin", role: "superadmin" });
    await createUser({ displayName: "Disabled Teacher", role: "teacher", status: "disabled" });
    const disabledAdmin = await createUser({ displayName: "Disabled Admin", role: "superadmin", status: "disabled" });
    await createUser({ displayName: "Sam Student", role: "student" });
    await upsertManagedMembership("space-5", owner.id, "owner");

    const candidateIds = (await listLearningSpaceTeacherCandidates("space-5")).map((teacher) => teacher.userId);
    expect(candidateIds).toEqual(expect.arrayContaining([active.id, activeAdmin.id]));
    expect(candidateIds).not.toContain(owner.id);
    expect(candidateIds).not.toContain(disabledAdmin.id);
  });

  it("retains explicit viewer, editor and owner roles for superadmins", async () => {
    await useTemporaryDatabase();
    const viewer = await createUser({ displayName: "Admin Viewer", firstName: "Admin", lastName: "Viewer", role: "superadmin" });
    const editor = await createUser({ displayName: "Admin Editor", firstName: "Admin", lastName: "Editor", role: "superadmin" });
    const owner = await createUser({ displayName: "Admin Owner", firstName: "Admin", lastName: "Owner", role: "superadmin" });
    const disabled = await createUser({ displayName: "Admin Disabled", role: "superadmin", status: "disabled" });

    await setLearningSpaceTeacherAccess("space-5", viewer.id, "viewer");
    await setLearningSpaceTeacherAccess("space-5", editor.id, "editor");
    await upsertManagedMembership("space-5", owner.id, "owner");

    expect(await listLearningSpaceTeachers("space-5")).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: viewer.id, role: "viewer", isSuperadmin: true }),
      expect.objectContaining({ userId: editor.id, role: "editor", isSuperadmin: true }),
      expect.objectContaining({ userId: owner.id, role: "owner", isSuperadmin: true }),
    ]));
    await expect(setLearningSpaceTeacherAccess("space-5", disabled.id, "viewer")).rejects.toThrow("actieve leraar");
    await expect(setLearningSpaceTeacherAccess("space-5", owner.id, "editor")).rejects.toThrow("Een eigenaar");
  });

  it("converts viewer and editor access transactionally without redundant direct access", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Elias Editor", role: "teacher" });

    await setLearningSpaceTeacherAccess("space-5", teacher.id, "viewer");
    await expect(accessState("space-5", teacher.id)).resolves.toEqual({ membership: null, individual: true });

    await setLearningSpaceTeacherAccess("space-5", teacher.id, "editor");
    await expect(accessState("space-5", teacher.id)).resolves.toEqual({ membership: "editor", individual: false });

    await setLearningSpaceTeacherAccess("space-5", teacher.id, "viewer");
    await expect(accessState("space-5", teacher.id)).resolves.toEqual({ membership: null, individual: true });
  });

  it("removes viewer and editor access while leaving unrelated LearningSpaces intact", async () => {
    await useTemporaryDatabase();
    const viewer = await createUser({ displayName: "Vera Viewer", role: "teacher" });
    const editor = await createUser({ displayName: "Elias Editor", role: "teacher" });
    await setLearningSpaceTeacherAccess("space-5", viewer.id, "viewer");
    await setLearningSpaceTeacherAccess("space-5", editor.id, "editor");
    await setIndividualLearningSpaceAccess(editor.id, "space-5", true);
    await setLearningSpaceTeacherAccess("space-6", viewer.id, "viewer");

    await removeLearningSpaceTeacherAccess("space-5", viewer.id);
    await removeLearningSpaceTeacherAccess("space-5", editor.id);

    await expect(accessState("space-5", viewer.id)).resolves.toEqual({ membership: null, individual: false });
    await expect(accessState("space-5", editor.id)).resolves.toEqual({ membership: null, individual: false });
    await expect(accessState("space-6", viewer.id)).resolves.toEqual({ membership: null, individual: true });
  });

  it("protects owners and rejects non-teacher targets", async () => {
    await useTemporaryDatabase();
    const owner = await createUser({ displayName: "Olivia Owner", role: "teacher" });
    const student = await createUser({ displayName: "Sam Student", role: "student" });
    await upsertManagedMembership("space-5", owner.id, "owner");

    await expect(setLearningSpaceTeacherAccess("space-5", owner.id, "viewer")).rejects.toThrow("Een eigenaar");
    await expect(setLearningSpaceTeacherAccess("space-5", owner.id, "editor")).rejects.toThrow("Een eigenaar");
    await expect(removeLearningSpaceTeacherAccess("space-5", owner.id)).rejects.toThrow("Een eigenaar");
    await expect(setLearningSpaceTeacherAccess("space-5", student.id, "viewer")).rejects.toThrow("actieve leraar");
    await expect(accessState("space-5", owner.id)).resolves.toEqual({ membership: "owner", individual: false });
  });

  it("returns teachers only for the requested LearningSpace", async () => {
    await useTemporaryDatabase();
    const current = await createUser({ displayName: "Current Teacher", role: "teacher" });
    const other = await createUser({ displayName: "Other Teacher", role: "teacher" });
    await setIndividualLearningSpaceAccess(current.id, "space-5", true);
    await setIndividualLearningSpaceAccess(other.id, "space-6", true);

    expect((await listLearningSpaceTeachers("space-5")).map((teacher) => teacher.userId)).toEqual([current.id]);
    expect((await listLearningSpaceTeachers("space-6")).map((teacher) => teacher.userId)).toEqual([other.id]);
  });
});

async function accessState(learningSpaceId: string, userId: string): Promise<{ membership: string | null; individual: boolean }> {
  const database = await getDatabase();
  const [membership, individual] = await Promise.all([
    database.execute({ sql: "SELECT role FROM learning_space_members WHERE learning_space_id = ? AND user_id = ?", args: [learningSpaceId, userId] }),
    database.execute({ sql: "SELECT 1 FROM individual_learning_space_access WHERE learning_space_id = ? AND user_id = ?", args: [learningSpaceId, userId] }),
  ]);
  return { membership: typeof membership.rows[0]?.role === "string" ? membership.rows[0].role : null, individual: Boolean(individual.rows[0]) };
}

async function useTemporaryDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-learning-space-teachers-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
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
