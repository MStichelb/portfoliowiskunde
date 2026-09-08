import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getAccessibleLearningSpaceIds } from "./authorization";
import { resetDatabaseForTests } from "./database";
import { createLearningSpaceGroupMapping, createUser, findOrCreateExternalUser, replaceExternalIdentityGroups } from "./identity";
import { listLearningSpaceStudentRoster } from "./learning-space-student-roster";
import { setIndividualLearningSpaceAccess } from "./user-management";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("LearningSpace student roster read model", () => {
  it("combines class, other-group and individual access without duplicate students", async () => {
    await useTemporaryDatabase();
    const karel = await smartschoolUser("karel", "Karel Klasgroep", "Karel", "Klasgroep", [
      ["class-5", "5WEWI6"],
      ["challenge", "Uitdaging"],
      ["irrelevant", "Niet gekoppeld"],
    ]);
    const iris = await smartschoolUser("iris", "Iris Individueel", "Iris", "Individueel", []);
    const emma = await smartschoolUser("emma", "Emma Anderegroep", "Emma", "Anderegroep", [
      ["class-6", "6WEWI6"],
      ["challenge", "Uitdaging"],
    ]);
    await smartschoolUser("sam", "Sam ZonderToegang", "Sam", "ZonderToegang", [["irrelevant", "Niet gekoppeld"]]);
    const teacher = await smartschoolUser("teacher", "Theo Teacher", "Theo", "Teacher", [["class-5", "5WEWI6"]], "teacher");
    const superadmin = await createUser({ displayName: "Ada Admin", role: "superadmin" });
    await setIndividualLearningSpaceAccess(iris.user.id, "space-5", true);
    await setIndividualLearningSpaceAccess(karel.user.id, "space-5", true);
    await createLearningSpaceGroupMapping({ learningSpaceId: "space-5", provider: "smartschool", externalGroupId: "class-5", externalGroupName: "5WEWI6" });
    await createLearningSpaceGroupMapping({ learningSpaceId: "space-5", provider: "smartschool", externalGroupId: "challenge", externalGroupName: "Uitdaging" });

    const roster = await listLearningSpaceStudentRoster("space-5");

    expect(roster.map((entry) => entry.userId)).toEqual([karel.user.id, emma.user.id, iris.user.id]);
    expect(roster.filter((entry) => entry.userId === karel.user.id)).toHaveLength(1);
    expect(roster.find((entry) => entry.userId === karel.user.id)).toMatchObject({
      className: "5WEWI6",
      relevantGroupNames: ["5WEWI6", "Uitdaging"],
      individualAccess: true,
      groupDerivedAccess: true,
    });
    expect(roster.find((entry) => entry.userId === emma.user.id)).toMatchObject({
      className: "6WEWI6",
      relevantGroupNames: ["Uitdaging"],
      individualAccess: false,
      groupDerivedAccess: true,
    });
    expect(roster.find((entry) => entry.userId === iris.user.id)).toMatchObject({
      className: null,
      relevantGroupNames: [],
      individualAccess: true,
      groupDerivedAccess: false,
    });
    expect(roster.some((entry) => entry.userId === teacher.user.id || entry.userId === superadmin.id)).toBe(false);
    expect(roster.flatMap((entry) => entry.relevantGroupNames)).not.toContain("Niet gekoppeld");
  });

  it("is strictly LearningSpace-scoped", async () => {
    await useTemporaryDatabase();
    const current = await smartschoolUser("current", "Current Student", "Current", "Student", [["group-5", "Uitdaging"]]);
    const other = await smartschoolUser("other", "Other Student", "Other", "Student", [["group-6", "Verdieping"]]);
    await createLearningSpaceGroupMapping({ learningSpaceId: "space-5", provider: "smartschool", externalGroupId: "group-5", externalGroupName: "Uitdaging" });
    await createLearningSpaceGroupMapping({ learningSpaceId: "space-6", provider: "smartschool", externalGroupId: "group-6", externalGroupName: "Verdieping" });
    await setIndividualLearningSpaceAccess(other.user.id, "space-6", true);

    expect((await listLearningSpaceStudentRoster("space-5")).map((entry) => entry.userId)).toEqual([current.user.id]);
    expect((await listLearningSpaceStudentRoster("space-6")).map((entry) => entry.userId)).toEqual([other.user.id]);
  });

  it("sorts naturally by class or access group before names", async () => {
    await useTemporaryDatabase();
    const classTen = await smartschoolUser("class-ten", "Anna Tien", "Anna", "Tien", [["class-10", "5WEWI10"]]);
    const classTwo = await smartschoolUser("class-two", "Zara Twee", "Zara", "Twee", [["class-2", "5WEWI2"]]);
    const groupOnly = await smartschoolUser("group-only", "Bram Groep", "Bram", "Groep", [["challenge", "Uitdaging"]]);
    const individual = await smartschoolUser("individual", "Iris Individueel", "Iris", "Individueel", []);
    for (const [id, name] of [["class-10", "5WEWI10"], ["class-2", "5WEWI2"], ["challenge", "Uitdaging"]]) {
      await createLearningSpaceGroupMapping({ learningSpaceId: "space-5", provider: "smartschool", externalGroupId: id, externalGroupName: name });
    }
    await setIndividualLearningSpaceAccess(individual.user.id, "space-5", true);

    expect((await listLearningSpaceStudentRoster("space-5")).map((entry) => entry.userId)).toEqual([
      classTwo.user.id,
      classTen.user.id,
      groupOnly.user.id,
      individual.user.id,
    ]);
  });

  it("keeps disabled mapped students visible without changing authorization semantics", async () => {
    await useTemporaryDatabase();
    const disabled = await smartschoolUser("disabled", "Dina Disabled", "Dina", "Disabled", [["class-5", "5WEWI6"]]);
    await createLearningSpaceGroupMapping({ learningSpaceId: "space-5", provider: "smartschool", externalGroupId: "class-5", externalGroupName: "5WEWI6" });
    await (await import("./user-management")).updateManagedUserStatus(disabled.user.id, "disabled");

    expect(await listLearningSpaceStudentRoster("space-5")).toEqual([
      expect.objectContaining({ userId: disabled.user.id, status: "disabled", groupDerivedAccess: true }),
    ]);
    expect(await getAccessibleLearningSpaceIds({ ...disabled.user, status: "disabled" })).toEqual([]);
  });
});

async function smartschoolUser(
  subject: string,
  displayName: string,
  firstName: string,
  lastName: string,
  groups: Array<[string, string]>,
  role: "student" | "teacher" = "student",
) {
  const login = await findOrCreateExternalUser({
    provider: "smartschool",
    providerSubject: subject,
    providerPlatform: "https://school.smartschool.be",
    displayName,
    firstName,
    lastName,
  });
  if (role === "teacher") await (await import("./user-management")).updateManagedUserRole(login.user.id, "teacher");
  await replaceExternalIdentityGroups(login.identity.id, groups.map(([externalGroupId, externalGroupName]) => ({
    provider: "smartschool",
    externalGroupId,
    externalGroupName,
  })));
  return login;
}

async function useTemporaryDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-student-roster-"));
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
