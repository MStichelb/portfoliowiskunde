import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "./authorization";
import { getDatabase, resetDatabaseForTests } from "./database";
import { createUser, type AppUser } from "./identity";
import { archiveSubject, createSubject, listActiveSubjects, listSubjectsForManagement, moveSubject, permanentlyDeleteSubject, renameSubject, restoreSubject, setSubjectActive, updateSubjectSortOrder } from "./subjects";

let temporaryDirectory: string | undefined;
let superadmin: AppUser;
let teacher: AppUser;
let student: AppUser;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "subjects-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  superadmin = await createUser({ displayName: "Admin", role: "superadmin" });
  teacher = await createUser({ displayName: "Leraar", role: "teacher" });
  student = await createUser({ displayName: "Leerling", role: "student" });
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("subjects", () => {
  it("applies migration 042 and seeds only active Wiskunde", async () => {
    const database = await getDatabase();

    expect((await database.execute("SELECT version FROM schema_migrations WHERE version = '042_subjects'")).rows).toHaveLength(1);
    expect((await database.execute("PRAGMA index_list(subjects)")).rows.map((row) => row.name)).toContain("subjects_normalized_name_unique");
    expect(await listSubjectsForManagement(superadmin)).toEqual([
      expect.objectContaining({ id: "subject-wiskunde", name: "Wiskunde", sortOrder: 10, isActive: true, usageCount: 2 }),
    ]);
  });

  it("creates, renames and orders subjects with trimmed validated values", async () => {
    const physics = await createSubject(superadmin, { name: "  Fysica  ", sortOrder: 30 });
    expect(physics).toMatchObject({ name: "Fysica", sortOrder: 30, isActive: true });

    await renameSubject(superadmin, physics.id, " Natuurwetenschappen ");
    await updateSubjectSortOrder(superadmin, physics.id, 5);

    expect((await listSubjectsForManagement(superadmin)).map((subject) => [subject.name, subject.sortOrder])).toEqual([
      ["Natuurwetenschappen", 5],
      ["Wiskunde", 10],
    ]);
    await expect(updateSubjectSortOrder(superadmin, physics.id, -1)).rejects.toThrow("nul of groter");
    await expect(updateSubjectSortOrder(superadmin, physics.id, 1.5)).rejects.toThrow("geheel getal");
  });

  it("places new subjects at the bottom of the active list without a supplied order", async () => {
    await createSubject(superadmin, { name: "Fysica", sortOrder: 40 });

    const chemistry = await createSubject(superadmin, { name: "Chemie" });

    expect(chemistry).toMatchObject({ name: "Chemie", sortOrder: 50, isActive: true, usageCount: 0 });
    expect((await listActiveSubjects()).map((subject) => subject.name)).toEqual(["Wiskunde", "Fysica", "Chemie"]);
  });

  it("moves only active subjects and rejects both active-list boundaries", async () => {
    const physics = await createSubject(superadmin, { name: "Fysica" });
    const chemistry = await createSubject(superadmin, { name: "Chemie" });

    await expect(moveSubject(superadmin, physics.id, "up")).resolves.toBe(true);
    expect((await listActiveSubjects()).map((subject) => subject.name)).toEqual(["Fysica", "Wiskunde", "Chemie"]);
    await expect(moveSubject(superadmin, physics.id, "down")).resolves.toBe(true);
    expect((await listActiveSubjects()).map((subject) => subject.name)).toEqual(["Wiskunde", "Fysica", "Chemie"]);
    await expect(moveSubject(superadmin, "subject-wiskunde", "up")).resolves.toBe(false);
    await expect(moveSubject(superadmin, chemistry.id, "down")).resolves.toBe(false);

    await archiveSubject(superadmin, physics.id);
    await expect(moveSubject(superadmin, physics.id, "up")).resolves.toBe(false);
  });

  it("keeps normalized names unique in preflight and directly in the database", async () => {
    const database = await getDatabase();
    const physics = await createSubject(superadmin, { name: "Fysica", sortOrder: 20 });

    await expect(createSubject(superadmin, { name: " fysica ", sortOrder: 30 })).rejects.toThrow("Er bestaat al een vak met deze naam.");
    await expect(renameSubject(superadmin, "subject-wiskunde", " FYSICA ")).rejects.toThrow("Er bestaat al een vak met deze naam.");
    await expect(renameSubject(superadmin, physics.id, " FYSICA ")).resolves.toBeUndefined();
    await expect(database.execute({
      sql: `INSERT INTO subjects (id, name, sort_order, is_active, created_at, updated_at)
        VALUES ('direct-duplicate', '  fysica  ', 40, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      args: [],
    })).rejects.toThrow();
  });

  it("translates only the subject-name constraint when a create race passes preflight", async () => {
    const database = await getDatabase();
    await createSubject(superadmin, { name: "Fysica", sortOrder: 20 });
    const originalExecute = database.execute.bind(database);
    const execute = vi.spyOn(database, "execute").mockImplementation(async (statement) => {
      const sql = typeof statement === "string" ? statement : statement.sql;
      if (sql.includes("SELECT 1 FROM subjects") && sql.includes("LOWER(TRIM(name))")) return { rows: [] };
      return originalExecute(statement);
    });
    try {
      await expect(createSubject(superadmin, { name: " FYSICA ", sortOrder: 30 }))
        .rejects.toThrow("Er bestaat al een vak met deze naam.");
    } finally {
      execute.mockRestore();
    }

    const insert = vi.spyOn(database, "execute").mockImplementation(async (statement) => {
      const sql = typeof statement === "string" ? statement : statement.sql;
      if (sql.includes("INSERT INTO subjects")) throw new Error("database niet bereikbaar");
      return originalExecute(statement);
    });
    try {
      await expect(createSubject(superadmin, { name: "Chemie", sortOrder: 40 })).rejects.toThrow("database niet bereikbaar");
    } finally {
      insert.mockRestore();
    }
  });

  it("keeps inactive subjects manageable while excluding them from the active read model", async () => {
    const physics = await createSubject(superadmin, { name: "Fysica", sortOrder: 5 });
    await setSubjectActive(superadmin, physics.id, false);

    expect(await listActiveSubjects()).toEqual([expect.objectContaining({ name: "Wiskunde", isActive: true })]);
    expect(await listSubjectsForManagement(superadmin)).toEqual([
      expect.objectContaining({ name: "Fysica", isActive: false }),
      expect.objectContaining({ name: "Wiskunde", isActive: true }),
    ]);

    await restoreSubject(superadmin, physics.id);
    expect((await listActiveSubjects()).map((subject) => subject.name)).toEqual(["Wiskunde", "Fysica"]);
    expect((await listActiveSubjects())[1].sortOrder).toBe(20);
  });

  it("blocks hard delete for linked subjects without changing LearningSpaces", async () => {
    const database = await getDatabase();
    const before = (await database.execute("SELECT id, subject_id FROM learning_spaces ORDER BY id")).rows;
    await archiveSubject(superadmin, "subject-wiskunde");

    await expect(permanentlyDeleteSubject(superadmin, "subject-wiskunde"))
      .rejects.toThrow("Dit vak wordt nog gebruikt door 2 leeromgevingen.");

    expect((await database.execute("SELECT id, subject_id FROM learning_spaces ORDER BY id")).rows).toEqual(before);
    expect((await database.execute("SELECT id FROM subjects WHERE id = 'subject-wiskunde'")).rows).toHaveLength(1);
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("permanently deletes an archived subject only when it is unused", async () => {
    const chemistry = await createSubject(superadmin, { name: "Chemie" });
    await archiveSubject(superadmin, chemistry.id);

    await expect(permanentlyDeleteSubject(superadmin, chemistry.id)).resolves.toBeUndefined();

    expect((await listSubjectsForManagement(superadmin)).some((subject) => subject.id === chemistry.id)).toBe(false);
  });

  it.each([
    ["teacher", () => teacher],
    ["student", () => student],
  ] as const)("blocks every management read and mutation for a %s", async (_role, actor) => {
    await expect(listSubjectsForManagement(actor())).rejects.toBeInstanceOf(AuthorizationError);
    await expect(createSubject(actor(), { name: "Fysica", sortOrder: 20 })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(renameSubject(actor(), "subject-wiskunde", "Rekenen")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(updateSubjectSortOrder(actor(), "subject-wiskunde", 20)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(setSubjectActive(actor(), "subject-wiskunde", false)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(moveSubject(actor(), "subject-wiskunde", "down")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(archiveSubject(actor(), "subject-wiskunde")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(restoreSubject(actor(), "subject-wiskunde")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(permanentlyDeleteSubject(actor(), "subject-wiskunde")).rejects.toBeInstanceOf(AuthorizationError);
  });
});

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
