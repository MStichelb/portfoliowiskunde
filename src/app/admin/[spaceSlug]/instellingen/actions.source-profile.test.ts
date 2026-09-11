import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`NEXT_REDIRECT:${destination}`); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { getDatabase, resetDatabaseForTests } from "@/lib/database";
import { createUser, type AppUser } from "@/lib/identity";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_ID } from "@/lib/source-profile-config";
import { getActiveSourceProfileForLearningSpace } from "@/lib/source-profiles";
import { cloneSourceProfileTemplateToLearningSpace, getDefaultSourceProfileTemplate } from "@/lib/source-profile-templates";
import { setIndividualLearningSpaceAccess, upsertManagedMembership } from "@/lib/user-management";

import { copySourceProfileAction, copySourceProfileTemplateAction, createOwnSourceProfileAction, renameSourceProfileAction, switchSourceProfileAction } from "./actions";

let temporaryDirectory: string | undefined;
let owner: AppUser;
let editor: AppUser;
let viewer: AppUser;
let superadmin: AppUser;

beforeEach(async () => {
  vi.clearAllMocks();
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "source-profile-actions-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  owner = await createUser({ displayName: "Owner", role: "teacher" });
  editor = await createUser({ displayName: "Editor", role: "teacher" });
  viewer = await createUser({ displayName: "Viewer", role: "teacher" });
  superadmin = await createUser({ displayName: "Admin", role: "superadmin" });
  await upsertManagedMembership("space-5", owner.id, "owner");
  await upsertManagedMembership("space-5", editor.id, "editor");
  await setIndividualLearningSpaceAccess(viewer.id, "space-5", true);
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("source profile settings actions", () => {
  it("uses the authenticated owner and activates a newly created profile", async () => {
    mocks.requireAdminUser.mockResolvedValue(owner);
    await (await getDatabase()).execute({
      sql: "UPDATE learning_space_source_profiles SET source_profile_id = ? WHERE learning_space_id = 'space-5'",
      args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID],
    });

    await expect(createOwnSourceProfileAction(form({ learningSpaceId: "space-5" }))).rejects.toThrow("profileSaved=created");

    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.type).toBe("custom");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/5/instellingen");
  });

  it("blocks an authenticated editor from switching despite a manipulated client user id", async () => {
    const original = (await getActiveSourceProfileForLearningSpace("space-5"))!;
    const template = await getDefaultSourceProfileTemplate();
    const custom = await cloneSourceProfileTemplateToLearningSpace({ ...template, name: "Tweede profiel" }, "space-5");
    mocks.requireAdminUser.mockResolvedValue(editor);

    await expect(switchSourceProfileAction(form({
      learningSpaceId: "space-5",
      sourceProfileId: original.id,
      userId: superadmin.id,
    }))).rejects.toThrow("profileError=Alleen%20een%20eigenaar%20of%20hoofdbeheerder");

    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(custom.id);
  });

  it("reopens rename only after a validation error", async () => {
    const custom = (await getActiveSourceProfileForLearningSpace("space-5"))!;
    mocks.requireAdminUser.mockResolvedValue(owner);

    await expect(renameSourceProfileAction(form({ learningSpaceId: "space-5", sourceProfileId: custom.id, name: " " }))).rejects.toThrow("profileModal=rename");

    expect(mocks.redirect).toHaveBeenLastCalledWith(expect.stringContaining("profileError="));
    expect(mocks.redirect).toHaveBeenLastCalledWith(expect.stringContaining("&profileModal=rename"));
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.name).toBe("Standaard portfolio");
  });

  it("keeps an owner ordinary copy inactive", async () => {
    mocks.requireAdminUser.mockResolvedValue(owner);
    const targetBefore = (await getActiveSourceProfileForLearningSpace("space-5"))!;

    await expect(copySourceProfileAction(form({ learningSpaceId: "space-5", sourceProfileId: "manipulated", targetLearningSpaceId: "space-5" }))).rejects.toThrow("profileSaved=copiedInactive");

    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(targetBefore.id);
    const copies = await (await getDatabase()).execute({ sql: "SELECT id FROM source_profiles WHERE management_learning_space_id = ?", args: ["space-5"] });
    expect(copies.rows.some((row) => row.id !== targetBefore.id)).toBe(true);
  });

  it("lets an editor copy without changing the active source profile", async () => {
    mocks.requireAdminUser.mockResolvedValue(editor);
    const before = (await getActiveSourceProfileForLearningSpace("space-5"))!;

    await expect(copySourceProfileAction(form({ learningSpaceId: "space-5", sourceProfileId: "manipulated", targetLearningSpaceId: "space-5" }))).rejects.toThrow("profileSaved=copiedInactive");

    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(before.id);
    const copies = await (await getDatabase()).execute({ sql: "SELECT id, config_json FROM source_profiles WHERE management_learning_space_id = ?", args: ["space-5"] });
    expect(copies.rows).toHaveLength(2);
    expect(copies.rows.some((row) => row.id !== before.id && row.config_json === JSON.stringify(before.config))).toBe(true);
  });

  it("copies a server-resolved template to a concrete active owner profile", async () => {
    mocks.requireAdminUser.mockResolvedValue(owner);
    const template = await getDefaultSourceProfileTemplate();

    await expect(copySourceProfileTemplateAction(form({ learningSpaceId: "space-5", templateId: template.id }))).rejects.toThrow("profileSaved=templateCopied");

    const active = (await getActiveSourceProfileForLearningSpace("space-5"))!;
    expect(active).toMatchObject({ type: "custom", managementLearningSpaceId: "space-5", config: template.config });
    expect(active.id).not.toBe(template.id);
  });

  it("keeps a viewer out before resolving LearningSpace details", async () => {
    mocks.requireAdminUser.mockResolvedValue(viewer);
    const originalId = (await getActiveSourceProfileForLearningSpace("space-5"))!.id;

    await expect(switchSourceProfileAction(form({ learningSpaceId: "space-5", sourceProfileId: originalId }))).rejects.toThrow("NEXT_REDIRECT:/admin");
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(originalId);
  });

  it("turns a manipulated foreign profile id into a scoped error without activating it", async () => {
    const foreign = (await getActiveSourceProfileForLearningSpace("space-6"))!;
    const originalId = (await getActiveSourceProfileForLearningSpace("space-5"))!.id;
    mocks.requireAdminUser.mockResolvedValue(owner);

    await expect(switchSourceProfileAction(form({ learningSpaceId: "space-5", sourceProfileId: foreign.id }))).rejects.toThrow("profileError=Bronprofiel%20niet%20beschikbaar");
    expect(mocks.redirect).toHaveBeenLastCalledWith(expect.stringContaining("&profileModal=switch"));
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(originalId);
  });
});

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
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
