import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { createLearningSpaceGroupMapping, createUser, findOrCreateExternalUser, replaceExternalIdentityGroups } from "./identity";
import {
  deleteManagedGroupMapping,
  listKnownExternalGroups,
  listManagedGroupMappings,
  listManagedMemberships,
  listManagedUsers,
  removeManagedMembership,
  updateManagedUserRole,
  updateManagedUserStatus,
  upsertManagedMembership,
} from "./user-management";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("superadmin user and access management", () => {
  it("wijzigt student en teacher lokaal zonder superadmin via gewone beheerfuncties toe te kennen", async () => {
    await useTemporaryDatabase();
    const user = await createUser({ displayName: "Gebruiker", role: "student" });
    await updateManagedUserRole(user.id, "teacher");
    expect((await listManagedUsers()).find((candidate) => candidate.id === user.id)?.role).toBe("teacher");
    await updateManagedUserRole(user.id, "student");
    expect((await listManagedUsers()).find((candidate) => candidate.id === user.id)?.role).toBe("student");
    await expect(updateManagedUserRole("user-legacy-superadmin", "teacher")).rejects.toThrow("hoofdbeheerderrol");
  });

  it("blokkeert het uitschakelen van de laatste actieve superadmin", async () => {
    await useTemporaryDatabase();
    await expect(updateManagedUserStatus("user-legacy-superadmin", "disabled")).rejects.toThrow("laatste actieve hoofdbeheerder");
    const second = await createUser({ displayName: "Tweede beheerder", role: "superadmin" });
    await updateManagedUserStatus(second.id, "disabled");
    expect((await listManagedUsers()).find((user) => user.id === second.id)?.status).toBe("disabled");
  });

  it("beheert owner/editor memberships en verwijdert memberships bij terugzetten naar student", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    await upsertManagedMembership("space-5", teacher.id, "editor");
    expect(await listManagedMemberships()).toEqual([expect.objectContaining({ learningSpaceId: "space-5", userId: teacher.id, role: "editor" })]);
    await upsertManagedMembership("space-5", teacher.id, "owner");
    expect((await listManagedMemberships())[0].role).toBe("owner");
    await removeManagedMembership("space-5", teacher.id);
    expect(await listManagedMemberships()).toEqual([]);
    await upsertManagedMembership("space-5", teacher.id, "editor");
    await updateManagedUserRole(teacher.id, "student");
    expect(await listManagedMemberships()).toEqual([]);
  });

  it("toont bekende groupIDs en beheert expliciete mappings zonder naamgebaseerde toegang", async () => {
    await useTemporaryDatabase();
    const login = await findOrCreateExternalUser({ provider: "smartschool", providerSubject: "student", providerPlatform: "https://school.smartschool.be", displayName: "Leerling" });
    await replaceExternalIdentityGroups(login.identity.id, [{ provider: "smartschool", externalGroupId: "group-6wis", externalGroupName: "6WIS", membershipType: "direct" }]);
    expect(await listKnownExternalGroups()).toEqual([expect.objectContaining({ provider: "smartschool", externalGroupId: "group-6wis", externalGroupName: "6WIS" })]);
    const id = await createLearningSpaceGroupMapping({ learningSpaceId: "space-6", provider: "smartschool", externalGroupId: "group-6wis", externalGroupName: "6WIS" });
    expect(await listManagedGroupMappings()).toEqual([expect.objectContaining({ id, learningSpaceId: "space-6", externalGroupId: "group-6wis" })]);
    await expect(createLearningSpaceGroupMapping({ learningSpaceId: "space-6", provider: "smartschool", externalGroupId: "group-6wis" })).rejects.toThrow();
    await deleteManagedGroupMapping(id);
    expect(await listManagedGroupMappings()).toEqual([]);
  });

  it("markeert gekoppelde Smartschoolidentiteiten zonder providerrollen te vertrouwen", async () => {
    await useTemporaryDatabase();
    const login = await findOrCreateExternalUser({ provider: "smartschool", providerSubject: "new", providerPlatform: "https://school.smartschool.be", displayName: "Nieuwe leerling" });
    const managed = (await listManagedUsers()).find((user) => user.id === login.user.id);
    expect(managed).toMatchObject({ role: "student", hasSmartschoolIdentity: true });
    expect(Number((await (await getDatabase()).execute({ sql: "SELECT COUNT(*) AS count FROM users WHERE role = 'superadmin'", args: [] })).rows[0].count)).toBe(1);
  });
});

async function useTemporaryDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-user-management-"));
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
