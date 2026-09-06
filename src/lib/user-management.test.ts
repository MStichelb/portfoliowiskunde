import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { createLearningSpaceGroupMapping, createUser, findOrCreateExternalUser, replaceExternalIdentityGroups, setConfiguredTeacherGroupId } from "./identity";
import { getAccessibleLearningSpaceIds } from "./authorization";
import { ensureStorageConnection, saveStorageCredentials } from "./storage-connections";
import {
  deleteManagedGroupMapping,
  isClassGroupName,
  listKnownClassGroups,
  listKnownExternalGroups,
  listManagedGroupUsers,
  listManagedGroupMappings,
  listManagedMemberships,
  listManagedStorageConnections,
  listManagedUserAccess,
  listManagedUsers,
  removeManagedMembership,
  setIndividualLearningSpaceAccess,
  updateManagedUserClassOverride,
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

  it("beheert owner/editor memberships en blokkeert een rolwijziging zonder cleanup", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    await upsertManagedMembership("space-5", teacher.id, "editor");
    expect(await listManagedMemberships()).toEqual([expect.objectContaining({ learningSpaceId: "space-5", userId: teacher.id, role: "editor" })]);
    await upsertManagedMembership("space-5", teacher.id, "owner");
    expect((await listManagedMemberships())[0].role).toBe("owner");
    await removeManagedMembership("space-5", teacher.id);
    expect(await listManagedMemberships()).toEqual([]);
    await upsertManagedMembership("space-5", teacher.id, "editor");
    await expect(updateManagedUserRole(teacher.id, "student")).rejects.toThrow("Verwijder eerst alle beheerrechten");
    expect(await listManagedMemberships()).toEqual([
      expect.objectContaining({ learningSpaceId: "space-5", userId: teacher.id, role: "editor" }),
    ]);
    await removeManagedMembership("space-5", teacher.id);
    await updateManagedUserRole(teacher.id, "student");
    expect((await listManagedUsers()).find((candidate) => candidate.id === teacher.id)?.role).toBe("student");
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

  it("toont per groupID uitsluitend gebruikers met een opgeslagen Smartschoolsnapshot", async () => {
    await useTemporaryDatabase();
    await createUser({ displayName: "Nog niet aangemeld", role: "student" });
    const first = await findOrCreateExternalUser({ provider: "smartschool", providerSubject: "first", providerPlatform: "https://school.smartschool.be", displayName: "Eerste leerling" });
    const second = await findOrCreateExternalUser({ provider: "smartschool", providerSubject: "second", providerPlatform: "https://school.smartschool.be", displayName: "Tweede leerling" });
    await replaceExternalIdentityGroups(first.identity.id, [{ provider: "smartschool", externalGroupId: "group-5", externalGroupName: "5EWI", membershipType: "direct" }]);
    await replaceExternalIdentityGroups(second.identity.id, [
      { provider: "smartschool", externalGroupId: "group-5", externalGroupName: "5EWI", membershipType: "direct" },
      { provider: "smartschool", externalGroupId: "group-6", externalGroupName: "6EWI", membershipType: "direct" },
    ]);
    const groupUsers = await listManagedGroupUsers();
    expect(groupUsers.filter((entry) => entry.externalGroupId === "group-5")).toEqual([
      expect.objectContaining({ userId: first.user.id, displayName: "Eerste leerling", externalGroupName: "5EWI" }),
      expect.objectContaining({ userId: second.user.id, displayName: "Tweede leerling", externalGroupName: "5EWI" }),
    ]);
    expect((await listKnownExternalGroups()).filter((entry) => entry.externalGroupId === "group-5")).toHaveLength(1);
    expect(groupUsers.some((entry) => entry.displayName === "Nog niet aangemeld")).toBe(false);
  });

  it("markeert gekoppelde Smartschoolidentiteiten zonder providerrollen te vertrouwen", async () => {
    await useTemporaryDatabase();
    const login = await findOrCreateExternalUser({ provider: "smartschool", providerSubject: "new", providerPlatform: "https://school.smartschool.be", displayName: "Nieuwe leerling" });
    const managed = (await listManagedUsers()).find((user) => user.id === login.user.id);
    expect(managed).toMatchObject({ role: "student", hasSmartschoolIdentity: true });
    expect(Number((await (await getDatabase()).execute({ sql: "SELECT COUNT(*) AS count FROM users WHERE role = 'superadmin'", args: [] })).rows[0].count)).toBe(1);
  });

  it("kent de geconfigureerde lerarengroep alleen toe bij een nieuwe identiteit", async () => {
    await useTemporaryDatabase();
    await setConfiguredTeacherGroupId("teachers");
    const teacher = await findOrCreateExternalUser(
      { provider: "smartschool", providerSubject: "teacher-new", providerPlatform: "https://school.smartschool.be", displayName: "Nieuwe leraar" },
      [{ provider: "smartschool", externalGroupId: "teachers", externalGroupName: "Leraren" }],
    );
    expect(teacher.user.role).toBe("teacher");

    await setConfiguredTeacherGroupId(null);
    const reused = await findOrCreateExternalUser(
      { provider: "smartschool", providerSubject: "teacher-new", providerPlatform: "https://school.smartschool.be", displayName: "Nieuwe leraar" },
      [],
    );
    expect(reused.user.role).toBe("teacher");
    const student = await findOrCreateExternalUser(
      { provider: "smartschool", providerSubject: "student-new", providerPlatform: "https://school.smartschool.be", displayName: "Nieuwe leerling" },
      [{ provider: "smartschool", externalGroupId: "teachers", externalGroupName: "Leraren" }],
    );
    expect(student.user.role).toBe("student");
    await setConfiguredTeacherGroupId("teachers");
    const existingStudent = await findOrCreateExternalUser(
      { provider: "smartschool", providerSubject: "student-new", providerPlatform: "https://school.smartschool.be", displayName: "Nieuwe leerling" },
      [{ provider: "smartschool", externalGroupId: "teachers", externalGroupName: "Leraren" }],
    );
    expect(existingStudent.user.role).toBe("student");
  });

  it("combineert groeps-, individuele en managementtoegang zonder concepten te vermengen", async () => {
    await useTemporaryDatabase();
    const login = await findOrCreateExternalUser({ provider: "smartschool", providerSubject: "teacher-access", providerPlatform: "https://school.smartschool.be", displayName: "Leraar" });
    await updateManagedUserRole(login.user.id, "teacher");
    await createLearningSpaceGroupMapping({ learningSpaceId: "space-5", provider: "smartschool", externalGroupId: "group-5", externalGroupName: "5WIS" });
    await replaceExternalIdentityGroups(login.identity.id, [{ provider: "smartschool", externalGroupId: "group-5", externalGroupName: "5WIS" }]);
    await setIndividualLearningSpaceAccess(login.user.id, "space-6", true);
    await upsertManagedMembership("space-6", login.user.id, "editor");

    const current = (await listManagedUsers()).find((user) => user.id === login.user.id)!;
    expect(await getAccessibleLearningSpaceIds(current)).toEqual(["space-5", "space-6"]);
    expect(await listManagedUserAccess()).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: login.user.id, learningSpaceId: "space-5", groupDerived: true, individual: false, managementRole: null }),
      expect.objectContaining({ userId: login.user.id, learningSpaceId: "space-6", groupDerived: false, individual: true, managementRole: "editor" }),
    ]));
    await setIndividualLearningSpaceAccess(login.user.id, "space-6", false);
    expect(await getAccessibleLearningSpaceIds(current)).toEqual(["space-5", "space-6"]);
  });

  it("detecteert een Smartschoolklas en laat een geldige lokale override toe", async () => {
    await useTemporaryDatabase();
    expect(["3A", "4STEM", "5WIS", "6EWI"].every(isClassGroupName)).toBe(true);
    expect(["2A", "Leraren", "Administratie"].some(isClassGroupName)).toBe(false);
    const login = await findOrCreateExternalUser({ provider: "smartschool", providerSubject: "class-user", providerPlatform: "https://school.smartschool.be", displayName: "Klasleerling" });
    await replaceExternalIdentityGroups(login.identity.id, [
      { provider: "smartschool", externalGroupId: "class-5", externalGroupName: "5WIS" },
      { provider: "smartschool", externalGroupId: "other", externalGroupName: "Leerlingen" },
    ]);
    expect((await listManagedUsers()).find((user) => user.id === login.user.id)).toMatchObject({
      automaticClassGroupId: "class-5",
      automaticClassName: "5WIS",
      effectiveClassGroupId: "class-5",
    });
    await replaceExternalIdentityGroups(login.identity.id, [
      { provider: "smartschool", externalGroupId: "class-5", externalGroupName: "5WIS" },
      { provider: "smartschool", externalGroupId: "other", externalGroupName: "Leerlingen" },
      { provider: "smartschool", externalGroupId: "class-6", externalGroupName: "6WIS" },
    ]);
    expect((await listManagedUsers()).find((user) => user.id === login.user.id)).toMatchObject({
      automaticClassGroupId: null,
      effectiveClassGroupId: null,
    });
    expect((await listKnownClassGroups()).map((group) => group.externalGroupId)).toEqual(["class-5", "class-6"]);
    await updateManagedUserClassOverride(login.user.id, "class-6");
    expect((await listManagedUsers()).find((user) => user.id === login.user.id)).toMatchObject({
      classGroupOverrideId: "class-6",
      effectiveClassGroupId: "class-6",
      effectiveClassName: "6WIS",
    });
    await updateManagedUserClassOverride(login.user.id, null);
    expect((await listManagedUsers()).find((user) => user.id === login.user.id)).toMatchObject({
      classGroupOverrideId: null,
      effectiveClassGroupId: null,
    });
  });

  it("rapporteert uitsluitend werkelijk opgeslagen persoonlijke storageverbindingen", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const connection = await ensureStorageConnection(teacher.id, "onedrive");
    expect(await listManagedStorageConnections()).toContainEqual({ userId: teacher.id, provider: "onedrive", status: "disconnected" });
    await saveStorageCredentials({ ownerUserId: teacher.id, provider: "onedrive", connectionId: connection.id, encryptedCredentials: "encrypted" });
    expect(await listManagedStorageConnections()).toContainEqual({ userId: teacher.id, provider: "onedrive", status: "active" });
    await (await getDatabase()).execute({
      sql: "UPDATE learning_space_sources SET storage_connection_id = ?, provider_type = 'onedrive' WHERE learning_space_id = 'space-5' AND role = 'primary'",
      args: [connection.id],
    });
    await expect(updateManagedUserRole(teacher.id, "student")).rejects.toThrow("draag gekoppelde bronnen over");
    expect((await listManagedUsers()).find((user) => user.id === teacher.id)?.role).toBe("teacher");
    expect(await listManagedStorageConnections()).toContainEqual({ userId: teacher.id, provider: "onedrive", status: "active" });
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
