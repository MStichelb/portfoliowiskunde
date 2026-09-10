import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { canManageSourceProfileTemplates, requireSourceProfileTemplateManagement } from "./authorization";
import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import { createUser, type AppUser } from "./identity";
import { createLearningSpace, getAdminLearningSpaceBySlug } from "./repositories";
import {
  BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
  BUILT_IN_DEFAULT_SOURCE_PROFILE_ID,
  INITIAL_SOURCE_PROFILE_TEMPLATE_ID,
} from "./source-profile-config";
import { getActiveSourceProfileForLearningSpace } from "./source-profiles";
import {
  cloneSourceProfileTemplateToLearningSpace,
  ensureInitialSourceProfileTemplate,
  getDefaultSourceProfileTemplate,
  getSourceProfileTemplateConfig,
  setDefaultSourceProfileTemplate,
} from "./source-profile-templates";

let temporaryDirectory: string | undefined;
let superadmin: AppUser;
let owner: AppUser;
let editor: AppUser;

beforeEach(async () => {
  await useFreshDatabase("source-profile-templates-");
  superadmin = await createUser({ displayName: "Admin", role: "superadmin" });
  owner = await createUser({ displayName: "Owner", role: "teacher" });
  editor = await createUser({ displayName: "Editor", role: "teacher" });
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("global source profile templates", () => {
  it("bootstraps one typed default template with a relational singleton reference", async () => {
    const database = await getDatabase();
    const template = await getDefaultSourceProfileTemplate();

    expect(template).toMatchObject({ id: INITIAL_SOURCE_PROFILE_TEMPLATE_ID, name: "Standaard portfolio" });
    expect(getSourceProfileTemplateConfig(template)).toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    expect((await database.execute("SELECT * FROM source_profile_template_defaults")).rows).toEqual([
      expect.objectContaining({ singleton_id: 1, default_template_id: INITIAL_SOURCE_PROFILE_TEMPLATE_ID }),
    ]);
    await expect(database.execute({
      sql: "INSERT INTO source_profile_template_defaults (singleton_id, default_template_id, updated_at) VALUES (2, ?, ?)",
      args: [INITIAL_SOURCE_PROFILE_TEMPLATE_ID, "2026-09-10T00:00:00.000Z"],
    })).rejects.toThrow();
  });

  it("keeps bootstrap idempotent without overwriting template data or a changed default", async () => {
    const database = await getDatabase();
    await insertTemplate("second-template", "Tweede sjabloon");
    await setDefaultSourceProfileTemplate(superadmin, "second-template");
    await database.execute({ sql: "UPDATE source_profile_templates SET name = 'Aangepast standaard' WHERE id = ?", args: [INITIAL_SOURCE_PROFILE_TEMPLATE_ID] });

    await ensureInitialSourceProfileTemplate();
    await ensureInitialSourceProfileTemplate();

    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM source_profile_templates")).rows[0].count)).toBe(2);
    expect((await getDefaultSourceProfileTemplate()).id).toBe("second-template");
    expect((await database.execute({ sql: "SELECT name FROM source_profile_templates WHERE id = ?", args: [INITIAL_SOURCE_PROFILE_TEMPLATE_ID] })).rows[0].name).toBe("Aangepast standaard");
  });

  it("gives two new LearningSpaces distinct concrete snapshots of the current default", async () => {
    const first = await createLearningSpace(spaceInput("template-first"));
    const second = await createLearningSpace(spaceInput("template-second"));
    const firstProfile = (await getActiveSourceProfileForLearningSpace(first.id))!;
    const secondProfile = (await getActiveSourceProfileForLearningSpace(second.id))!;

    expect(firstProfile).toMatchObject({ type: "custom", managementLearningSpaceId: first.id, config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG });
    expect(secondProfile).toMatchObject({ type: "custom", managementLearningSpaceId: second.id, config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG });
    expect(firstProfile.id).not.toBe(secondProfile.id);
    expect(firstProfile.id).not.toBe(INITIAL_SOURCE_PROFILE_TEMPLATE_ID);
    expect(secondProfile.id).not.toBe(INITIAL_SOURCE_PROFILE_TEMPLATE_ID);
  });

  it("keeps template and concrete profile snapshots independent in both directions", async () => {
    const database = await getDatabase();
    const space = await createLearningSpace(spaceInput("template-independence"));
    const profile = (await getActiveSourceProfileForLearningSpace(space.id))!;
    const profileConfigBefore = (await database.execute({ sql: "SELECT config_json FROM source_profiles WHERE id = ?", args: [profile.id] })).rows[0].config_json;

    await database.execute({
      sql: "UPDATE source_profile_templates SET name = 'Nieuw template', config_json = ?, updated_at = ? WHERE id = ?",
      args: [JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, null, 2), "2026-09-11T00:00:00.000Z", INITIAL_SOURCE_PROFILE_TEMPLATE_ID],
    });
    expect(await getActiveSourceProfileForLearningSpace(space.id)).toMatchObject({ name: "Standaard portfolio", config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG });
    expect((await database.execute({ sql: "SELECT config_json FROM source_profiles WHERE id = ?", args: [profile.id] })).rows[0].config_json).toBe(profileConfigBefore);

    await database.execute({ sql: "UPDATE source_profiles SET name = 'Eigen concrete naam' WHERE id = ?", args: [profile.id] });
    expect((await getDefaultSourceProfileTemplate()).name).toBe("Nieuw template");

    const futureSpace = await createLearningSpace(spaceInput("template-after-change"));
    expect((await getActiveSourceProfileForLearningSpace(futureSpace.id))?.name).toBe("Nieuw template");
    expect((await getActiveSourceProfileForLearningSpace(space.id))?.name).toBe("Eigen concrete naam");
  });

  it("clones a server-resolved template as a fresh active concrete profile", async () => {
    const before = (await getActiveSourceProfileForLearningSpace("space-5"))!;
    const clone = await cloneSourceProfileTemplateToLearningSpace(await getDefaultSourceProfileTemplate(), "space-5");

    expect(clone).toMatchObject({ type: "custom", managementLearningSpaceId: "space-5", config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG });
    expect(clone.id).not.toBe(before.id);
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(clone.id);
  });

  it("provides a superadmin-only foundation for changing the default reference", async () => {
    await insertTemplate("second-template", "Tweede sjabloon");

    expect(canManageSourceProfileTemplates(superadmin)).toBe(true);
    expect(canManageSourceProfileTemplates(owner)).toBe(false);
    expect(canManageSourceProfileTemplates(editor)).toBe(false);
    expect(() => requireSourceProfileTemplateManagement(owner)).toThrow("Alleen een hoofdbeheerder");
    await expect(setDefaultSourceProfileTemplate(owner, "second-template")).rejects.toThrow("Alleen een hoofdbeheerder");
    await expect(setDefaultSourceProfileTemplate(editor, "second-template")).rejects.toThrow("Alleen een hoofdbeheerder");

    await setDefaultSourceProfileTemplate(superadmin, "second-template");
    expect((await getDefaultSourceProfileTemplate()).id).toBe("second-template");
  });

  it("fails creation safely when the default is missing, malformed or has an unknown version", async () => {
    const database = await getDatabase();
    await database.execute("DELETE FROM source_profile_template_defaults WHERE singleton_id = 1");
    await expect(createLearningSpace(spaceInput("missing-default"))).rejects.toThrow("geen geldig standaard-bronprofielsjabloon");
    await expect(getAdminLearningSpaceBySlug("missing-default")).resolves.toBeNull();

    await ensureInitialSourceProfileTemplate();
    await database.execute({
      sql: "UPDATE source_profile_templates SET config_json = ? WHERE id = ?",
      args: [JSON.stringify({ configVersion: 1, scanner: {} }), INITIAL_SOURCE_PROFILE_TEMPLATE_ID],
    });
    await expect(createLearningSpace(spaceInput("malformed-default"))).rejects.toThrow();
    await expect(getAdminLearningSpaceBySlug("malformed-default")).resolves.toBeNull();

    await database.execute({
      sql: "UPDATE source_profile_templates SET config_version = 2, config_json = ? WHERE id = ?",
      args: [JSON.stringify({ configVersion: 2, scanner: { convention: "legacy_portfolio_v1" } }), INITIAL_SOURCE_PROFILE_TEMPLATE_ID],
    });
    await expect(createLearningSpace(spaceInput("unknown-default"))).rejects.toThrow();
    await expect(getAdminLearningSpaceBySlug("unknown-default")).resolves.toBeNull();
  });
});

describe("migration 036", () => {
  it("migrates only built-in assignments and preserves existing custom profiles and LearningSpace data", async () => {
    resetDatabaseForTests();
    if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "source-profile-template-upgrade-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 35)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-10T08:00:00.000Z"] },
      ], "write");
    }
    await legacy.execute({
      sql: `INSERT INTO source_profiles
        (id, type, name, description, config_version, config_json, created_at, updated_at, management_learning_space_id)
        VALUES ('existing-custom', 'custom', 'Bestaand eigen profiel', 'Behouden', 1, ?, '2026-09-10T08:00:00.000Z', '2026-09-10T08:00:00.000Z', 'space-6')`,
      args: [JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG)],
    });
    await legacy.execute("UPDATE learning_space_source_profiles SET source_profile_id = 'existing-custom' WHERE learning_space_id = 'space-6'");
    await legacy.execute("UPDATE learning_space_sources SET local_source_path = 'D:/behouden' WHERE id = 'space-5:primary'");
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    const spaceFive = await getActiveSourceProfileForLearningSpace("space-5");
    const spaceSix = await getActiveSourceProfileForLearningSpace("space-6");

    expect(spaceFive).toMatchObject({ type: "custom", managementLearningSpaceId: "space-5", name: "Standaard portfolio" });
    expect(spaceFive?.id).not.toBe(BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);
    expect(spaceSix).toMatchObject({ id: "existing-custom", name: "Bestaand eigen profiel", description: "Behouden" });
    expect((await upgraded.execute("SELECT local_source_path FROM learning_space_sources WHERE id = 'space-5:primary'")).rows[0].local_source_path).toBe("D:/behouden");
    expect((await getDefaultSourceProfileTemplate()).id).toBe(INITIAL_SOURCE_PROFILE_TEMPLATE_ID);
  });
});

async function insertTemplate(id: string, name: string): Promise<void> {
  await (await getDatabase()).execute({
    sql: `INSERT INTO source_profile_templates (id, name, description, config_version, config_json, created_at, updated_at)
      VALUES (?, ?, NULL, 1, ?, ?, ?)`,
    args: [id, name, JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG), "2026-09-10T00:00:00.000Z", "2026-09-10T00:00:00.000Z"],
  });
}

function spaceInput(slug: string) {
  return { name: slug, slug, shortLabel: slug, sortOrder: 90, sourceType: "local" as const, localSourcePath: null };
}

async function useFreshDatabase(prefix: string): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await getDatabase();
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
