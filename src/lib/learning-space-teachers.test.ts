import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resetDatabaseForTests } from "./database";
import { createUser } from "./identity";
import { listLearningSpaceTeachers, setIndividualLearningSpaceAccess, upsertManagedMembership } from "./user-management";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("LearningSpace teacher access readmodel", () => {
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
      { userId: owner.id, firstName: "Olivia", lastName: "Owner", role: "owner" },
      { userId: editor.id, firstName: "Elias", lastName: "Editor", role: "editor" },
      { userId: viewer.id, firstName: "Vera", lastName: "Viewer", role: "viewer" },
    ]);
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
