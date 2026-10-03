import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  archiveSubject: vi.fn(),
  createSubject: vi.fn(),
  moveSubject: vi.fn(),
  permanentlyDeleteSubject: vi.fn(),
  renameSubject: vi.fn(),
  restoreSubject: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/subjects", () => ({
  archiveSubject: mocks.archiveSubject,
  createSubject: mocks.createSubject,
  moveSubject: mocks.moveSubject,
  permanentlyDeleteSubject: mocks.permanentlyDeleteSubject,
  renameSubject: mocks.renameSubject,
  restoreSubject: mocks.restoreSubject,
}));

import { archiveSubjectAction, createSubjectAction, moveSubjectAction, permanentlyDeleteSubjectAction, renameSubjectAction, restoreSubjectAction } from "./actions";

const admin = { id: "admin", role: "superadmin", status: "active" };

describe("subject actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(admin);
    mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
  });

  it("maps create, rename, ordering and lifecycle forms to the subject domain", async () => {
    await expect(createSubjectAction(form({ name: " Fysica " }))).rejects.toThrow("REDIRECT:/admin/systeem/vakken?saved=created");
    expect(mocks.createSubject).toHaveBeenCalledWith(admin, { name: "Fysica" });

    await expect(renameSubjectAction(form({ subjectId: "subject-1", name: " Chemie " }))).rejects.toThrow("saved=renamed");
    expect(mocks.renameSubject).toHaveBeenCalledWith(admin, "subject-1", "Chemie");

    await expect(moveSubjectAction(form({ subjectId: "subject-1", direction: "down" }))).rejects.toThrow("saved=moved");
    expect(mocks.moveSubject).toHaveBeenCalledWith(admin, "subject-1", "down");

    await expect(archiveSubjectAction(form({ subjectId: "subject-1" }))).rejects.toThrow("saved=archived");
    expect(mocks.archiveSubject).toHaveBeenCalledWith(admin, "subject-1");
    await expect(restoreSubjectAction(form({ subjectId: "subject-1" }))).rejects.toThrow("saved=restored");
    expect(mocks.restoreSubject).toHaveBeenCalledWith(admin, "subject-1");
    await expect(permanentlyDeleteSubjectAction(form({ subjectId: "subject-1" }))).rejects.toThrow("saved=deleted");
    expect(mocks.permanentlyDeleteSubject).toHaveBeenCalledWith(admin, "subject-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/systeem/vakken");
  });

  it("requires superadmin before every mutation", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("REDIRECT:/admin/login"));
    await expect(permanentlyDeleteSubjectAction(form({ subjectId: "subject-1" }))).rejects.toThrow("REDIRECT:/admin/login");
    expect(mocks.createSubject).not.toHaveBeenCalled();
    expect(mocks.permanentlyDeleteSubject).not.toHaveBeenCalled();
  });

  it("returns domain validation errors without hiding them", async () => {
    mocks.createSubject.mockRejectedValue(new Error("Er bestaat al een vak met deze naam."));
    await expect(createSubjectAction(form({ name: "Fysica" })))
      .rejects.toThrow("REDIRECT:/admin/systeem/vakken?error=Er%20bestaat%20al%20een%20vak%20met%20deze%20naam.");
  });
});

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
