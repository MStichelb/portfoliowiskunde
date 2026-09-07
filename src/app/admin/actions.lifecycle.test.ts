import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireAdminUser: vi.fn(),
  requireLearningSpaceConfiguration: vi.fn(),
  getLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  setLearningSpaceEditorsCanManageAccess: vi.fn(),
  archiveLearningSpace: vi.fn(),
  restoreLearningSpace: vi.fn(),
  permanentlyDeleteLearningSpace: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({
  endAdminSession: vi.fn(),
  requireAdmin: mocks.requireAdmin,
  requireAdminUser: mocks.requireAdminUser,
}));
vi.mock("@/lib/authorization", () => ({
  requireLearningSpaceConfiguration: mocks.requireLearningSpaceConfiguration,
  requireLearningSpaceCreation: vi.fn(),
  requireLearningSpaceManagement: vi.fn(),
}));
vi.mock("@/lib/repositories", () => ({
  getLearningSpace: mocks.getLearningSpace,
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
  setLearningSpaceEditorsCanManageAccess: mocks.setLearningSpaceEditorsCanManageAccess,
  archiveLearningSpace: mocks.archiveLearningSpace,
  restoreLearningSpace: mocks.restoreLearningSpace,
  permanentlyDeleteLearningSpace: mocks.permanentlyDeleteLearningSpace,
}));

import {
  archiveLearningSpaceAction,
  permanentlyDeleteLearningSpaceAction,
  restoreLearningSpaceAction,
  saveLearningSpaceEditorPermissionsAction,
} from "./actions";

describe("LearningSpace lifecycle action authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
    mocks.archiveLearningSpace.mockResolvedValue(true);
    mocks.restoreLearningSpace.mockResolvedValue(true);
    mocks.permanentlyDeleteLearningSpace.mockResolvedValue(true);
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(null);
    mocks.setLearningSpaceEditorsCanManageAccess.mockResolvedValue(undefined);
    mocks.requireLearningSpaceConfiguration.mockImplementation(async (actor) => {
      if (actor.role === "superadmin" || actor.id === "owner") return;
      throw new Error("Alleen een eigenaar of hoofdbeheerder kan de broninstellingen wijzigen.");
    });
  });

  it.each([
    ["owner", "teacher"],
    ["superadmin", "superadmin"],
  ] as const)("allows %s to enable and disable editor student-access delegation", async (id, role) => {
    const actor = user(id, role);
    mocks.requireAdminUser.mockResolvedValue(actor);

    await expect(saveLearningSpaceEditorPermissionsAction("space-5", true)).resolves.toEqual({ saved: true, error: null });
    expect(mocks.setLearningSpaceEditorsCanManageAccess).toHaveBeenLastCalledWith("space-5", true);

    await expect(saveLearningSpaceEditorPermissionsAction("space-5", false)).resolves.toEqual({ saved: true, error: null });
    expect(mocks.setLearningSpaceEditorsCanManageAccess).toHaveBeenLastCalledWith("space-5", false);
    expect(mocks.requireLearningSpaceConfiguration).toHaveBeenCalledWith(actor, "space-5");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not let an editor change the delegation setting", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));
    await expect(saveLearningSpaceEditorPermissionsAction("space-5", true)).rejects.toThrow("Alleen een eigenaar of hoofdbeheerder");

    expect(mocks.setLearningSpaceEditorsCanManageAccess).not.toHaveBeenCalled();
  });

  it("returns a compact error when persisting the setting fails", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("owner", "teacher"));
    mocks.setLearningSpaceEditorsCanManageAccess.mockRejectedValue(new Error("database unavailable"));

    await expect(saveLearningSpaceEditorPermissionsAction("space-5", true)).resolves.toEqual({
      saved: false,
      error: "De bewerkersrechten konden niet worden opgeslagen.",
    });
  });

  it.each([
    ["owner", "teacher"],
    ["superadmin", "superadmin"],
  ] as const)("allows %s to archive an active LearningSpace", async (id, role) => {
    const actor = user(id, role);
    mocks.requireAdminUser.mockResolvedValue(actor);
    mocks.getLearningSpace.mockResolvedValue(space(true));

    await expect(archiveLearningSpaceAction(form())).rejects.toThrow("REDIRECT:/admin/5/instellingen");

    expect(mocks.requireLearningSpaceConfiguration).toHaveBeenCalledWith(actor, "space-5");
    expect(mocks.archiveLearningSpace).toHaveBeenCalledWith("space-5");
  });

  it("rejects an editor before archiving", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));
    mocks.getLearningSpace.mockResolvedValue(space(true));

    await expect(archiveLearningSpaceAction(form())).rejects.toThrow("Alleen een eigenaar of hoofdbeheerder");

    expect(mocks.archiveLearningSpace).not.toHaveBeenCalled();
  });

  it.each([
    ["owner", "teacher"],
    ["superadmin", "superadmin"],
  ] as const)("allows %s to restore an archived LearningSpace", async (id, role) => {
    const actor = user(id, role);
    mocks.requireAdminUser.mockResolvedValue(actor);
    mocks.getLearningSpace.mockResolvedValue(space(false));

    await expect(restoreLearningSpaceAction(form())).rejects.toThrow("REDIRECT:/admin/5/instellingen");

    expect(mocks.requireLearningSpaceConfiguration).toHaveBeenCalledWith(actor, "space-5");
    expect(mocks.restoreLearningSpace).toHaveBeenCalledWith("space-5");
  });

  it("rejects an editor before restoring", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));
    mocks.getLearningSpace.mockResolvedValue(space(false));

    await expect(restoreLearningSpaceAction(form())).rejects.toThrow("Alleen een eigenaar of hoofdbeheerder");

    expect(mocks.restoreLearningSpace).not.toHaveBeenCalled();
  });

  it("allows only a superadmin to permanently delete an archived LearningSpace", async () => {
    mocks.requireAdmin.mockResolvedValue(user("superadmin", "superadmin"));
    mocks.getLearningSpace.mockResolvedValue(space(false));

    await expect(permanentlyDeleteLearningSpaceAction(deleteForm())).rejects.toThrow("REDIRECT:/admin");

    expect(mocks.permanentlyDeleteLearningSpace).toHaveBeenCalledWith("space-5");
  });

  it.each(["owner", "editor"])("rejects permanent deletion by %s", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Alleen hoofdbeheerders hebben toegang."));
    mocks.getLearningSpace.mockResolvedValue(space(false));

    await expect(permanentlyDeleteLearningSpaceAction(deleteForm())).rejects.toThrow("Alleen hoofdbeheerders");

    expect(mocks.permanentlyDeleteLearningSpace).not.toHaveBeenCalled();
  });

  it("preserves the archived-only invariant for permanent deletion", async () => {
    mocks.requireAdmin.mockResolvedValue(user("superadmin", "superadmin"));
    mocks.getLearningSpace.mockResolvedValue(space(true));

    await expect(permanentlyDeleteLearningSpaceAction(deleteForm())).rejects.toThrow("REDIRECT:/admin?error=archive-before-delete");

    expect(mocks.permanentlyDeleteLearningSpace).not.toHaveBeenCalled();
  });

  it("does not run a lifecycle mutation for the opposite lifecycle state", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("owner", "teacher"));
    mocks.getLearningSpace.mockResolvedValueOnce(space(false)).mockResolvedValueOnce(space(true));

    await archiveLearningSpaceAction(form());
    await restoreLearningSpaceAction(form());

    expect(mocks.archiveLearningSpace).not.toHaveBeenCalled();
    expect(mocks.restoreLearningSpace).not.toHaveBeenCalled();
  });
});

function form(): FormData {
  const data = new FormData();
  data.set("id", "space-5");
  return data;
}

function deleteForm(): FormData {
  const data = form();
  data.set("confirmationSlug", "5");
  return data;
}

function user(id: string, role: "teacher" | "superadmin") {
  return { id, displayName: id, firstName: null, lastName: null, email: null, role, status: "active" as const, classGroupOverrideId: null };
}

function space(isActive: boolean) {
  return {
    id: "space-5",
    slug: "5",
    isActive,
    archivedAt: isActive ? null : "2026-09-01T00:00:00.000Z",
  };
}
