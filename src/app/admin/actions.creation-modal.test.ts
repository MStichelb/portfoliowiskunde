import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  createLearningSpaceForOwner: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  getProfile: vi.fn(),
  synchronize: vi.fn(),
  getPortfolios: vi.fn(),
  ensureStorageConnection: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ endAdminSession: vi.fn(), requireAdmin: vi.fn(), requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/repositories", () => ({
  createLearningSpaceForOwner: mocks.createLearningSpaceForOwner,
  getAdminPortfolios: mocks.getPortfolios,
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
}));
vi.mock("@/lib/storage-connections", () => ({ ensureStorageConnection: mocks.ensureStorageConnection }));

vi.mock("@/lib/source-profiles", () => ({ getActiveSourceProfileForLearningSpace: mocks.getProfile }));
vi.mock("@/lib/sync", () => ({ synchronizeSource: mocks.synchronize }));
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG as baseConfig } from "@/lib/source-profile-config";
import { terminologyScenario } from "@/lib/learning-space-creation-wizard";

import { createLearningSpaceAction } from "./actions";

describe("LearningSpace creation modal action routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: "teacher-1", role: "teacher", status: "active" });
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(null);
    mocks.createLearningSpaceForOwner.mockResolvedValue({ slug: "nieuwe-ruimte" });
    mocks.ensureStorageConnection.mockResolvedValue({ id: "owned-connection" });
    mocks.getProfile.mockResolvedValue(null);
    mocks.synchronize.mockResolvedValue({ warnings: 2, skipped: false });
    mocks.getPortfolios.mockResolvedValue([]);
    mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
  });

  it("creates exactly once with skipped configuration, owner and missing-config warnings", async () => {
    mocks.createLearningSpaceForOwner.mockResolvedValue({ id: "space-new", slug: "nieuwe-ruimte" });
    const result = await createLearningSpaceAction(wizardForm());
    expect(mocks.createLearningSpaceForOwner).toHaveBeenCalledOnce();
    expect(mocks.createLearningSpaceForOwner).toHaveBeenCalledWith(expect.objectContaining({ skipSourceOnCreation: true, creationProfileChoice: { mode: "later" }, collectionLabelPlural: "Bundels", exerciseLabelShort: "Opdr." }), "teacher-1");
    expect(result).toMatchObject({ error: null, spaceId: "space-new", warnings: [expect.stringContaining("geen bronprofiel"), expect.stringContaining("geen bron gekoppeld")] });
    expect(mocks.synchronize).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["onedrive", "google_drive"])("passes the selected %s source through existing provider parsing", async (provider) => {
    const form = wizardForm(); form.set("sourceSetup", "now"); form.set("sourceType", provider);
    form.set("oneDriveDriveId", "drive"); form.set("oneDriveFolderId", "folder"); form.set("googleDriveFolderId", "google-folder"); form.set("storageConnectionId", "forged-connection");
    mocks.createLearningSpaceForOwner.mockResolvedValue({ id: "space-new", slug: "nieuwe-ruimte" });
    expect(await createLearningSpaceAction(form)).toMatchObject({ error: null });
    expect(mocks.createLearningSpaceForOwner).toHaveBeenCalledWith(expect.objectContaining(provider === "onedrive" ? { sourceType: provider, storageConnectionId: "owned-connection", oneDriveDriveId: "drive", oneDriveFolderId: "folder" } : { sourceType: provider, googleDriveFolderId: "google-folder" }), "teacher-1");
    expect(mocks.synchronize).not.toHaveBeenCalled();
    if (provider === "onedrive") expect(mocks.ensureStorageConnection).toHaveBeenCalledWith("teacher-1", "onedrive");
  });

  it("does not persist an incomplete wizard submission", async () => {
    const form = wizardForm(); form.delete("subjectId");
    expect(await createLearningSpaceAction(form)).toMatchObject({ step: 1, error: expect.any(String) });
    expect(mocks.createLearningSpaceForOwner).not.toHaveBeenCalled();
  });

  it("performs one safe sync and summarizes custom terminology", async () => {
    const form = wizardForm(); form.set("profileMode", "link"); form.set("profileSelectionId", "profile-1"); form.set("sourceSetup", "now"); form.set("sourceType", "local"); form.set("localSourcePath", "C:\\test");
    mocks.getProfile.mockResolvedValue({ id: "profile-1" });
    mocks.createLearningSpaceForOwner.mockResolvedValue({ id: "space-new", slug: "nieuwe-ruimte", collectionLabelSingular: "Bundel", collectionLabelPlural: "Bundels", sectionLabelSingular: "Sectie", sectionLabelPlural: "Secties", exerciseLabelSingular: "Opdracht", exerciseLabelPlural: "Opdrachten" });
    mocks.getPortfolios.mockResolvedValue([{ exercises: [{}], sections: [{ exercises: [{}, {}] }] }]);
    const result = await createLearningSpaceAction(form);
    expect(result).toMatchObject({ error: null, summary: "1 bundel, 1 sectie en 3 opdrachten herkend. 2 waarschuwingen.", warnings: [] });
    expect(mocks.synchronize).toHaveBeenCalledExactlyOnceWith("space-new");
    mocks.synchronize.mockRejectedValue(new Error("Provider unavailable"));
    expect(await createLearningSpaceAction(form)).toMatchObject({ error: null, warnings: [expect.stringContaining("niet gelukt")] });
  });

  it("uses the neutral wizard description while preserving supplied text", async () => {
    mocks.createLearningSpaceForOwner.mockResolvedValue({ id: "space-new", slug: "nieuwe-ruimte" });
    const form = wizardForm();
    await createLearningSpaceAction(form);
    expect(mocks.createLearningSpaceForOwner).toHaveBeenLastCalledWith(expect.objectContaining({ description: "Klik op de kaartjes hieronder om te oefenen." }), "teacher-1");
    form.set("description", "Mijn vrije tekst"); await createLearningSpaceAction(form);
    expect(mocks.createLearningSpaceForOwner).toHaveBeenLastCalledWith(expect.objectContaining({ description: "Mijn vrije tekst" }), "teacher-1");
  });

  it.each(["template", "copy", "new"])("sends the validated local %s draft only at final creation", async (mode) => {
    const form = wizardForm(); form.set("profileMode", mode); form.set("profileSelectionId", "selected"); form.set("profileIntent", "edit"); form.set("profileDraftEnabled", "1");
    const config = structuredClone(baseConfig); config.scanner.portfolio.marker = "Bundel";
    for (const [key, value] of Object.entries({ portfolioScannerJson: config.scanner.portfolio, exerciseScannerJson: config.scanner.exercise, resourcesJson: config.globalResources, exerciseResourcesJson: config.exerciseResources, levelRecognitionJson: config.levelRecognition })) form.set(key, JSON.stringify(value));
    mocks.createLearningSpaceForOwner.mockResolvedValue({ id: "space-new", slug: "nieuwe-ruimte" }); mocks.getProfile.mockResolvedValue({ id: "profile-new" });
    expect(await createLearningSpaceAction(form)).toMatchObject({ error: null, warnings: [expect.stringContaining("geen bron gekoppeld")] });
    expect(mocks.createLearningSpaceForOwner).toHaveBeenCalledOnce();
    expect(mocks.createLearningSpaceForOwner).toHaveBeenCalledWith(expect.objectContaining({ creationProfileChoice: expect.objectContaining({ mode, config: expect.objectContaining({ scanner: config.scanner }) }) }), "teacher-1");
    expect(mocks.synchronize).not.toHaveBeenCalled();
    form.set("sourceSetup", "now"); form.set("sourceType", "local"); form.set("localSourcePath", "C:\\test");
    const result = await createLearningSpaceAction(form);
    expect(result).toMatchObject({ error: null, warnings: [] }); expect(result).not.toHaveProperty("editProfileId"); expect(mocks.synchronize).toHaveBeenCalledOnce();
  });

  it("rejects malformed drafts and editing a linked profile before any creation", async () => {
    const form = wizardForm(); form.set("profileMode", "new"); form.set("profileDraftEnabled", "1");
    expect(await createLearningSpaceAction(form)).toMatchObject({ step: 3, error: expect.any(String) });
    form.set("profileMode", "link"); form.set("profileSelectionId", "selected");
    expect(await createLearningSpaceAction(form)).toMatchObject({ step: 3, error: expect.stringContaining("gekoppeld") });
    expect(mocks.createLearningSpaceForOwner).not.toHaveBeenCalled();
  });

  it("does not sync an existing profile when the source is skipped", async () => {
    const form = wizardForm(); form.set("profileMode", "link"); form.set("profileSelectionId", "profile-1");
    mocks.getProfile.mockResolvedValue({ id: "profile-1" });
    mocks.createLearningSpaceForOwner.mockResolvedValue({ id: "space-new", slug: "nieuwe-ruimte" });
    expect(await createLearningSpaceAction(form)).toMatchObject({ error: null, warnings: [expect.stringContaining("geen bron gekoppeld")] });
    expect(mocks.synchronize).not.toHaveBeenCalled();
  });

  it("returns a duplicate URL to step one without creating or syncing", async () => {
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ id: "existing" });
    expect(await createLearningSpaceAction(wizardForm())).toMatchObject({ step: 1, error: expect.stringContaining("URL bestaat al") });
    expect(mocks.createLearningSpaceForOwner).not.toHaveBeenCalled();
    expect(mocks.synchronize).not.toHaveBeenCalled();
  });

  it("defers synchronization until a newly created profile is edited", async () => {
    const form = wizardForm(); form.set("profileMode", "new"); form.set("sourceSetup", "now"); form.set("sourceType", "local"); form.set("localSourcePath", "C:\\test");
    mocks.getProfile.mockResolvedValue({ id: "new-profile" }); mocks.createLearningSpaceForOwner.mockResolvedValue({ id: "space-new", slug: "nieuwe-ruimte" });
    expect(await createLearningSpaceAction(form)).toMatchObject({ error: null, editProfileId: "new-profile" });
    expect(mocks.synchronize).not.toHaveBeenCalled();
  });

  it("uses the existing create action and returns to the refreshed admin overview", async () => {
    await expect(createLearningSpaceAction(modalForm())).rejects.toThrow("REDIRECT:/admin?created=1");

    expect(mocks.createLearningSpaceForOwner).toHaveBeenCalledWith(expect.objectContaining({ subjectId: "subject-wiskunde", slug: "nieuwe-ruimte", sortOrder: undefined, sourceType: "local", description: "Overzicht van de portfolio's met oefeningen." }), "teacher-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("uses supplied creation terminology when no description is provided", async () => {
    const form = modalForm();
    form.set("collectionLabelSingular", "Bundel");
    form.set("collectionLabelPlural", "Bundels");
    form.set("exerciseLabelSingular", "Opdracht");
    form.set("exerciseLabelPlural", "Opdrachten");
    await expect(createLearningSpaceAction(form)).rejects.toThrow("REDIRECT:/admin?created=1");
    expect(mocks.createLearningSpaceForOwner).toHaveBeenCalledWith(expect.objectContaining({ description: "Overzicht van de bundels met opdrachten." }), "teacher-1");
  });

  it("returns a missing-subject error to an open modal", async () => {
    const form = new FormData();
    form.set("returnTo", "admin");

    await expect(createLearningSpaceAction(form)).rejects.toThrow("REDIRECT:/admin?create=1&createError=subject");

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
  form.set("subjectId", "subject-wiskunde");
  return form;
}

function wizardForm(): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries({ creationFlow: "wizard", subjectId: "subject-wiskunde", name: "Nieuwe ruimte", shortLabel: "NIEUW", slug: "nieuwe-ruimte", cardColor: "#DCEFE9", profileMode: "later", sourceSetup: "later" })) form.set(key, value);
  const terms = terminologyScenario("bundle");
  for (const entity of ["theme", "collection", "section", "exercise"] as const) {
    form.set(`${entity}LabelSingular`, terms[entity].singular);
    form.set(`${entity}LabelPlural`, terms[entity].plural);
  }
  form.set("exerciseLabelShort", terms.exercise.short);
  return form;
}
