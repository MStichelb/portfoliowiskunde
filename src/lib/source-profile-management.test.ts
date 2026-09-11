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
  canCopySourceProfile,
  copySourceProfileToLearningSpace,
  createOwnSourceProfile,
  getActiveSourceProfileForLearningSpace,
  getManagedSourceProfiles,
  getSourceProfileAdminModel,
  getSourceProfileOverview,
  linkSourceProfileToLearningSpace,
  renameManagedSourceProfile,
  renameSourceProfile,
  sourceProfileUsageLabel,
  switchActiveSourceProfile,
} from "./source-profiles";
import { setIndividualLearningSpaceAccess, upsertManagedMembership } from "./user-management";

let temporaryDirectory: string | undefined;
let actors: Record<"owner" | "pureEditor" | "ownerEditor" | "viewer" | "student" | "superadmin", AppUser>;
let profileFiveId: string;
let profileSixId: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "source-profile-ownership-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  actors = {
    owner: await createUser({ displayName: "Olivia Owner", role: "teacher" }),
    pureEditor: await createUser({ displayName: "Elias Editor", role: "teacher" }),
    ownerEditor: await createUser({ displayName: "Mira Owner Editor", role: "teacher" }),
    viewer: await createUser({ displayName: "Vera Viewer", role: "teacher" }),
    student: await createUser({ displayName: "Sam Student", role: "student" }),
    superadmin: await createUser({ displayName: "Admin", role: "superadmin" }),
  };
  await upsertManagedMembership("space-5", actors.owner.id, "owner");
  await upsertManagedMembership("space-5", actors.pureEditor.id, "editor");
  await upsertManagedMembership("space-5", actors.ownerEditor.id, "editor");
  await upsertManagedMembership("space-6", actors.ownerEditor.id, "owner");
  await setIndividualLearningSpaceAccess(actors.viewer.id, "space-5", true);
  await setIndividualLearningSpaceAccess(actors.student.id, "space-5", true);
  const database = await getDatabase();
  await database.batch([
    { sql: "UPDATE source_profiles SET owner_user_id = ? WHERE management_learning_space_id = 'space-5'", args: [actors.owner.id] },
    { sql: "UPDATE source_profiles SET owner_user_id = ? WHERE management_learning_space_id = 'space-6'", args: [actors.ownerEditor.id] },
  ]);
  profileFiveId = (await getActiveSourceProfileForLearningSpace("space-5"))!.id;
  profileSixId = (await getActiveSourceProfileForLearningSpace("space-6"))!.id;
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("source profile ownership and access", () => {
  it("separates owned profiles from active foreign profiles exposed through editor usage", async () => {
    const inactiveOwned = await createProfile("space-5", actors.owner.id, "Inactief eigen profiel", false);
    const ownerOverview = await getSourceProfileOverview(actors.owner);
    expect(ownerOverview.ownedProfiles.map((profile) => profile.id)).toEqual(expect.arrayContaining([profileFiveId, inactiveOwned.id]));
    expect(ownerOverview.editorAccessibleActiveProfiles).toEqual([]);

    for (const editor of [actors.pureEditor, actors.ownerEditor]) {
      const overview = await getSourceProfileOverview(editor);
      expect(overview.editorAccessibleActiveProfiles).toContainEqual(expect.objectContaining({
        id: profileFiveId, ownerUserId: actors.owner.id, ownerName: "Olivia Owner", canRename: false, canLink: false,
      }));
      expect(overview.editorAccessibleActiveProfiles.map((profile) => profile.id)).not.toContain(inactiveOwned.id);
    }
    expect(await getSourceProfileOverview(actors.viewer)).toMatchObject({ ownedProfiles: [], editorAccessibleActiveProfiles: [], copyTargets: [] });
    expect((await getManagedSourceProfiles(actors.superadmin)).map((profile) => profile.id)).toEqual(expect.arrayContaining([profileFiveId, profileSixId, inactiveOwned.id]));
  });

  it("uses the same ownership model centrally and in the selector", async () => {
    const inactiveOwned = await createProfile("space-5", actors.owner.id, "Eigen reserve", false);
    const overview = await getSourceProfileOverview(actors.owner);
    const selector = await getSourceProfileAdminModel(actors.owner, "space-5");
    expect(selector.availableProfiles.map((profile) => profile.id)).toEqual(overview.ownedProfiles.map((profile) => profile.id));
    expect(selector.availableProfiles.map((profile) => profile.id)).toContain(inactiveOwned.id);
    expect(selector.availableProfiles.every((profile) => profile.ownerUserId === actors.owner.id)).toBe(true);
  });

  it("shows a contextual active profile to editors and derives copy capability from owner targets", async () => {
    const pureEditorModel = await getSourceProfileAdminModel(actors.pureEditor, "space-5");
    expect(pureEditorModel.activeProfile).toMatchObject({ id: profileFiveId, ownerName: "Olivia Owner", access: "editor", canCopy: false });
    expect(pureEditorModel.copyTargets).toEqual([]);
    expect(await canCopySourceProfile(actors.pureEditor, profileFiveId)).toBe(false);

    const ownerEditorModel = await getSourceProfileAdminModel(actors.ownerEditor, "space-5");
    expect(ownerEditorModel.activeProfile).toMatchObject({ id: profileFiveId, access: "editor", canCopy: true });
    expect(ownerEditorModel.copyTargets.map((target) => target.learningSpaceId)).toEqual(["space-6"]);
    expect(await canCopySourceProfile(actors.ownerEditor, profileFiveId)).toBe(true);
  });

  it("allows copying an accessible foreign profile only to an owner target and transfers ownership to the copier", async () => {
    await expect(copySourceProfileToLearningSpace(actors.pureEditor, profileFiveId, "space-5")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(copySourceProfileToLearningSpace(actors.ownerEditor, profileFiveId, "space-5")).rejects.toThrow("waarvan je eigenaar bent");

    const result = await copySourceProfileToLearningSpace(actors.ownerEditor, profileFiveId, "space-6");
    expect(result).toMatchObject({ activated: true, profile: { ownerUserId: actors.ownerEditor.id, managementLearningSpaceId: "space-6" } });
    expect((await getActiveSourceProfileForLearningSpace("space-6"))?.id).toBe(result.profile.id);
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(profileFiveId);
  });

  it("blocks foreign link, rename and selection while allowing the profile owner", async () => {
    await expect(linkSourceProfileToLearningSpace(actors.ownerEditor, profileFiveId, "space-6")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(renameManagedSourceProfile(actors.ownerEditor, profileFiveId, "Verboden")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(switchActiveSourceProfile(actors.ownerEditor, "space-6", profileFiveId)).rejects.toBeInstanceOf(AuthorizationError);

    const ownReserve = await createProfile("space-5", actors.owner.id, "Eigen alternatief", false);
    await linkSourceProfileToLearningSpace(actors.owner, ownReserve.id, "space-5");
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(ownReserve.id);
    await renameManagedSourceProfile(actors.owner, ownReserve.id, "Nieuwe eigen naam");
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.name).toBe("Nieuwe eigen naam");
  });

  it("keeps concrete names unique per owner and generates collision-safe copy names", async () => {
    await expect(createProfile("space-5", actors.owner.id, " standaard PORTFOLIO ", false)).rejects.toThrow("al een bronprofiel");
    const sameNameOtherOwner = await createProfile("space-6", actors.ownerEditor.id, "Standaard portfolio", false);
    expect(sameNameOtherOwner.name).toBe("Standaard portfolio");

    const first = await copySourceProfileToLearningSpace(actors.owner, profileFiveId, "space-5");
    await switchActiveSourceProfile(actors.owner, "space-5", profileFiveId);
    const second = await copySourceProfileToLearningSpace(actors.owner, profileFiveId, "space-5");
    expect(first.profile.name).toBe("Kopie van Standaard portfolio");
    expect(second.profile.name).toBe("Kopie van Standaard portfolio (2)");
    await expect(renameManagedSourceProfile(actors.owner, second.profile.id, ` ${first.profile.name.toUpperCase()} `)).rejects.toThrow("al een bronprofiel");
  });

  it("preserves shared usage and makes a split copy owned by the current user", async () => {
    await linkSourceProfileToLearningSpace(actors.superadmin, profileFiveId, "space-6");
    await expect(renameSourceProfile(actors.owner, "space-5", profileFiveId, "Alleen vijf")).rejects.toThrow("Kies of je");
    await renameSourceProfile(actors.owner, "space-5", profileFiveId, "Alleen vijf", "current");
    const split = (await getActiveSourceProfileForLearningSpace("space-5"))!;
    expect(split).toMatchObject({ name: "Alleen vijf", ownerUserId: actors.owner.id });
    expect((await getActiveSourceProfileForLearningSpace("space-6"))?.id).toBe(profileFiveId);
  });

  it("keeps visibility and usage reads bulk and independent", async () => {
    await createProfile("space-5", actors.owner.id, "Zulu", false);
    await createProfile("space-5", actors.owner.id, "Alfa", false);
    const database = await getDatabase();
    const execute = vi.spyOn(database, "execute");
    const profiles = await getManagedSourceProfiles(actors.owner);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(profiles.map((profile) => profile.name)).toEqual(["Standaard portfolio", "Alfa", "Zulu"]);
    expect(profiles.find((profile) => profile.id === profileFiveId)).toMatchObject({ usageCount: 1, isInactive: false });
  });

  it("rejects viewer/student access and malformed profile ids without changing assignments", async () => {
    for (const actor of [actors.viewer, actors.student]) {
      await expect(copySourceProfileToLearningSpace(actor, profileFiveId, "space-5")).rejects.toBeInstanceOf(AuthorizationError);
      await expect(renameManagedSourceProfile(actor, profileFiveId, "Verboden")).rejects.toBeInstanceOf(AuthorizationError);
    }
    await expect(getSourceProfileOverview(actors.student)).rejects.toBeInstanceOf(AuthorizationError);
    const disabledOwner = { ...actors.owner, status: "disabled" as const };
    await expect(copySourceProfileToLearningSpace(disabledOwner, profileFiveId, "space-5")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(renameManagedSourceProfile(disabledOwner, profileFiveId, "Verboden")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(linkSourceProfileToLearningSpace(actors.owner, "missing", "space-5")).rejects.toBeInstanceOf(AuthorizationError);
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(profileFiveId);
  });

  it("creates an owned profile from the technical fallback without touching indexed data", async () => {
    const database = await getDatabase();
    const portfoliosBefore = (await database.execute("SELECT * FROM portfolios ORDER BY id")).rows;
    await database.execute({ sql: "UPDATE learning_space_source_profiles SET source_profile_id = ? WHERE learning_space_id = 'space-5'", args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID] });
    const created = await createOwnSourceProfile(actors.owner, "space-5");
    expect(created).toMatchObject({ ownerUserId: actors.owner.id, config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG });
    expect((await database.execute("SELECT * FROM portfolios ORDER BY id")).rows).toEqual(portfoliosBefore);
    expect((await database.execute("SELECT COUNT(*) AS count FROM sync_runs WHERE learning_space_id = 'space-5'")).rows[0].count).toBe(0);
  });

  it("formats at most three usage labels and a remaining count", () => {
    const usages = ["4NW1", "5WET", "6WIS", "EXTRA"].map((learningSpaceShortLabel, index) => ({
      learningSpaceId: `space-${index}`, learningSpaceName: `Ruimte ${index}`, learningSpaceShortLabel,
    }));
    expect(sourceProfileUsageLabel([])).toBe("Inactief");
    expect(sourceProfileUsageLabel(usages)).toBe("4NW1, 5WET, 6WIS +1");
  });
});

async function createProfile(learningSpaceId: string, ownerUserId: string, name: string, activate: boolean) {
  const template = await getDefaultSourceProfileTemplate();
  if (activate) return cloneSourceProfileTemplateToLearningSpace({ ...template, name }, learningSpaceId, ownerUserId);
  const profile = await cloneSourceProfileTemplateToLearningSpace({ ...template, name }, learningSpaceId, ownerUserId);
  const fallbackId = learningSpaceId === "space-5" ? profileFiveId : profileSixId;
  await (await getDatabase()).execute({ sql: "UPDATE learning_space_source_profiles SET source_profile_id = ? WHERE learning_space_id = ?", args: [fallbackId, learningSpaceId] });
  return profile;
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
