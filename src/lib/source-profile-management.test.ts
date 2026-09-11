import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuthorizationError } from "./authorization";
import { getDatabase, resetDatabaseForTests } from "./database";
import { createUser, type AppUser } from "./identity";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, BUILT_IN_DEFAULT_SOURCE_PROFILE_ID } from "./source-profile-config";
import { cloneSourceProfileTemplateToLearningSpace, getDefaultSourceProfileTemplate } from "./source-profile-templates";
import {
  copyActiveSourceProfile,
  createOwnSourceProfile,
  getActiveSourceProfileForLearningSpace,
  getManagedSourceProfiles,
  getSourceProfileAdminModel,
  renameManagedSourceProfile,
  renameSourceProfile,
  sourceProfileUsageLabel,
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
  it("shows concrete profiles, hides the technical fallback and scopes choices to manageable LearningSpaces", async () => {
    const spaceSixProfile = (await getActiveSourceProfileForLearningSpace("space-6"))!;

    const ownerModel = await getSourceProfileAdminModel(actors.owner, "space-5");
    expect(ownerModel.activeProfile).toMatchObject({ type: "custom", name: "Standaard portfolio", managementLearningSpaceId: "space-5" });
    expect(ownerModel.availableProfiles.map((profile) => profile.id)).not.toContain(BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);
    await expect(switchActiveSourceProfile(actors.owner, "space-5", BUILT_IN_DEFAULT_SOURCE_PROFILE_ID)).rejects.toBeInstanceOf(AuthorizationError);
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

  it("builds current 0..n usage in bulk instead of presenting management context as usage", async () => {
    const database = await getDatabase();
    const profileFive = (await getActiveSourceProfileForLearningSpace("space-5"))!;
    const profileSix = (await getActiveSourceProfileForLearningSpace("space-6"))!;
    const execute = vi.spyOn(database, "execute");

    let profiles = await getManagedSourceProfiles(actors.managerBoth);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(profiles.find((profile) => profile.id === profileFive.id)).toMatchObject({
      usageCount: 1, isInactive: false, usages: [{ learningSpaceId: "space-5", learningSpaceShortLabel: "5" }],
    });

    await database.execute({
      sql: "UPDATE learning_space_source_profiles SET source_profile_id = ? WHERE learning_space_id = 'space-5'",
      args: [profileSix.id],
    });
    profiles = await getManagedSourceProfiles(actors.managerBoth);
    expect(profiles[0]).toMatchObject({ id: profileSix.id, usageCount: 2, isInactive: false });
    expect(profiles.find((profile) => profile.id === profileFive.id)).toMatchObject({
      managementLearningSpaceId: "space-5", usageCount: 0, isInactive: true, usages: [],
    });
    expect(profiles.map((profile) => profile.id)).toContain(profileFive.id);
    expect((await getSourceProfileAdminModel(actors.managerBoth, "space-5")).availableProfiles).toContainEqual(
      expect.objectContaining({ id: profileFive.id, usageCount: 0, isInactive: true }),
    );
  });

  it("formats at most three current usage labels and a remaining count", () => {
    const usages = ["4NW1", "5WET", "6WIS", "EXTRA"].map((learningSpaceShortLabel, index) => ({
      learningSpaceId: `space-${index}`, learningSpaceName: `Ruimte ${index}`, learningSpaceShortLabel,
    }));
    expect(sourceProfileUsageLabel([])).toBe("Inactief");
    expect(sourceProfileUsageLabel(usages.slice(0, 1))).toBe("4NW1");
    expect(sourceProfileUsageLabel(usages.slice(0, 3))).toBe("4NW1, 5WET, 6WIS");
    expect(sourceProfileUsageLabel(usages)).toBe("4NW1, 5WET, 6WIS +1");
  });

  it("creates an independent custom snapshot with a new id and activates it", async () => {
    await (await getDatabase()).execute({
      sql: "UPDATE learning_space_source_profiles SET source_profile_id = ? WHERE learning_space_id = 'space-5'",
      args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID],
    });
    const custom = await createOwnSourceProfile(actors.owner, "space-5");
    const builtIn = (await getDatabase()).execute({ sql: "SELECT name, config_json FROM source_profiles WHERE id = ?", args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID] });

    expect(custom).toMatchObject({ type: "custom", name: "Eigen profiel", managementLearningSpaceId: "space-5" });
    expect(custom.id).not.toBe(BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);
    expect(custom.config).toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(custom.id);
    expect((await builtIn).rows[0]).toMatchObject({ name: "Standaard portfolio", config_json: JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG) });
  });

  it("copies another managed space's active profile as an independent target-owned row", async () => {
    const source = (await getActiveSourceProfileForLearningSpace("space-6"))!;
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
    const original = (await getActiveSourceProfileForLearningSpace("space-5"))!;
    const second = await createAdditionalProfile("space-5");
    await switchActiveSourceProfile(actors[actorRole], "space-5", original.id);
    await switchActiveSourceProfile(actors[actorRole], "space-5", second.id);
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(second.id);
  });

  it.each(["viewer", "student"] as const)("rejects a %s mutation", async (actorRole) => {
    await expect(switchActiveSourceProfile(actors[actorRole], "space-5", BUILT_IN_DEFAULT_SOURCE_PROFILE_ID)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(createOwnSourceProfile(actors[actorRole], "space-5")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(copyActiveSourceProfile(actors[actorRole], "space-5", "space-6")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("blocks unmanaged custom profiles and manipulated profile ids", async () => {
    const foreign = (await getActiveSourceProfileForLearningSpace("space-6"))!;
    const originalId = (await getActiveSourceProfileForLearningSpace("space-5"))!.id;
    await expect(switchActiveSourceProfile(actors.owner, "space-5", foreign.id)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(copyActiveSourceProfile(actors.owner, "space-5", "space-6")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(switchActiveSourceProfile(actors.owner, "space-5", "source-profile-does-not-exist")).rejects.toBeInstanceOf(AuthorizationError);
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(originalId);
  });

  it("renames only active custom profiles with a non-empty name of at most 80 characters", async () => {
    const custom = (await getActiveSourceProfileForLearningSpace("space-5"))!;
    await renameSourceProfile(actors.editor, "space-5", custom.id, "  Eigen indeling  ");
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.name).toBe("Eigen indeling");
    await expect(renameSourceProfile(actors.owner, "space-5", custom.id, " ")).rejects.toThrow("Geef het bronprofiel een naam");
    await expect(renameSourceProfile(actors.owner, "space-5", custom.id, "a".repeat(81))).rejects.toThrow("maximaal 80");
    await expect(renameSourceProfile(actors.owner, "space-5", BUILT_IN_DEFAULT_SOURCE_PROFILE_ID, "Gewijzigd")).rejects.toBeInstanceOf(AuthorizationError);
    await createAdditionalProfile("space-5");
    await expect(renameSourceProfile(actors.owner, "space-5", custom.id, "Niet actief")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("enforces normalized name uniqueness only inside the same management context", async () => {
    const profileFive = (await getActiveSourceProfileForLearningSpace("space-5"))!;
    const profileSix = (await getActiveSourceProfileForLearningSpace("space-6"))!;
    const secondFive = await createAdditionalProfile("space-5", "Tweede profiel");

    await renameManagedSourceProfile(actors.managerBoth, profileFive.id, "Eigen portfolio");
    await renameManagedSourceProfile(actors.managerBoth, profileSix.id, " eigen PORTFOLIO ");
    await expect(renameManagedSourceProfile(actors.managerBoth, secondFive.id, " EIGEN portfolio ")).rejects.toThrow("bestaat al");
    await expect(renameManagedSourceProfile(actors.owner, profileSix.id, "Niet toegestaan")).rejects.toBeInstanceOf(AuthorizationError);
    expect((await getActiveSourceProfileForLearningSpace("space-6"))?.name).toBe("eigen PORTFOLIO");
  });

  it("rejects malformed and unknown config versions without changing the active assignment", async () => {
    const database = await getDatabase();
    const originalId = (await getActiveSourceProfileForLearningSpace("space-5"))!.id;
    await insertRawCustom("malformed", 1, JSON.stringify({ configVersion: 1, scanner: {} }));
    await insertRawCustom("unknown", 2, JSON.stringify({ configVersion: 2, scanner: { convention: "legacy_portfolio_v1" } }));

    const model = await getSourceProfileAdminModel(actors.owner, "space-5");
    expect(model.availableProfiles.map((profile) => profile.id)).not.toContain("malformed");
    expect(model.availableProfiles.map((profile) => profile.id)).not.toContain("unknown");

    await expect(switchActiveSourceProfile(actors.owner, "space-5", "malformed")).rejects.toThrow();
    await expect(switchActiveSourceProfile(actors.owner, "space-5", "unknown")).rejects.toThrow();
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(originalId);

    await database.execute("UPDATE learning_space_source_profiles SET source_profile_id = 'malformed' WHERE learning_space_id = 'space-6'");
    await expect(copyActiveSourceProfile(actors.managerBoth, "space-5", "space-6")).rejects.toThrow();
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(originalId);
  });

  it("changes only the profile assignment and never source or indexed data", async () => {
    const database = await getDatabase();
    const original = (await getActiveSourceProfileForLearningSpace("space-5"))!;
    const custom = await createAdditionalProfile("space-5");
    const beforeSource = (await database.execute("SELECT * FROM learning_space_sources WHERE learning_space_id = 'space-5' ORDER BY id")).rows;
    const beforePortfolios = (await database.execute("SELECT * FROM portfolios WHERE learning_space_id = 'space-5' ORDER BY id")).rows;

    await switchActiveSourceProfile(actors.owner, "space-5", original.id);

    expect((await database.execute("SELECT * FROM learning_space_sources WHERE learning_space_id = 'space-5' ORDER BY id")).rows).toEqual(beforeSource);
    expect((await database.execute("SELECT * FROM portfolios WHERE learning_space_id = 'space-5' ORDER BY id")).rows).toEqual(beforePortfolios);
    expect((await database.execute("SELECT COUNT(*) AS count FROM sync_runs WHERE learning_space_id = 'space-5'")).rows[0].count).toBe(0);
    expect(custom.id).not.toBe((await getActiveSourceProfileForLearningSpace("space-5"))?.id);
  });
});

async function createAdditionalProfile(learningSpaceId: string, name = "Tweede profiel") {
  const template = await getDefaultSourceProfileTemplate();
  return cloneSourceProfileTemplateToLearningSpace({ ...template, name }, learningSpaceId);
}

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
