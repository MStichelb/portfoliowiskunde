import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { canAccessAdmin, canAccessLearningSpace, canManageLearningSpace, getAccessibleLearningSpaceIds, requireLearningSpaceManagement } from "./authorization";
import { resetDatabaseForTests } from "./database";
import type { ExternalAuthProvider } from "./external-auth-provider";
import {
  createLearningSpaceGroupMapping,
  createUser,
  findOrCreateExternalUser,
  findExternalIdentity,
  linkExternalIdentity,
  replaceExternalIdentityGroups,
  resolveLearningSpaceAccess,
  resolveStoredGroupAccess,
  setLearningSpaceMember,
  type NormalizedGroupMembership,
} from "./identity";
import {
  createStorageConnection,
  ensureStorageConnection,
  getOwnedStorageConnection,
  readStorageCredentials,
  saveStorageCredentials,
} from "./storage-connections";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("multi-user authorization foundation", () => {
  it("geeft superadmin alle ruimtes en teachers uitsluitend expliciete memberships", async () => {
    await useTemporaryDatabase();
    const superadmin = await createUser({ displayName: "Superadmin", role: "superadmin" });
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const student = await createUser({ displayName: "Leerling", role: "student" });
    const disabledTeacher = await createUser({ displayName: "Uitgeschakeld", role: "teacher", status: "disabled" });
    await setLearningSpaceMember("space-5", teacher.id, "editor");
    await setLearningSpaceMember("space-5", disabledTeacher.id, "owner");

    expect(await canManageLearningSpace(superadmin, "space-5")).toBe(true);
    expect(await canManageLearningSpace(superadmin, "space-6")).toBe(true);
    expect(await canManageLearningSpace(teacher, "space-5")).toBe(true);
    expect(await canManageLearningSpace(teacher, "space-6")).toBe(false);
    expect(await canManageLearningSpace(student, "space-5")).toBe(false);
    expect(await canManageLearningSpace(disabledTeacher, "space-5")).toBe(false);
    expect(canAccessAdmin(student)).toBe(false);
    await expect(requireLearningSpaceManagement(teacher, "space-6")).rejects.toThrow("geen beheerrechten");
  });

  it("dwingt een unieke externe provideridentiteit af zonder providerrollen te vertrouwen", async () => {
    await useTemporaryDatabase();
    const first = await createUser({ displayName: "Eerste", role: "student" });
    const second = await createUser({ displayName: "Tweede", role: "superadmin" });
    await linkExternalIdentity(first.id, { provider: "smartschool", providerSubject: "subject-123", providerPlatform: "platform-a" });

    await expect(linkExternalIdentity(second.id, {
      provider: "SMARTSCHOOL",
      providerSubject: "subject-123",
      providerPlatform: "platform-a",
    })).rejects.toThrow();
    expect(first.role).toBe("student");
  });

  it("maakt nieuwe Smartschoolgebruikers student en hergebruikt bestaande lokale rollen", async () => {
    await useTemporaryDatabase();
    const identity = { provider: "smartschool", providerSubject: "new-student", providerPlatform: "https://school.smartschool.be", displayName: "Nieuwe leerling" };
    const created = await findOrCreateExternalUser(identity);
    expect(created.created).toBe(true);
    expect(created.user.role).toBe("student");
    const reused = await findOrCreateExternalUser(identity);
    expect(reused.user.id).toBe(created.user.id);
    expect(reused.user.role).toBe("student");

    const teacher = await createUser({ displayName: "Lokale leraar", role: "teacher" });
    await linkExternalIdentity(teacher.id, { ...identity, providerSubject: "teacher-subject" });
    const existingTeacher = await findOrCreateExternalUser({ ...identity, providerSubject: "teacher-subject", displayName: "Externe naam" });
    expect(existingTeacher.user.id).toBe(teacher.id);
    expect(existingTeacher.user.role).toBe("teacher");
  });

  it("behandelt dezelfde provider-subject op verschillende platformen als aparte identiteit", async () => {
    await useTemporaryDatabase();
    const first = await findOrCreateExternalUser({ provider: "smartschool", providerSubject: "shared-subject", providerPlatform: "https://first.smartschool.be", displayName: "Eerste" });
    const second = await findOrCreateExternalUser({ provider: "smartschool", providerSubject: "shared-subject", providerPlatform: "https://second.smartschool.be", displayName: "Tweede" });
    expect(second.user.id).not.toBe(first.user.id);
    expect((await findExternalIdentity({ provider: "smartschool", providerSubject: "shared-subject", providerPlatform: "https://first.smartschool.be" }))?.userId).toBe(first.user.id);
  });

  it("resolveert nul, één en meerdere LearningSpaces uit genormaliseerde groepen", async () => {
    await useTemporaryDatabase();
    const groups: NormalizedGroupMembership[] = [
      { provider: "smartschool", externalGroupId: "group-a" },
      { provider: "smartschool", externalGroupId: "group-b" },
    ];
    expect(resolveLearningSpaceAccess([], [])).toEqual({
      learningSpaceIds: [], destination: "none", automaticLearningSpaceId: null,
    });
    expect(resolveLearningSpaceAccess([groups[0]], [
      { learningSpaceId: "space-5", provider: "SMARTSCHOOL", externalGroupId: "group-a" },
    ])).toEqual({
      learningSpaceIds: ["space-5"], destination: "automatic", automaticLearningSpaceId: "space-5",
    });
    await createLearningSpaceGroupMapping({ learningSpaceId: "space-5", provider: "smartschool", externalGroupId: "group-a", externalGroupName: "Groep A" });
    await createLearningSpaceGroupMapping({ learningSpaceId: "space-6", provider: "smartschool", externalGroupId: "group-b", externalGroupName: "Groep B" });
    expect(await resolveStoredGroupAccess(groups)).toEqual({
      learningSpaceIds: ["space-5", "space-6"], destination: "selection", automaticLearningSpaceId: null,
    });
  });

  it("vervangt groepssnapshots en ontsluit uitsluitend exact gemapte groupIDs", async () => {
    await useTemporaryDatabase();
    const mapped = await findOrCreateExternalUser({ provider: "smartschool", providerSubject: "student-groups", providerPlatform: "https://school.smartschool.be", displayName: "Leerling" });
    await createLearningSpaceGroupMapping({ learningSpaceId: "space-5", provider: "smartschool", externalGroupId: "direct-5", externalGroupName: "6WIS" });
    await replaceExternalIdentityGroups(mapped.identity.id, [
      { provider: "smartschool", externalGroupId: "parent-other", externalGroupName: "6WIS", membershipType: "parent" },
    ]);
    expect(await getAccessibleLearningSpaceIds(mapped.user)).toEqual([]);
    expect(await canAccessLearningSpace(mapped.user, "space-5")).toBe(false);

    await replaceExternalIdentityGroups(mapped.identity.id, [
      { provider: "smartschool", externalGroupId: "direct-5", externalGroupName: "6WIS", membershipType: "direct" },
    ]);
    expect(await getAccessibleLearningSpaceIds(mapped.user)).toEqual(["space-5"]);
    expect(await canAccessLearningSpace(mapped.user, "space-5")).toBe(true);
    expect(await canAccessLearningSpace(mapped.user, "space-6")).toBe(false);

    await replaceExternalIdentityGroups(mapped.identity.id, []);
    expect(await getAccessibleLearningSpaceIds(mapped.user)).toEqual([]);
  });

  it("isoleert persoonlijke storagecredentials per eigenaar en ondersteunt meerdere connecties per user", async () => {
    await useTemporaryDatabase();
    const teacherA = await createUser({ displayName: "Leraar A", role: "teacher" });
    const teacherB = await createUser({ displayName: "Leraar B", role: "teacher" });
    const connectionA = await ensureStorageConnection(teacherA.id, "onedrive");
    const connectionB = await ensureStorageConnection(teacherB.id, "onedrive");
    await saveStorageCredentials({ ownerUserId: teacherA.id, provider: "onedrive", encryptedCredentials: "cipher-a" });
    await saveStorageCredentials({ ownerUserId: teacherB.id, provider: "onedrive", encryptedCredentials: "cipher-b" });

    expect(connectionA.id).not.toBe(connectionB.id);
    expect(await readStorageCredentials(connectionA.id)).toBe("cipher-a");
    expect(await readStorageCredentials(connectionB.id)).toBe("cipher-b");
    expect(await getOwnedStorageConnection(teacherA.id, connectionB.id)).toBeNull();

    const secondOneDriveConnection = await createStorageConnection(teacherA.id, "onedrive", "Tweede OneDrive");
    expect(secondOneDriveConnection.ownerUserId).toBe(teacherA.id);
    expect(secondOneDriveConnection.id).not.toBe(connectionA.id);
    await saveStorageCredentials({
      ownerUserId: teacherA.id,
      provider: "onedrive",
      connectionId: secondOneDriveConnection.id,
      encryptedCredentials: "cipher-a-second",
    });
    expect(await readStorageCredentials(secondOneDriveConnection.id)).toBe("cipher-a-second");
  });

  it("houdt de auth-providergrens generiek met een fake provider", async () => {
    const fakeProvider: ExternalAuthProvider<{ subject: string; groups: string[] }> = {
      id: "fake",
      async authenticate(input) {
        return {
          identity: { provider: "fake", providerSubject: input.subject, displayName: "Testgebruiker" },
          groups: input.groups.map((externalGroupId) => ({ provider: "fake", externalGroupId })),
        };
      },
    };
    const result = await fakeProvider.authenticate({ subject: "user-1", groups: ["group-1"] });
    expect(result.identity.providerSubject).toBe("user-1");
    expect(result.groups).toEqual([{ provider: "fake", externalGroupId: "group-1" }]);
  });
});

async function useTemporaryDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-multi-user-"));
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
