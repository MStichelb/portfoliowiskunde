import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  createLearningSpaceForOwner: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
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
vi.mock("@/lib/storage-connections", () => ({ ensureStorageConnection: vi.fn() }));

import { createLearningSpaceAction } from "./actions";

describe("LearningSpace creation modal action routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: "teacher-1", role: "teacher", status: "active" });
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(null);
    mocks.createLearningSpaceForOwner.mockResolvedValue({ slug: "nieuwe-ruimte" });
    mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
  });

  it("uses the existing create action and returns to the refreshed admin overview", async () => {
    await expect(createLearningSpaceAction(modalForm())).rejects.toThrow("REDIRECT:/admin?created=1");

    expect(mocks.createLearningSpaceForOwner).toHaveBeenCalledWith(expect.objectContaining({ slug: "nieuwe-ruimte", sourceType: "local" }), "teacher-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("returns validation errors to an open modal", async () => {
    const form = new FormData();
    form.set("returnTo", "admin");

    await expect(createLearningSpaceAction(form)).rejects.toThrow("REDIRECT:/admin?create=1&createError=invalid");

    expect(mocks.createLearningSpaceForOwner).not.toHaveBeenCalled();
  });

  it("returns duplicate errors to an open modal", async () => {
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ id: "existing" });

    await expect(createLearningSpaceAction(modalForm())).rejects.toThrow("REDIRECT:/admin?create=1&createError=duplicate");

    expect(mocks.createLearningSpaceForOwner).not.toHaveBeenCalled();
  });
});

function modalForm(): FormData {
  const form = new FormData();
  form.set("returnTo", "admin");
  form.set("name", "Nieuwe ruimte");
  form.set("slug", "nieuwe-ruimte");
  form.set("shortLabel", "NIEUW");
  form.set("sortOrder", "10");
  return form;
}
