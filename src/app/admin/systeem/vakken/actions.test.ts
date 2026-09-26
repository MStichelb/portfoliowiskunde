import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createSubject: vi.fn(),
  renameSubject: vi.fn(),
  setSubjectActive: vi.fn(),
  updateSubjectSortOrder: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/subjects", () => ({
  createSubject: mocks.createSubject,
  renameSubject: mocks.renameSubject,
  setSubjectActive: mocks.setSubjectActive,
  updateSubjectSortOrder: mocks.updateSubjectSortOrder,
}));

import { createSubjectAction, renameSubjectAction, setSubjectActiveAction, updateSubjectSortOrderAction } from "./actions";

const admin = { id: "admin", role: "superadmin", status: "active" };

describe("subject actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(admin);
    mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
  });

  it("maps create, rename, sorting and activation forms to the subject domain", async () => {
    await expect(createSubjectAction(form({ name: " Fysica ", sortOrder: "20" }))).rejects.toThrow("REDIRECT:/admin/systeem/vakken?saved=created");
    expect(mocks.createSubject).toHaveBeenCalledWith(admin, { name: "Fysica", sortOrder: 20 });

    await expect(renameSubjectAction(form({ subjectId: "subject-1", name: " Chemie " }))).rejects.toThrow("saved=renamed");
    expect(mocks.renameSubject).toHaveBeenCalledWith(admin, "subject-1", "Chemie");

    await expect(updateSubjectSortOrderAction(form({ subjectId: "subject-1", sortOrder: "7" }))).rejects.toThrow("saved=sorted");
    expect(mocks.updateSubjectSortOrder).toHaveBeenCalledWith(admin, "subject-1", 7);

    await expect(setSubjectActiveAction(form({ subjectId: "subject-1", active: "false" }))).rejects.toThrow("saved=deactivated");
    expect(mocks.setSubjectActive).toHaveBeenCalledWith(admin, "subject-1", false);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/systeem/vakken");
  });

  it("requires superadmin before every mutation", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("REDIRECT:/admin/login"));
    await expect(createSubjectAction(form({ name: "Fysica", sortOrder: "20" }))).rejects.toThrow("REDIRECT:/admin/login");
    expect(mocks.createSubject).not.toHaveBeenCalled();
  });

  it("returns domain validation errors without hiding them", async () => {
    mocks.createSubject.mockRejectedValue(new Error("Er bestaat al een vak met deze naam."));
    await expect(createSubjectAction(form({ name: "Fysica", sortOrder: "20" })))
      .rejects.toThrow("REDIRECT:/admin/systeem/vakken?error=Er%20bestaat%20al%20een%20vak%20met%20deze%20naam.");
  });
});

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
