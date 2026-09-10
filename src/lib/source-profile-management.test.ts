import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuthorizationError } from "./authorization";
import { getDatabase, resetDatabaseForTests } from "./database";
import { createUser, type AppUser } from "./identity";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, BUILT_IN_DEFAULT_SOURCE_PROFILE_ID } from "./source-profile-config";
import {
  copyActiveSourceProfile,
  createOwnSourceProfile,
  getActiveSourceProfileForLearningSpace,
  getSourceProfileAdminModel,
  renameSourceProfile,
  switchActiveSourceProfile,
} from "./source-profiles";
import { setIndividualLearningSpaceAccess, upsertManagedMembership } from "./user-management";

let temporaryDirectory: string | undefined;
let actors: Record<"owner" | "editor" | "viewer" | "student" | "superadmin" | "managerBoth", AppUser>;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "source-profile-management-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  actors = {
    owner: await createUser({ displayName: "Olivia Owner", role: "teacher" }),
    editor: await createUser({ displayName: "Elias Editor", role: "teacher" }),
    viewer: await createUser({ displayName: "Vera Viewer", role: "teacher" }),
    student: await createUser({ displayName: "Sam Student", role: "student" }),
    superadmin: await createUser({ displayName: "Admin", role: "superadmin" }),
    managerBoth: await createUser({ displayName: "Mira Manager", role: "teacher" }),
  };
  await upsertManagedMembership("space-5", actors.owner.id, "owner");
  await upsertManagedMembership("space-5", actors.editor.id, "editor");
  await upsertManagedMembership("space-5", actors.managerBoth.id, "owner");
  await upsertManagedMembership("space-6", actors.managerBoth.id, "editor");
  await setIndividualLearningSpaceAccess(actors.viewer.id, "space-5", true);
  await setIndividualLearningSpaceAccess(actors.student.id, "space-5", true);
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("source profile management", () => {
  it("shows the built-in profile and scopes available profiles to manageable LearningSpaces", async () => {
    const spaceSixProfile = await createOwnSourceProfile(actors.managerBoth, "space-6");

    const ownerModel = await getSourceProfileAdminModel(actors.owner, "space-5");
    expect(ownerModel.activeProfile).toMatchObject({ id: BUILT_IN_DEFAULT_SOURCE_PROFILE_ID, type: "built_in", name: "Standaard portfolio" });
    expect(ownerModel.availableProfiles.map((profile) => profile.id)).not.toContain(spaceSixProfile.id);
    expect(ownerModel.copySources).toEqual([]);

    const sharedManagerModel = await getSourceProfileAdminModel(actors.managerBoth, "space-5");
    expect(sharedManagerModel.availableProfiles).toContainEqual(expect.objectContaining({
      id: spaceSixProfile.id,
      managementLearningSpaceShortLabel: "6",
    }));
    expect(sharedManagerModel.copySources).toContainEqual(expect.objectContaining({
      learningSpaceId: "space-6",
      profile: expect.objectContaining({ id: spaceSixProfile.id }),
    }));
  });

  it("creates an independent custom snapshot with a new id and activates it", async () => {
    const custom = await createOwnSourceProfile(actors.owner, "space-5");
    const builtIn = (await getDatabase()).execute({ sql: "SELECT name, config_json FROM source_profiles WHERE id = ?", args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID] });

    expect(custom).toMatchObject({ type: "custom", name: "Eigen profiel", managementLearningSpaceId: "space-5" });
    expect(custom.id).not.toBe(BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);
    expect(custom.config).toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(custom.id);
    expect((await builtIn).rows[0]).toMatchObject({ name: "Standaard portfolio", config_json: JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG) });
  });

  it("copies another managed space's active profile as an independent target-owned row", async () => {
    const source = await createOwnSourceProfile(actors.managerBoth, "space-6");
    await renameSourceProfile(actors.managerBoth, "space-6", source.id, "Profiel zes");
    const copy = await copyActiveSourceProfile(actors.managerBoth, "space-5", "space-6");

    expect(copy).toMatchObject({ name: "Kopie van Profiel zes", managementLearningSpaceId: "space-5", config: source.config });
    expect(copy.id).not.toBe(source.id);
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(copy.id);

    await renameSourceProfile(actors.managerBoth, "space-5", copy.id, "Mijn onafhankelijke kopie");
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.name).toBe("Mijn onafhankelijke kopie");
    expect((await getActiveSourceProfileForLearningSpace("space-6"))?.name).toBe("Profiel zes");
  });

  it.each(["owner", "editor", "superadmin"] as const)("allows a %s to switch an allowed profile", async (actorRole) => {
    const custom = await createOwnSourceProfile(actors.owner, "space-5");
    await switchActiveSourceProfile(actors[actorRole], "space-5", BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);
    await switchActiveSourceProfile(actors[actorRole], "space-5", custom.id);
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(custom.id);
  });

  it.each(["viewer", "student"] as const)("rejects a %s mutation", async (actorRole) => {
    await expect(switchActiveSourceProfile(actors[actorRole], "space-5", BUILT_IN_DEFAULT_SOURCE_PROFILE_ID)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(createOwnSourceProfile(actors[actorRole], "space-5")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(copyActiveSourceProfile(actors[actorRole], "space-5", "space-6")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("blocks unmanaged custom profiles and manipulated profile ids", async () => {
    const foreign = await createOwnSourceProfile(actors.superadmin, "space-6");
    await expect(switchActiveSourceProfile(actors.owner, "space-5", foreign.id)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(copyActiveSourceProfile(actors.owner, "space-5", "space-6")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(switchActiveSourceProfile(actors.owner, "space-5", "source-profile-does-not-exist")).rejects.toBeInstanceOf(AuthorizationError);
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);
  });

  it("renames only active custom profiles with a non-empty name of at most 80 characters", async () => {
    const custom = await createOwnSourceProfile(actors.editor, "space-5");
    await renameSourceProfile(actors.editor, "space-5", custom.id, "  Eigen indeling  ");
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.name).toBe("Eigen indeling");
    await expect(renameSourceProfile(actors.owner, "space-5", custom.id, " ")).rejects.toThrow("Geef het bronprofiel een naam");
    await expect(renameSourceProfile(actors.owner, "space-5", custom.id, "a".repeat(81))).rejects.toThrow("maximaal 80");
    await switchActiveSourceProfile(actors.owner, "space-5", BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);
    await expect(renameSourceProfile(actors.owner, "space-5", BUILT_IN_DEFAULT_SOURCE_PROFILE_ID, "Gewijzigd")).rejects.toThrow("ingebouwde bronprofiel");
    await expect(renameSourceProfile(actors.owner, "space-5", custom.id, "Niet actief")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects malformed and unknown config versions without changing the active assignment", async () => {
    const database = await getDatabase();
    await insertRawCustom("malformed", 1, JSON.stringify({ configVersion: 1, scanner: {} }));
    await insertRawCustom("unknown", 2, JSON.stringify({ configVersion: 2, scanner: { convention: "legacy_portfolio_v1" } }));

    const model = await getSourceProfileAdminModel(actors.owner, "space-5");
    expect(model.availableProfiles.map((profile) => profile.id)).not.toContain("malformed");
    expect(model.availableProfiles.map((profile) => profile.id)).not.toContain("unknown");

    await expect(switchActiveSourceProfile(actors.owner, "space-5", "malformed")).rejects.toThrow();
    await expect(switchActiveSourceProfile(actors.owner, "space-5", "unknown")).rejects.toThrow();
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);

    await database.execute("UPDATE learning_space_source_profiles SET source_profile_id = 'malformed' WHERE learning_space_id = 'space-6'");
    await expect(copyActiveSourceProfile(actors.managerBoth, "space-5", "space-6")).rejects.toThrow();
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);
  });

  it("changes only the profile assignment and never source or indexed data", async () => {
    const database = await getDatabase();
    const custom = await createOwnSourceProfile(actors.owner, "space-5");
    const beforeSource = (await database.execute("SELECT * FROM learning_space_sources WHERE learning_space_id = 'space-5' ORDER BY id")).rows;
    const beforePortfolios = (await database.execute("SELECT * FROM portfolios WHERE learning_space_id = 'space-5' ORDER BY id")).rows;

    await switchActiveSourceProfile(actors.owner, "space-5", BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);

    expect((await database.execute("SELECT * FROM learning_space_sources WHERE learning_space_id = 'space-5' ORDER BY id")).rows).toEqual(beforeSource);
    expect((await database.execute("SELECT * FROM portfolios WHERE learning_space_id = 'space-5' ORDER BY id")).rows).toEqual(beforePortfolios);
    expect((await database.execute("SELECT COUNT(*) AS count FROM sync_runs WHERE learning_space_id = 'space-5'")).rows[0].count).toBe(0);
    expect(custom.id).not.toBe((await getActiveSourceProfileForLearningSpace("space-5"))?.id);
  });
});

async function insertRawCustom(id: string, configVersion: number, configJson: string): Promise<void> {
  await (await getDatabase()).execute({
    sql: `INSERT INTO source_profiles
      (id, type, name, description, config_version, config_json, created_at, updated_at, management_learning_space_id)
      VALUES (?, 'custom', ?, NULL, ?, ?, ?, ?, 'space-5')`,
    args: [id, id, configVersion, configJson, "2026-09-10T00:00:00.000Z", "2026-09-10T00:00:00.000Z"],
  });
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
