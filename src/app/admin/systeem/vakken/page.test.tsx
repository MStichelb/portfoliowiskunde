import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/components/flash-toast", () => ({
  useToast: () => vi.fn(),
  ExerciseNoteFeedback: () => null,
  FlashToast: ({ type, message, feedbackKey }: { type: string; message: string; feedbackKey?: string }) => <span data-toast={type} data-feedback-key={feedbackKey}>{message}</span>,
}));


const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), listSubjectsForManagement: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/subjects", () => ({ listSubjectsForManagement: mocks.listSubjectsForManagement }));
vi.mock("./actions", () => ({
  archiveSubjectAction: vi.fn(),
  createSubjectAction: vi.fn(),
  moveSubjectAction: vi.fn(),
  permanentlyDeleteSubjectAction: vi.fn(),
  renameSubjectAction: vi.fn(),
  restoreSubjectAction: vi.fn(),
}));
vi.mock("@/app/components/confirm-action-button", () => ({
  ConfirmActionButton: ({ label, confirmTitle, disabled }: { label: React.ReactNode; confirmTitle: string; disabled?: boolean }) => <button aria-label={confirmTitle} disabled={disabled}>{label}</button>,
}));

import SubjectsPage from "./page";

describe("SubjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "superadmin", status: "active" });
    mocks.listSubjectsForManagement.mockResolvedValue([
      subject("mathematics", "Wiskunde", 10, true, 2),
      subject("physics", "Fysica", 20, true, 0),
      subject("chemistry", "Chemie", 30, false, 3),
      subject("history", "Geschiedenis", 40, false, 0),
    ]);
  });

  it("renders active subjects without a visible numeric order field", async () => {
    const markup = renderToStaticMarkup(await SubjectsPage({ searchParams: Promise.resolve({ saved: "created" }) }));
    expect(markup).toContain("Vak toegevoegd.");
    expect(markup).toContain("Vak toevoegen");
    expect(markup.indexOf("Wiskunde")).toBeLessThan(markup.indexOf("Fysica"));
    expect(markup).toContain("Actief");
    expect(markup).not.toContain("Chemie");
    expect(markup).not.toContain("Sortering");
    expect(markup).not.toContain('name="sortOrder"');
    expect(markup).toContain("Toon archief");
    expect(markup.match(/aria-label="Vak omhoog verplaatsen"/g)).toHaveLength(2);
    expect(markup.match(/aria-label="Vak omlaag verplaatsen"/g)).toHaveLength(2);
    expect(markup).toMatch(/disabled="" aria-label="Vak omhoog verplaatsen"/);
    expect(markup).toMatch(/disabled="" aria-label="Vak omlaag verplaatsen"/);
    expect(markup.match(/aria-label="Vak archiveren"/g)).toHaveLength(2);
    expect(markup.match(/aria-label="Vaknaam opslaan"/g)).toHaveLength(2);
  });

  it("shows only archived subjects with restore and guarded permanent-delete controls", async () => {
    const markup = renderToStaticMarkup(await SubjectsPage({ searchParams: Promise.resolve({ archive: "1" }) }));

    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain("Chemie");
    expect(markup).toContain("Geschiedenis");
    expect(markup).not.toContain("Wiskunde");
    expect(markup).not.toContain("Fysica");
    expect(markup.match(/>Gearchiveerd<\/span>/g)).toHaveLength(2);
    expect(markup.match(/Herstellen/g)).toHaveLength(2);
    expect(markup).toContain("Dit vak wordt nog gebruikt door 3 leeromgevingen.");
    expect(markup).toMatch(/aria-label="Vak definitief verwijderen\?" disabled=""/);
    expect(markup.match(/aria-label="Vak definitief verwijderen\?"/g)).toHaveLength(2);
    expect(markup).not.toContain('aria-label="Vak omhoog verplaatsen"');
  });

  it("does not read subjects when the superadmin route guard rejects", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("REDIRECT:/admin/login"));
    await expect(SubjectsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/admin/login");
    expect(mocks.listSubjectsForManagement).not.toHaveBeenCalled();
  });
});

function subject(id: string, name: string, sortOrder: number, isActive: boolean, usageCount: number) {
  return { id, name, sortOrder, isActive, usageCount, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" };
}
