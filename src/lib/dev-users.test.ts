import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { DEV_DUMMY_ACCOUNTS, seedLocalDevUsers } from "./dev-users";
import { isClassGroupName, listKnownExternalGroups } from "./user-management";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("local development dummy users", () => {
  it("seeds six fixed users and two classified Smartschool group snapshots idempotently", async () => {
    await useTemporaryDatabase();

    await seedLocalDevUsers();
    await seedLocalDevUsers();

    const database = await getDatabase();
    const users = await database.execute("SELECT id, role, status FROM users WHERE id LIKE 'dev-dummy-%' ORDER BY id");
    const identities = await database.execute("SELECT id, user_id FROM external_identities WHERE id LIKE 'dev-dummy-%'");
    const snapshots = await database.execute("SELECT external_group_id, external_group_name FROM external_identity_groups WHERE identity_id LIKE 'dev-dummy-%' ORDER BY external_group_id");
    const memberships = await database.execute("SELECT user_id FROM learning_space_members WHERE user_id LIKE 'dev-dummy-%'");
    const access = await database.execute("SELECT user_id FROM individual_learning_space_access WHERE user_id LIKE 'dev-dummy-%'");

    expect(users.rows).toHaveLength(6);
    expect(users.rows.filter((row) => row.role === "teacher")).toHaveLength(3);
    expect(users.rows.filter((row) => row.role === "student")).toHaveLength(3);
    expect(users.rows.every((row) => row.status === "active")).toBe(true);
    expect(identities.rows).toHaveLength(6);
    expect(snapshots.rows).toEqual([
      expect.objectContaining({ external_group_id: "dev-group-5wewi6", external_group_name: "5WEWI6" }),
      expect.objectContaining({ external_group_id: "dev-group-uitdaging", external_group_name: "Uitdaging" }),
    ]);
    expect(memberships.rows).toHaveLength(0);
    expect(access.rows).toHaveLength(0);
    expect(DEV_DUMMY_ACCOUNTS.every((account) => users.rows.some((row) => row.id === account.id))).toBe(true);

    const groups = await listKnownExternalGroups();
    expect(isClassGroupName(groups.find((group) => group.externalGroupId === "dev-group-5wewi6")!.externalGroupName!)).toBe(true);
    expect(isClassGroupName(groups.find((group) => group.externalGroupId === "dev-group-uitdaging")!.externalGroupName!)).toBe(false);
  });

  it("refuses production and remote database configurations before opening a database", async () => {
    await expect(seedLocalDevUsers({ NODE_ENV: "production" })).rejects.toThrow("nooit in production");
    await expect(seedLocalDevUsers({ NODE_ENV: "development", DATABASE_URL: "postgresql://production.example/app" })).rejects.toThrow("lokale SQLite");
    await expect(seedLocalDevUsers({ NODE_ENV: "development", TURSO_DATABASE_URL: "libsql://remote.example" })).rejects.toThrow("lokale SQLite");
    await expect(seedLocalDevUsers({ NODE_ENV: "development", DATABASE_URL: "file://remote-server/app.db" })).rejects.toThrow("lokale SQLite");
  });
});

async function useTemporaryDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-dev-users-"));
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
