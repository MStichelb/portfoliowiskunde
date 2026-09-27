import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getAccessibleLearningSpaceIds } from "./authorization";
import { getDatabase, resetDatabaseForTests } from "./database";
import { createUser } from "./identity";
import { getLearningSpaces } from "./repositories";
import { upsertManagedMembership } from "./user-management";
import { applyUserLearningSpaceOrder, getUserLearningSpacePreferences, orderLearningSpacesForUser, saveUserLearningSpaceOrder } from "./user-learning-space-order";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("personal LearningSpace ordering", () => {
  it("uses stable global fallback ordering when no personal preference exists", () => {
    const spaces = [space("b", "Beta", 20), space("c", "Alpha", 20), space("a", "Alpha", 10)];

    expect(applyUserLearningSpaceOrder(spaces, new Map()).map((item) => item.id)).toEqual(["a", "c", "b"]);
  });

  it("puts ranked spaces first and leaves newly accessible unranked spaces at the fallback-ordered bottom", () => {
    const spaces = [space("first", "Eerste", 10), space("new", "Nieuw", 5), space("preferred", "Voorkeur", 30)];

    expect(applyUserLearningSpaceOrder(spaces, new Map([["preferred", 10]])).map((item) => item.id))
      .toEqual(["preferred", "new", "first"]);
  });

  it("stores normalized orders per user without changing global LearningSpace sort values", async () => {
    await useTemporaryDatabase();
    const firstUser = await createUser({ displayName: "Eerste", role: "teacher" });
    const secondUser = await createUser({ displayName: "Tweede", role: "teacher" });
    const spaces = await getLearningSpaces(true);
    const globalBefore = await globalSortOrders();

    await saveUserLearningSpaceOrder(firstUser.id, ["space-6", "space-5"]);
    await saveUserLearningSpaceOrder(secondUser.id, ["space-5", "space-6"]);

    expect(await getUserLearningSpacePreferences(firstUser.id)).toEqual(new Map([["space-6", 10], ["space-5", 20]]));
    expect((await orderLearningSpacesForUser(firstUser.id, spaces)).map((item) => item.id)).toEqual(["space-6", "space-5"]);
    expect((await orderLearningSpacesForUser(secondUser.id, spaces)).map((item) => item.id)).toEqual(["space-5", "space-6"]);
    expect(await globalSortOrders()).toEqual(globalBefore);
  });

  it("ignores stale preferences when deriving access and never grants access", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    await upsertManagedMembership("space-5", teacher.id, "owner");
    await saveUserLearningSpaceOrder(teacher.id, ["space-6", "space-5"]);

    expect(await getAccessibleLearningSpaceIds(teacher)).toEqual(["space-5"]);
  });
});

function space(id: string, name: string, sortOrder: number) {
  return { id, name, sortOrder };
}

async function useTemporaryDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "learning-space-order-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await getDatabase();
}

async function globalSortOrders(): Promise<Array<[string, number]>> {
  const rows = (await (await getDatabase()).execute("SELECT id, sort_order FROM learning_spaces ORDER BY id")).rows;
  return rows.map((row) => [String(row.id), Number(row.sort_order)]);
}

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
