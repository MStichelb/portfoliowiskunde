import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), listSubjectsForManagement: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/subjects", () => ({ listSubjectsForManagement: mocks.listSubjectsForManagement }));
vi.mock("./actions", () => ({
  createSubjectAction: vi.fn(),
  renameSubjectAction: vi.fn(),
  setSubjectActiveAction: vi.fn(),
  updateSubjectSortOrderAction: vi.fn(),
}));

import SubjectsPage from "./page";

describe("SubjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "superadmin", status: "active" });
    mocks.listSubjectsForManagement.mockResolvedValue([
      subject("physics", "Fysica", 5, false),
      subject("mathematics", "Wiskunde", 10, true),
    ]);
  });

  it("renders creation and ordered lifecycle controls for active and inactive subjects", async () => {
    const markup = renderToStaticMarkup(await SubjectsPage({ searchParams: Promise.resolve({ saved: "created" }) }));
    expect(markup).toContain("Vak toegevoegd.");
    expect(markup).toContain("Vak toevoegen");
    expect(markup.indexOf("Fysica")).toBeLessThan(markup.indexOf("Wiskunde"));
    expect(markup).toContain("Inactief");
    expect(markup).toContain("Actief");
    expect(markup).toContain("Activeren");
    expect(markup).toContain("Deactiveren");
    expect(markup).toContain("Naam opslaan");
    expect(markup).toContain("Volgorde opslaan");
  });

  it("does not read subjects when the superadmin route guard rejects", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("REDIRECT:/admin/login"));
    await expect(SubjectsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/admin/login");
    expect(mocks.listSubjectsForManagement).not.toHaveBeenCalled();
  });
});

function subject(id: string, name: string, sortOrder: number, isActive: boolean) {
  return { id, name, sortOrder, isActive, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" };
}
