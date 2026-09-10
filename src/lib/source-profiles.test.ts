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
  it("accepts the built-in V1 config through the shared typed parser", () => {
    expect(parseSourceProfileConfig(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG)).toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
  });

  it("rejects unknown versions and malformed stored config safely", () => {
    expect(() => parseSourceProfileConfig({ configVersion: 2, scanner: { convention: "legacy_portfolio_v1" } })).toThrow();
    expect(() => parseSourceProfileConfig({ configVersion: 1, scanner: {} })).toThrow();
    expect(() => parseStoredSourceProfileConfig(1, "not-json")).toThrow();
    expect(() => parseStoredSourceProfileConfig(2, JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG))).toThrow();
  });
});

describe("concrete source profile foundation", () => {
  it("keeps one technical fallback while assigning distinct custom snapshots on a fresh database", async () => {
    const database = await useFreshDatabase("source-profile-fresh-");
    const fallback = await database.execute({ sql: "SELECT type, management_learning_space_id FROM source_profiles WHERE id = ?", args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID] });
    const assignments = (await database.execute(`SELECT learning_space_source_profiles.learning_space_id, source_profiles.*
      FROM learning_space_source_profiles JOIN source_profiles ON source_profiles.id = learning_space_source_profiles.source_profile_id
      ORDER BY learning_space_source_profiles.learning_space_id`)).rows;

    expect(fallback.rows[0]).toMatchObject({ type: "built_in", management_learning_space_id: null });
    expect(assignments).toHaveLength(2);
    expect(new Set(assignments.map((row) => row.id)).size).toBe(2);
    expect(assignments.every((row) => row.type === "custom" && row.management_learning_space_id === row.learning_space_id)).toBe(true);
    expect(assignments.every((row) => row.config_json === JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG))).toBe(true);
  });

  it("bootstraps only the technical fallback idempotently and does not reassign LearningSpaces", async () => {
    const database = await useFreshDatabase("source-profile-bootstrap-");
    const before = (await database.execute("SELECT * FROM learning_space_source_profiles ORDER BY learning_space_id")).rows;

    await database.execute({ sql: "DELETE FROM source_profiles WHERE id = ?", args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID] });
    await ensureBuiltInDefaultSourceProfile();
    await ensureBuiltInDefaultSourceProfile();

    expect(Number((await database.execute({ sql: "SELECT COUNT(*) AS count FROM source_profiles WHERE id = ?", args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID] })).rows[0].count)).toBe(1);
    expect((await database.execute("SELECT * FROM learning_space_source_profiles ORDER BY learning_space_id")).rows).toEqual(before);
  });

  it("gives a newly created LearningSpace its own typed custom snapshot", async () => {
    await useFreshDatabase("source-profile-created-space-");
    const space = await createLearningSpace({
      name: "Nieuwe leeromgeving", slug: "nieuwe-leeromgeving", shortLabel: "Nieuw", sortOrder: 70, sourceType: "local", localSourcePath: null,
    });

    const profile = await getActiveSourceProfileForLearningSpace(space.id);
    expect(profile).toMatchObject({ type: "custom", name: "Standaard portfolio", managementLearningSpaceId: space.id });
    expect(profile?.id).not.toBe(BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);
    expect(profile && getSourceProfileConfig(profile)).toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
  });

  it("keeps the fallback immutable in application semantics", async () => {
    await useFreshDatabase("source-profile-delete-");
    expect(canDeleteSourceProfile({ type: "built_in" })).toBe(false);
    expect(canDeleteSourceProfile({ type: "custom" })).toBe(true);
  });

  it("upgrades existing spaces to snapshots without changing source connections or portfolio metadata", async () => {
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
      local_source_path: "D:/bestaande-bron", last_validation_status: "valid",
    });
    expect((await upgraded.execute("SELECT title, custom_text FROM portfolios WHERE id = 'profile-portfolio'")).rows[0]).toMatchObject({
      title: "Bestaande titel", custom_text: "Bestaande metadata",
    });
    expect(await getActiveSourceProfileForLearningSpace("space-6")).toMatchObject({ type: "custom", managementLearningSpaceId: "space-6" });
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
