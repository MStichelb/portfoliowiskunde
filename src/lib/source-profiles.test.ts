import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import { createLearningSpace } from "./repositories";
import {
  BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
  BUILT_IN_DEFAULT_SOURCE_PROFILE_ID,
  parseSourceProfileConfig,
  parseStoredSourceProfileConfig,
} from "./source-profile-config";
import {
  canDeleteSourceProfile,
  ensureBuiltInDefaultSourceProfile,
  getActiveSourceProfileForLearningSpace,
  getSourceProfileConfig,
} from "./source-profiles";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("source profile config", () => {
  it("accepts the built-in V1 config through the typed parser", () => {
    expect(parseSourceProfileConfig(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG)).toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
  });

  it("rejects unknown versions and malformed stored config safely", () => {
    expect(() => parseSourceProfileConfig({ configVersion: 2, scanner: { convention: "legacy_portfolio_v1" } })).toThrow();
    expect(() => parseSourceProfileConfig({ configVersion: 1, scanner: {} })).toThrow();
    expect(() => parseStoredSourceProfileConfig(1, "not-json")).toThrow();
    expect(() => parseStoredSourceProfileConfig(2, JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG))).toThrow();
  });
});

describe("source profile foundation", () => {
  it("creates exactly one built-in default and assigns every fresh LearningSpace", async () => {
    const database = await useFreshDatabase("source-profile-fresh-");

    expect((await database.execute("SELECT id, type, management_learning_space_id FROM source_profiles")).rows).toEqual([
      expect.objectContaining({ id: BUILT_IN_DEFAULT_SOURCE_PROFILE_ID, type: "built_in", management_learning_space_id: null }),
    ]);
    const assignments = (await database.execute("SELECT learning_space_id, source_profile_id FROM learning_space_source_profiles ORDER BY learning_space_id")).rows;
    expect(assignments).toHaveLength(2);
    expect(assignments.every((row) => row.source_profile_id === BUILT_IN_DEFAULT_SOURCE_PROFILE_ID)).toBe(true);
  });

  it("bootstraps idempotently and does not duplicate the default or assignments", async () => {
    const database = await useFreshDatabase("source-profile-bootstrap-");

    await ensureBuiltInDefaultSourceProfile();
    await database.execute("DELETE FROM learning_space_source_profiles WHERE learning_space_id = 'space-5'");
    await ensureBuiltInDefaultSourceProfile();

    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM source_profiles")).rows[0].count)).toBe(1);
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM learning_space_source_profiles")).rows[0].count)).toBe(2);
  });

  it("assigns the default to a newly created LearningSpace and resolves typed config", async () => {
    await useFreshDatabase("source-profile-created-space-");
    const space = await createLearningSpace({
      name: "Nieuwe leeromgeving",
      slug: "nieuwe-leeromgeving",
      shortLabel: "Nieuw",
      sortOrder: 70,
      sourceType: "local",
      localSourcePath: null,
    });

    const profile = await getActiveSourceProfileForLearningSpace(space.id);
    expect(profile).toMatchObject({ id: BUILT_IN_DEFAULT_SOURCE_PROFILE_ID, type: "built_in", name: "Standaard portfolio" });
    expect(profile && getSourceProfileConfig(profile)).toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
  });

  it("marks only custom profiles as deletable and protects the assigned built-in profile relationally", async () => {
    const database = await useFreshDatabase("source-profile-delete-");
    const profile = await getActiveSourceProfileForLearningSpace("space-5");

    expect(profile && canDeleteSourceProfile(profile)).toBe(false);
    expect(canDeleteSourceProfile({ type: "custom" })).toBe(true);
    await expect(database.execute({ sql: "DELETE FROM source_profiles WHERE id = ?", args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID] })).rejects.toThrow();
  });

  it("upgrades existing spaces without changing source connections or portfolio metadata", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "source-profile-upgrade-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 33)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-10T08:00:00.000Z"] },
      ], "write");
    }
    await legacy.execute("UPDATE learning_space_sources SET local_source_path = 'D:/bestaande-bron', last_validation_status = 'valid' WHERE id = 'space-6:primary'");
    await legacy.execute(`INSERT INTO portfolios
      (id, code, portfolio_code, learning_space_id, title, relative_path, is_indexed, indexed_at, custom_text)
      VALUES ('profile-portfolio', 'space-6:1', '1', 'space-6', 'Bestaande titel', 'Portfolio 1 - Bestaande titel', 1,
        '2026-09-10T08:00:00.000Z', 'Bestaande metadata')`);
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();

    expect((await upgraded.execute("SELECT local_source_path, last_validation_status FROM learning_space_sources WHERE id = 'space-6:primary'")).rows[0]).toMatchObject({
      local_source_path: "D:/bestaande-bron",
      last_validation_status: "valid",
    });
    expect((await upgraded.execute("SELECT title, custom_text FROM portfolios WHERE id = 'profile-portfolio'")).rows[0]).toMatchObject({
      title: "Bestaande titel",
      custom_text: "Bestaande metadata",
    });
    expect((await getActiveSourceProfileForLearningSpace("space-6"))?.id).toBe(BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);
  });
});

async function useFreshDatabase(prefix: string) {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  return getDatabase();
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
