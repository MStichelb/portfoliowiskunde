import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { createUser, findOrCreateExternalUser, getUser, replaceExternalIdentityGroups } from "./identity";
import { ensureStorageConnection, saveStorageCredentials } from "./storage-connections";
import { setIndividualLearningSpaceAccess, updateManagedUserClassOverride, updateManagedUserRole, upsertManagedMembership } from "./user-management";
import { resetAllStudents, resetManagedUser, resetStudentsByClass } from "./user-reset";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("safe user reset management", () => {
  it("reset een leerling volledig en registreert dezelfde Smartschoolidentity later als nieuwe user", async () => {
    await useTemporaryDatabase();
    const login = await createSmartschoolStudent("student-reset", "Leerling Reset", "class-5", "5WIS");
    await updateManagedUserClassOverride(login.user.id, "class-5");
    await setIndividualLearningSpaceAccess(login.user.id, "space-5", true);
    await insertSession(login.user.id);

    await expect(resetManagedUser(login.user.id)).resolves.toEqual({ resetCount: 1 });
    expect(await getUser(login.user.id)).toBeNull();
    await expectCounts({ users: 0, identities: 0, groups: 0, access: 0, sessions: 0 }, login.user.id);

    const replacement = await findOrCreateExternalUser({
      provider: "smartschool", providerSubject: "student-reset", providerPlatform: "https://school.smartschool.be", displayName: "Leerling Reset",
    });
    expect(replacement.created).toBe(true);
    expect(replacement.user.id).not.toBe(login.user.id);
    expect(replacement.user.role).toBe("student");
  });

  it("blokkeert een leraar die eigenaar is zonder iets op te ruimen", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Eigenaar", role: "teacher" });
    await upsertManagedMembership("space-5", teacher.id, "owner");
    await expect(resetManagedUser(teacher.id)).rejects.toThrow("eigenaar");
    expect(await getUser(teacher.id)).not.toBeNull();
    expect(await count("learning_space_members", "user_id", teacher.id)).toBe(1);
  });

  it("blokkeert een leraar met een door een bron gebruikte opslagverbinding", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Bronbeheerder", role: "teacher" });
    const connection = await ensureStorageConnection(teacher.id, "onedrive");
    await saveStorageCredentials({ ownerUserId: teacher.id, provider: "onedrive", connectionId: connection.id, encryptedCredentials: "encrypted" });
    await (await getDatabase()).execute({
      sql: "UPDATE learning_space_sources SET storage_connection_id = ?, provider_type = 'onedrive' WHERE learning_space_id = 'space-5' AND role = 'primary'",
      args: [connection.id],
    });
    await expect(resetManagedUser(teacher.id)).rejects.toThrow("opslagverbinding");
    expect(await getUser(teacher.id)).not.toBeNull();
    expect(await count("storage_connections", "owner_user_id", teacher.id)).toBe(1);
  });

  it("reset een editor-only leraar en verwijdert alleen diens niet-kritieke relaties", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Editor", role: "teacher" });
    await upsertManagedMembership("space-5", teacher.id, "editor");
    await ensureStorageConnection(teacher.id, "onedrive");
    const spacesBefore = await countAll("learning_spaces");
    await expect(resetManagedUser(teacher.id)).resolves.toEqual({ resetCount: 1 });
    expect(await getUser(teacher.id)).toBeNull();
    expect(await count("learning_space_members", "user_id", teacher.id)).toBe(0);
    expect(await count("storage_connections", "owner_user_id", teacher.id)).toBe(0);
    expect(await countAll("learning_spaces")).toBe(spacesBefore);
  });

  it("beschermt iedere superadmin tegen de gewone resetflow", async () => {
    await useTemporaryDatabase();
    const extraAdmin = await createUser({ displayName: "Tweede beheerder", role: "superadmin" });
    await expect(resetManagedUser(extraAdmin.id)).rejects.toThrow("Hoofdbeheerders");
    await expect(resetManagedUser("user-legacy-superadmin")).rejects.toThrow("Hoofdbeheerders");
    expect(await getUser(extraAdmin.id)).not.toBeNull();
  });

  it("reset per klas uitsluitend leerlingen uit die effectieve klas", async () => {
    await useTemporaryDatabase();
    const first = await createSmartschoolStudent("class-five-a", "Vijf A", "class-5", "5WIS");
    const second = await createSmartschoolStudent("class-five-b", "Vijf B", "class-5", "5WIS");
    const other = await createSmartschoolStudent("class-six", "Zes", "class-6", "6WIS");
    const teacherLogin = await createSmartschoolStudent("teacher-in-class", "Leraar", "class-5", "5WIS");
    await updateManagedUserRole(teacherLogin.user.id, "teacher");
    const spacesBefore = await countAll("learning_spaces");

    await expect(resetStudentsByClass("class-5")).resolves.toEqual({ resetCount: 2 });
    expect(await getUser(first.user.id)).toBeNull();
    expect(await getUser(second.user.id)).toBeNull();
    expect(await getUser(other.user.id)).not.toBeNull();
    expect(await getUser(teacherLogin.user.id)).not.toBeNull();
    expect(await getUser("user-legacy-superadmin")).not.toBeNull();
    expect(await countAll("learning_spaces")).toBe(spacesBefore);
  });

  it("reset alle en uitsluitend leerlingen en behoudt andere users en leeromgevingen", async () => {
    await useTemporaryDatabase();
    const first = await createUser({ displayName: "Leerling een", role: "student" });
    const second = await createUser({ displayName: "Leerling twee", role: "student" });
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    await upsertManagedMembership("space-6", teacher.id, "editor");
    const spacesBefore = await countAll("learning_spaces");

    await expect(resetAllStudents()).resolves.toEqual({ resetCount: 2 });
    expect(await getUser(first.id)).toBeNull();
    expect(await getUser(second.id)).toBeNull();
    expect(await getUser(teacher.id)).not.toBeNull();
    expect(await getUser("user-legacy-superadmin")).not.toBeNull();
    expect(await count("learning_space_members", "user_id", teacher.id)).toBe(1);
    expect(await countAll("learning_spaces")).toBe(spacesBefore);
  });
});

async function createSmartschoolStudent(subject: string, displayName: string, groupId: string, groupName: string) {
  const login = await findOrCreateExternalUser({ provider: "smartschool", providerSubject: subject, providerPlatform: "https://school.smartschool.be", displayName });
  await replaceExternalIdentityGroups(login.identity.id, [{ provider: "smartschool", externalGroupId: groupId, externalGroupName: groupName }]);
  return login;
}

async function insertSession(userId: string): Promise<void> {
  await (await getDatabase()).execute({
    sql: "INSERT INTO admin_sessions (id, expires_at, created_at, user_id) VALUES (?, ?, ?, ?)",
    args: [`session-${userId}`, "2099-01-01T00:00:00.000Z", "2026-09-04T00:00:00.000Z", userId],
  });
}

async function expectCounts(expected: Record<string, number>, userId: string): Promise<void> {
  expect(await count("users", "id", userId)).toBe(expected.users);
  expect(await count("external_identities", "user_id", userId)).toBe(expected.identities);
  expect(await countAll("external_identity_groups")).toBe(expected.groups);
  expect(await count("individual_learning_space_access", "user_id", userId)).toBe(expected.access);
  expect(await count("admin_sessions", "user_id", userId)).toBe(expected.sessions);
}

async function count(table: string, column: string, value: string): Promise<number> {
  const row = (await (await getDatabase()).execute({ sql: `SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`, args: [value] })).rows[0];
  return Number(row?.count ?? 0);
}

async function countAll(table: string): Promise<number> {
  const row = (await (await getDatabase()).execute(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0];
  return Number(row?.count ?? 0);
}

async function useTemporaryDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-user-reset-"));
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
