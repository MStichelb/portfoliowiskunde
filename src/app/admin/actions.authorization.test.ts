import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  createLearningSpaceForOwner: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  ensureStorageConnection: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ endAdminSession: vi.fn(), requireAdmin: vi.fn(), requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/repositories", () => ({
  createLearningSpaceForOwner: mocks.createLearningSpaceForOwner,
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
}));
vi.mock("@/lib/storage-connections", () => ({ ensureStorageConnection: mocks.ensureStorageConnection }));

import { createLearningSpaceAction } from "./actions";

describe("createLearningSpaceAction authorization and ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(null);
    mocks.createLearningSpaceForOwner.mockImplementation(async (input) => ({ ...input, id: `space-${input.slug}` }));
    mocks.ensureStorageConnection.mockImplementation(async (userId) => ({ id: `connection-${userId}` }));
    mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
  });

  it("allows a teacher and passes that actor as owner", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher", "teacher-1"));

    await expect(createLearningSpaceAction(validForm("teacher-space"))).rejects.toThrow("REDIRECT:/admin/teacher-space/instellingen");

    expect(mocks.createLearningSpaceForOwner).toHaveBeenCalledWith(expect.objectContaining({ slug: "teacher-space" }), "teacher-1");
  });

  it("keeps superadmin creation and makes that actor owner", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("superadmin", "superadmin-1"));

    await expect(createLearningSpaceAction(validForm("admin-space"))).rejects.toThrow("REDIRECT:/admin/admin-space/instellingen");

    expect(mocks.createLearningSpaceForOwner).toHaveBeenCalledWith(expect.objectContaining({ slug: "admin-space" }), "superadmin-1");
  });

  it("rejects students through the central creation policy", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("student", "student-1"));

    await expect(createLearningSpaceAction(validForm("student-space"))).rejects.toThrow("Alleen actieve leraren en hoofdbeheerders");

    expect(mocks.createLearningSpaceForOwner).not.toHaveBeenCalled();
  });

  it("keeps duplicate slugs out of the creation transaction", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher", "teacher-1"));
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ id: "existing" });

    await expect(createLearningSpaceAction(validForm("duplicate"))).rejects.toThrow("REDIRECT:/admin/instellingen?error=duplicate");

    expect(mocks.createLearningSpaceForOwner).not.toHaveBeenCalled();
  });

  it("assigns a OneDrive connection owned by the authenticated actor", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher", "teacher-connection"));
    const form = validForm("onedrive-space", "onedrive");
    form.set("oneDriveDriveId", "drive-id");
    form.set("oneDriveFolderId", "folder-id");

    await expect(createLearningSpaceAction(form)).rejects.toThrow("REDIRECT:/admin/onedrive-space/instellingen");

    expect(mocks.ensureStorageConnection).toHaveBeenCalledWith("teacher-connection", "onedrive");
    expect(mocks.createLearningSpaceForOwner).toHaveBeenCalledWith(expect.objectContaining({ storageConnectionId: "connection-teacher-connection" }), "teacher-connection");
  });
});

function user(role: "student" | "teacher" | "superadmin", id: string) {
  return { id, displayName: id, firstName: null, lastName: null, email: null, role, status: "active" as const, classGroupOverrideId: null };
}

function validForm(slug: string, sourceType = "local"): FormData {
  const form = new FormData();
  form.set("name", `Leeromgeving ${slug}`);
  form.set("slug", slug);
  form.set("shortLabel", slug.toUpperCase());
  form.set("sortOrder", "10");
  form.set("sourceType", sourceType);
  return form;
}
