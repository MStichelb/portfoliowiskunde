import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  createLearningSpaceForOwner: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getLearningSpace: vi.fn(),
  updateLearningSpace: vi.fn(),
  moveTheme: vi.fn(),
  ensureStorageConnection: vi.fn(),
  requireLearningSpaceConfiguration: vi.fn(),
  requireLearningSpaceCreation: vi.fn(),
  requireLearningSpaceManagement: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ endAdminSession: vi.fn(), requireAdmin: vi.fn(), requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({
  requireLearningSpaceConfiguration: mocks.requireLearningSpaceConfiguration,
  requireLearningSpaceCreation: mocks.requireLearningSpaceCreation,
  requireLearningSpaceManagement: mocks.requireLearningSpaceManagement,
}));
vi.mock("@/lib/repositories", () => ({
  createLearningSpaceForOwner: mocks.createLearningSpaceForOwner,
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
  getLearningSpace: mocks.getLearningSpace,
  updateLearningSpace: mocks.updateLearningSpace,
  moveTheme: mocks.moveTheme,
}));
vi.mock("@/lib/storage-connections", () => ({ ensureStorageConnection: mocks.ensureStorageConnection }));

import { createLearningSpaceAction, moveThemeAction, saveLearningSpaceAction } from "./actions";

describe("createLearningSpaceAction authorization and ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(null);
    mocks.getLearningSpace.mockResolvedValue({ id: "space-5", slug: "owner-space", primarySource: null, mirrorSource: null });
    mocks.createLearningSpaceForOwner.mockImplementation(async (input) => ({ ...input, id: `space-${input.slug}` }));
    mocks.ensureStorageConnection.mockImplementation(async (userId) => ({ id: `connection-${userId}` }));
    mocks.requireLearningSpaceCreation.mockImplementation((actor) => {
      if (actor.role === "student") throw new Error("Alleen actieve leraren en hoofdbeheerders");
    });
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

    await expect(createLearningSpaceAction(validForm("duplicate"))).rejects.toThrow("REDIRECT:/admin?create=1&createError=duplicate");

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

  it("keeps an editor out of the owner-only settings mutation", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher", "editor-1"));
    mocks.requireLearningSpaceConfiguration.mockRejectedValueOnce(new Error("Alleen een eigenaar of hoofdbeheerder"));
    const form = validForm("editor-space");
    form.set("id", "space-5");

    await expect(saveLearningSpaceAction({ error: null }, form)).rejects.toThrow("Alleen een eigenaar of hoofdbeheerder");

    expect(mocks.requireLearningSpaceConfiguration).toHaveBeenCalledWith(expect.objectContaining({ id: "editor-1" }), "space-5");
  });

  it("lets the existing configuration actor submit all hierarchy terminology", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher", "owner-1"));
    mocks.requireLearningSpaceConfiguration.mockResolvedValue(undefined);
    const form = validForm("owner-space");
    form.set("id", "space-5");
    form.set("collectionLabelSingular", "  Practicum  ");
    form.set("themeLabelSingular", "  Deel  ");
    form.set("themeLabelPlural", "  Delen  ");
    form.set("sectionLabelSingular", "  Sectie  ");
    form.set("sectionLabelPlural", "  Secties  ");
    form.set("collectionLabelPlural", "  Practicums  ");
    form.set("exerciseLabelSingular", "  Vraag  ");
    form.set("exerciseLabelPlural", "  Vragen  ");
    form.set("exerciseLabelShort", "Vr.");

    await expect(saveLearningSpaceAction({ error: null }, form)).rejects.toThrow("REDIRECT:/admin/owner-space/instellingen?saved=1");

    expect(mocks.requireLearningSpaceConfiguration).toHaveBeenCalledWith(expect.objectContaining({ id: "owner-1" }), "space-5");
    expect(mocks.updateLearningSpace).toHaveBeenCalledWith("space-5", expect.objectContaining({
      collectionLabelSingular: "  Practicum  ",
      themeLabelSingular: "  Deel  ", themeLabelPlural: "  Delen  ",
      sectionLabelSingular: "  Sectie  ", sectionLabelPlural: "  Secties  ",
      collectionLabelPlural: "  Practicums  ",
      exerciseLabelSingular: "  Vraag  ",
      exerciseLabelPlural: "  Vragen  ",
      exerciseLabelShort: "Vr.",
    }));
  });
});

describe("moveThemeAction authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue(user("teacher", "manager-1"));
    mocks.getLearningSpace.mockResolvedValue({ id: "space-5" });
  });

  it("validates and forwards LearningSpace level presentation settings", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher", "owner-1"));
    mocks.requireLearningSpaceConfiguration.mockResolvedValue(undefined);
    const form = validForm("owner-space");
    form.set("id", "space-5");
    for (const [level, count] of [["opwarmer", "1"], ["basis", "2"], ["uitdaging", "3"], ["verdieping", "1"]]) {
      form.set(`levelName_${level}`, level === "basis" ? "Kern" : level);
      form.set(`levelSymbol_${level}`, "circle");
      form.set(`levelCount_${level}`, count);
      form.set(`levelColor_${level}`, "#ABCDEF");
      if (level === "basis" || level === "verdieping") form.set(`levelShowPublicBackground_${level}`, "true");
    }

    await expect(saveLearningSpaceAction({ error: null }, form)).rejects.toThrow("REDIRECT:/admin/owner-space/instellingen?saved=1");
    expect(mocks.updateLearningSpace).toHaveBeenCalledWith("space-5", expect.objectContaining({
      levelPresentation: {
        opwarmer: { displayName: "opwarmer", symbolId: "circle", count: 1, color: "#ABCDEF", showPublicBackground: false },
        basis: { displayName: "Kern", symbolId: "circle", count: 2, color: "#ABCDEF", showPublicBackground: true },
        uitdaging: { displayName: "uitdaging", symbolId: "circle", count: 3, color: "#ABCDEF", showPublicBackground: false },
        verdieping: { displayName: "verdieping", symbolId: "circle", count: 1, color: "#ABCDEF", showPublicBackground: true },
      },
    }));
  });

  it("rejects an invalid LearningSpace level presentation before persistence", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher", "owner-1"));
    mocks.requireLearningSpaceConfiguration.mockResolvedValue(undefined);
    const form = validForm("owner-space");
    form.set("id", "space-5");
    for (const level of ["opwarmer", "basis", "uitdaging", "verdieping"]) {
      form.set(`levelName_${level}`, level);
      form.set(`levelSymbol_${level}`, "star");
      form.set(`levelCount_${level}`, level === "basis" ? "5" : "1");
      form.set(`levelColor_${level}`, "#ABCDEF");
    }

    await expect(saveLearningSpaceAction({ error: null }, form)).resolves.toEqual({ error: "Kies voor Basis een aantal van 1 tot en met 4." });
    expect(mocks.updateLearningSpace).not.toHaveBeenCalled();
  });

  it("requires the existing LearningSpace management permission", async () => {
    mocks.requireLearningSpaceManagement.mockRejectedValueOnce(new Error("Geen beheerrechten"));
    const form = themeMoveForm("theme-1", "space-5", "up");

    await expect(moveThemeAction(form)).rejects.toThrow("Geen beheerrechten");

    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(expect.objectContaining({ id: "manager-1" }), "space-5");
    expect(mocks.moveTheme).not.toHaveBeenCalled();
  });

  it("forwards only the validated direction and scoped identifiers", async () => {
    await moveThemeAction(themeMoveForm("theme-1", "space-5", "down"));

    expect(mocks.moveTheme).toHaveBeenCalledWith("theme-1", "space-5", "down");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
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
  form.set("subjectId", "subject-wiskunde");
  form.set("sourceType", sourceType);
  return form;
}

function themeMoveForm(id: string, learningSpaceId: string, direction: string): FormData {
  const form = new FormData();
  form.set("id", id);
  form.set("learningSpaceId", learningSpaceId);
  form.set("direction", direction);
  return form;
}
