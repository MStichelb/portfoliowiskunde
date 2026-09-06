import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/identity";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`NEXT_REDIRECT:${destination}`); }),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { getDatabase, resetDatabaseForTests } from "@/lib/database";
import { createLearningSpaceGroupMapping, createUser, findOrCreateExternalUser, replaceExternalIdentityGroups } from "@/lib/identity";
import { getAccessibleLearningSpaceIds } from "@/lib/authorization";
import { listLearningSpaceGroupMappings, listLearningSpaceIndividualStudentAccess, setIndividualLearningSpaceAccess, upsertManagedMembership } from "@/lib/user-management";

import {
  removeLearningSpaceGroupMappingAction,
  removeLearningSpaceIndividualStudentAccessAction,
  removeLearningSpaceTeacherAccessAction,
  saveLearningSpaceGroupMappingAction,
  saveLearningSpaceIndividualStudentAccessAction,
  saveLearningSpaceTeacherAccessAction,
} from "./actions";

let temporaryDirectory: string | undefined;
let actors: Record<"owner" | "editor" | "viewer" | "student" | "disabledStudent" | "superadmin" | "targetViewer" | "targetEditor", AppUser>;
let groupStudent: AppUser;

beforeEach(async () => {
  vi.clearAllMocks();
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-teacher-access-actions-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  actors = {
    owner: await createUser({ displayName: "Olivia Owner", role: "teacher" }),
    editor: await createUser({ displayName: "Elias Editor", role: "teacher" }),
    viewer: await createUser({ displayName: "Vera Viewer", role: "teacher" }),
    student: await createUser({ displayName: "Sam Student", role: "student" }),
    disabledStudent: await createUser({ displayName: "Dina Disabled", role: "student", status: "disabled" }),
    superadmin: await createUser({ displayName: "Admin", role: "superadmin" }),
    targetViewer: await createUser({ displayName: "Nieuwe Kijker", role: "teacher" }),
    targetEditor: await createUser({ displayName: "Nieuwe Bewerker", role: "teacher" }),
  };
  await upsertManagedMembership("space-5", actors.owner.id, "owner");
  await upsertManagedMembership("space-5", actors.editor.id, "editor");
  await setIndividualLearningSpaceAccess(actors.viewer.id, "space-5", true);
  const smartschoolUser = await findOrCreateExternalUser({
    provider: "smartschool",
    providerSubject: "known-group-user",
    providerPlatform: "https://school.smartschool.be",
    displayName: "Groepslid",
  });
  groupStudent = smartschoolUser.user;
  await replaceExternalIdentityGroups(smartschoolUser.identity.id, [
    { provider: "smartschool", externalGroupId: "class-5", externalGroupName: "5WEWI" },
    { provider: "smartschool", externalGroupId: "club", externalGroupName: "Wiskundeclub" },
  ]);
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("LearningSpace teacher access actions", () => {
  it("allows an owner to add a viewer and an editor", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.owner);

    await expect(saveLearningSpaceTeacherAccessAction(accessForm("space-5", actors.targetViewer.id, "viewer"))).rejects.toThrow("accessSaved=1");
    await expect(saveLearningSpaceTeacherAccessAction(accessForm("space-5", actors.targetEditor.id, "editor"))).rejects.toThrow("accessSaved=1");

    await expect(accessState("space-5", actors.targetViewer.id)).resolves.toEqual({ membership: null, individual: true });
    await expect(accessState("space-5", actors.targetEditor.id)).resolves.toEqual({ membership: "editor", individual: false });
  });

  it("allows a superadmin to add either teacher access role", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.superadmin);

    await expect(saveLearningSpaceTeacherAccessAction(accessForm("space-5", actors.targetViewer.id, "viewer"))).rejects.toThrow("accessSaved=1");
    await expect(saveLearningSpaceTeacherAccessAction(accessForm("space-5", actors.targetEditor.id, "editor"))).rejects.toThrow("accessSaved=1");

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/gebruikers");
  });

  it.each(["editor", "viewer", "student"] as const)("rejects a %s actor server-side", async (actorRole) => {
    mocks.requireAdminUser.mockResolvedValue(actors[actorRole]);

    await expect(saveLearningSpaceTeacherAccessAction(accessForm("space-5", actors.targetViewer.id, "viewer"))).rejects.toThrow("Alleen een eigenaar of hoofdbeheerder");
    await expect(accessState("space-5", actors.targetViewer.id)).resolves.toEqual({ membership: null, individual: false });
  });

  it("scopes owner mutations to the exact LearningSpace", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.owner);

    await expect(saveLearningSpaceTeacherAccessAction(accessForm("space-6", actors.targetViewer.id, "viewer"))).rejects.toThrow("Alleen een eigenaar of hoofdbeheerder");
    await expect(accessState("space-6", actors.targetViewer.id)).resolves.toEqual({ membership: null, individual: false });
  });

  it("allows an owner to remove viewer and editor access", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.owner);

    await expect(removeLearningSpaceTeacherAccessAction(accessForm("space-5", actors.viewer.id))).rejects.toThrow("accessSaved=1");
    await expect(removeLearningSpaceTeacherAccessAction(accessForm("space-5", actors.editor.id))).rejects.toThrow("accessSaved=1");

    await expect(accessState("space-5", actors.viewer.id)).resolves.toEqual({ membership: null, individual: false });
    await expect(accessState("space-5", actors.editor.id)).resolves.toEqual({ membership: null, individual: false });
  });
  it("does not let this flow change or remove an owner", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.superadmin);

    await expect(saveLearningSpaceTeacherAccessAction(accessForm("space-5", actors.owner.id, "editor"))).rejects.toThrow("accessError=");
    await expect(removeLearningSpaceTeacherAccessAction(accessForm("space-5", actors.owner.id))).rejects.toThrow("accessError=");
    await expect(accessState("space-5", actors.owner.id)).resolves.toEqual({ membership: "owner", individual: false });
  });

  it("rejects a student as teacher target", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.owner);

    await expect(saveLearningSpaceTeacherAccessAction(accessForm("space-5", actors.student.id, "viewer"))).rejects.toThrow("accessError=");
    await expect(accessState("space-5", actors.student.id)).resolves.toEqual({ membership: null, individual: false });
  });
});

describe("LearningSpace group mapping actions", () => {
  it.each([
    ["owner", "class-5"],
    ["superadmin", "club"],
  ] as const)("allows a %s to add a known Smartschool group", async (actorRole, externalGroupId) => {
    mocks.requireAdminUser.mockResolvedValue(actors[actorRole]);

    await expect(saveLearningSpaceGroupMappingAction(groupForm("space-5", externalGroupId))).rejects.toThrow("groupSaved=1");

    await expect(listLearningSpaceGroupMappings("space-5")).resolves.toEqual([
      expect.objectContaining({ learningSpaceId: "space-5", provider: "smartschool", externalGroupId }),
    ]);
  });

  it("blocks an editor mutation server-side", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.editor);

    await expect(saveLearningSpaceGroupMappingAction(groupForm("space-5", "class-5"))).rejects.toThrow("Alleen een eigenaar of hoofdbeheerder");
    await expect(listLearningSpaceGroupMappings("space-5")).resolves.toEqual([]);
  });

  it("scopes owner mutations to the exact LearningSpace", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.owner);

    await expect(saveLearningSpaceGroupMappingAction(groupForm("space-6", "class-5"))).rejects.toThrow("Alleen een eigenaar of hoofdbeheerder");
    await expect(listLearningSpaceGroupMappings("space-6")).resolves.toEqual([]);
  });

  it.each(["owner", "superadmin"] as const)("allows a %s to remove a mapping", async (actorRole) => {
    mocks.requireAdminUser.mockResolvedValue(actors[actorRole]);
    const id = await createLearningSpaceGroupMapping({
      learningSpaceId: "space-5",
      provider: "smartschool",
      externalGroupId: "class-5",
      externalGroupName: "5WEWI",
    });

    await expect(removeLearningSpaceGroupMappingAction(removeGroupForm("space-5", id))).rejects.toThrow("groupSaved=1");

    await expect(listLearningSpaceGroupMappings("space-5")).resolves.toEqual([]);
  });

  it("does not remove a mapping from another LearningSpace", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.owner);
    const id = await createLearningSpaceGroupMapping({
      learningSpaceId: "space-6",
      provider: "smartschool",
      externalGroupId: "class-5",
      externalGroupName: "5WEWI",
    });

    await expect(removeLearningSpaceGroupMappingAction(removeGroupForm("space-5", id))).rejects.toThrow("groupError=");

    await expect(listLearningSpaceGroupMappings("space-6")).resolves.toEqual([
      expect.objectContaining({ id, learningSpaceId: "space-6" }),
    ]);
  });

  it("prevents duplicate mappings in the same LearningSpace", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.owner);

    await expect(saveLearningSpaceGroupMappingAction(groupForm("space-5", "class-5"))).rejects.toThrow("groupSaved=1");
    await expect(saveLearningSpaceGroupMappingAction(groupForm("space-5", "class-5"))).rejects.toThrow("groupError=");

    await expect(listLearningSpaceGroupMappings("space-5")).resolves.toHaveLength(1);
  });
});

describe("LearningSpace individual student access actions", () => {
  it.each(["owner", "superadmin"] as const)("allows a %s to add an active student", async (actorRole) => {
    mocks.requireAdminUser.mockResolvedValue(actors[actorRole]);

    await expect(saveLearningSpaceIndividualStudentAccessAction(studentForm("space-5", actors.student.id))).rejects.toThrow("studentSaved=1");

    await expect(listLearningSpaceIndividualStudentAccess("space-5")).resolves.toEqual([
      expect.objectContaining({ userId: actors.student.id }),
    ]);
  });

  it.each(["editor", "viewer", "student"] as const)("rejects a %s mutation server-side", async (actorRole) => {
    mocks.requireAdminUser.mockResolvedValue(actors[actorRole]);

    await expect(saveLearningSpaceIndividualStudentAccessAction(studentForm("space-5", actors.student.id))).rejects.toThrow("Alleen een eigenaar of hoofdbeheerder");
    await expect(listLearningSpaceIndividualStudentAccess("space-5")).resolves.toEqual([]);
  });

  it("accepts only active students", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.owner);

    await expect(saveLearningSpaceIndividualStudentAccessAction(studentForm("space-5", actors.targetViewer.id))).rejects.toThrow("studentError=");
    await expect(saveLearningSpaceIndividualStudentAccessAction(studentForm("space-5", actors.disabledStudent.id))).rejects.toThrow("studentError=");
    await expect(listLearningSpaceIndividualStudentAccess("space-5")).resolves.toEqual([]);
  });

  it("prevents duplicates and scopes owner mutations to the exact LearningSpace", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.owner);

    await expect(saveLearningSpaceIndividualStudentAccessAction(studentForm("space-5", actors.student.id))).rejects.toThrow("studentSaved=1");
    await expect(saveLearningSpaceIndividualStudentAccessAction(studentForm("space-5", actors.student.id))).rejects.toThrow("studentError=");
    await expect(saveLearningSpaceIndividualStudentAccessAction(studentForm("space-6", actors.student.id))).rejects.toThrow("Alleen een eigenaar of hoofdbeheerder");

    await expect(listLearningSpaceIndividualStudentAccess("space-5")).resolves.toHaveLength(1);
    await expect(listLearningSpaceIndividualStudentAccess("space-6")).resolves.toEqual([]);
  });

  it.each(["owner", "superadmin"] as const)("allows a %s to remove only the individual access record", async (actorRole) => {
    mocks.requireAdminUser.mockResolvedValue(actors[actorRole]);
    await setIndividualLearningSpaceAccess(actors.student.id, "space-5", true);

    await expect(removeLearningSpaceIndividualStudentAccessAction(studentForm("space-5", actors.student.id))).rejects.toThrow("studentSaved=1");

    await expect(listLearningSpaceIndividualStudentAccess("space-5")).resolves.toEqual([]);
  });

  it("keeps group-derived access after individual access is removed", async () => {
    mocks.requireAdminUser.mockResolvedValue(actors.owner);
    await createLearningSpaceGroupMapping({
      learningSpaceId: "space-5",
      provider: "smartschool",
      externalGroupId: "class-5",
      externalGroupName: "5WEWI",
    });
    await setIndividualLearningSpaceAccess(groupStudent.id, "space-5", true);

    await expect(removeLearningSpaceIndividualStudentAccessAction(studentForm("space-5", groupStudent.id))).rejects.toThrow("studentSaved=1");

    expect(await getAccessibleLearningSpaceIds(groupStudent)).toContain("space-5");
    await expect(listLearningSpaceIndividualStudentAccess("space-5")).resolves.toEqual([]);
  });
});

function groupForm(learningSpaceId: string, externalGroupId: string): FormData {
  const formData = new FormData();
  formData.set("learningSpaceId", learningSpaceId);
  formData.set("externalGroupId", externalGroupId);
  return formData;
}

function removeGroupForm(learningSpaceId: string, mappingId: string): FormData {
  const formData = new FormData();
  formData.set("learningSpaceId", learningSpaceId);
  formData.set("mappingId", mappingId);
  return formData;
}

function studentForm(learningSpaceId: string, userId: string): FormData {
  const formData = new FormData();
  formData.set("learningSpaceId", learningSpaceId);
  formData.set("userId", userId);
  return formData;
}

function accessForm(learningSpaceId: string, userId: string, role?: "viewer" | "editor"): FormData {
  const formData = new FormData();
  formData.set("learningSpaceId", learningSpaceId);
  formData.set("userId", userId);
  if (role) formData.set("role", role);
  return formData;
}

async function accessState(learningSpaceId: string, userId: string): Promise<{ membership: string | null; individual: boolean }> {
  const database = await getDatabase();
  const [membership, individual] = await Promise.all([
    database.execute({ sql: "SELECT role FROM learning_space_members WHERE learning_space_id = ? AND user_id = ?", args: [learningSpaceId, userId] }),
    database.execute({ sql: "SELECT 1 FROM individual_learning_space_access WHERE learning_space_id = ? AND user_id = ?", args: [learningSpaceId, userId] }),
  ]);
  return { membership: typeof membership.rows[0]?.role === "string" ? membership.rows[0].role : null, individual: Boolean(individual.rows[0]) };
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
