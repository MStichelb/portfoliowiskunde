import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  renameManagedSourceProfile: vi.fn(),
  copySourceProfileToLearningSpace: vi.fn(),
  linkSourceProfileToLearningSpace: vi.fn(),
  canConfigureLearningSpace: vi.fn(),
  copySourceProfileTemplateToLearningSpace: vi.fn(),
  createSourceProfileTemplate: vi.fn(),
  updateSourceProfileTemplateMetadata: vi.fn(),
  duplicateSourceProfileTemplate: vi.fn(),
  setDefaultSourceProfileTemplate: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`NEXT_REDIRECT:${destination}`); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/source-profiles", () => ({ renameManagedSourceProfile: mocks.renameManagedSourceProfile, copySourceProfileToLearningSpace: mocks.copySourceProfileToLearningSpace, linkSourceProfileToLearningSpace: mocks.linkSourceProfileToLearningSpace }));
vi.mock("@/lib/authorization", () => ({ canConfigureLearningSpace: mocks.canConfigureLearningSpace }));
vi.mock("@/lib/source-profile-templates", () => ({
  copySourceProfileTemplateToLearningSpace: mocks.copySourceProfileTemplateToLearningSpace,
  createSourceProfileTemplate: mocks.createSourceProfileTemplate,
  updateSourceProfileTemplateMetadata: mocks.updateSourceProfileTemplateMetadata,
  duplicateSourceProfileTemplate: mocks.duplicateSourceProfileTemplate,
  setDefaultSourceProfileTemplate: mocks.setDefaultSourceProfileTemplate,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  copyManagedSourceProfileAction,
  copyManagedSourceProfileTemplateAction,
  createSourceProfileTemplateAction,
  duplicateSourceProfileTemplateAction,
  linkManagedSourceProfileAction,
  renameManagedSourceProfileAction,
  setDefaultSourceProfileTemplateAction,
  updateSourceProfileTemplateAction,
} from "./actions";

describe("central source profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: "superadmin", role: "superadmin", status: "active" });
    mocks.renameManagedSourceProfile.mockResolvedValue(undefined);
    mocks.copySourceProfileToLearningSpace.mockResolvedValue({ profile: { id: "copy" }, activated: true });
    mocks.linkSourceProfileToLearningSpace.mockResolvedValue(undefined);
    mocks.canConfigureLearningSpace.mockResolvedValue(true);
    mocks.copySourceProfileTemplateToLearningSpace.mockResolvedValue(undefined);
    mocks.createSourceProfileTemplate.mockResolvedValue(undefined);
    mocks.updateSourceProfileTemplateMetadata.mockResolvedValue(undefined);
    mocks.duplicateSourceProfileTemplate.mockResolvedValue(undefined);
    mocks.setDefaultSourceProfileTemplate.mockResolvedValue(undefined);
  });

  it("routes independent central copies through authenticated domain helpers", async () => {
    const profileData = form("profile-1", "");
    profileData.set("targetLearningSpaceId", "space-5");
    await expect(copyManagedSourceProfileAction(profileData)).rejects.toThrow("saved=copied");
    expect(mocks.copySourceProfileToLearningSpace).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "profile-1", "space-5");

    const templateData = templateForm("template-1");
    templateData.set("managementLearningSpaceId", "space-5");
    await expect(copyManagedSourceProfileTemplateAction(templateData)).rejects.toThrow("saved=templateCopied");
    expect(mocks.copySourceProfileTemplateToLearningSpace).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "template-1", "space-5", true);
  });

  it("keeps editor copies inactive and routes linking through the guarded helper", async () => {
    mocks.copySourceProfileToLearningSpace.mockResolvedValue({ profile: { id: "copy" }, activated: false });
    const copyData = form("profile-1", "");
    copyData.set("targetLearningSpaceId", "space-5");
    await expect(copyManagedSourceProfileAction(copyData)).rejects.toThrow("saved=copiedInactive");

    const linkData = form("profile-1", "");
    linkData.set("targetLearningSpaceId", "space-5");
    await expect(linkManagedSourceProfileAction(linkData)).rejects.toThrow("saved=linked");
    expect(mocks.linkSourceProfileToLearningSpace).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "profile-1", "space-5");
  });

  it("routes all template mutations through the authenticated server-side domain helpers", async () => {
    const createData = templateForm("", " Nieuw ", " Beschrijving ");
    createData.set("sourceTemplateId", "template-source");
    await expect(createSourceProfileTemplateAction(createData)).rejects.toThrow("templateSaved=created");
    expect(mocks.createSourceProfileTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), {
      name: "Nieuw", description: "Beschrijving", sourceTemplateId: "template-source",
    });

    await expect(updateSourceProfileTemplateAction(templateForm("template-1", " Nieuwe naam ", " Nieuw detail "))).rejects.toThrow("templateSaved=updated");
    expect(mocks.updateSourceProfileTemplateMetadata).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "template-1", {
      name: "Nieuwe naam", description: "Nieuw detail",
    });

    await expect(duplicateSourceProfileTemplateAction(templateForm("template-1"))).rejects.toThrow("templateSaved=duplicated");
    expect(mocks.duplicateSourceProfileTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "template-1");

    await expect(setDefaultSourceProfileTemplateAction(templateForm("template-1"))).rejects.toThrow("templateSaved=default");
    expect(mocks.setDefaultSourceProfileTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "template-1");
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(4);
  });

  it("reopens the matching template modal on validation or authorization errors", async () => {
    mocks.createSourceProfileTemplate.mockRejectedValue(new Error("Alleen een hoofdbeheerder kan appbrede bronprofielsjablonen beheren."));
    await expect(createSourceProfileTemplateAction(templateForm("", "Verboden"))).rejects.toThrow("templateModal=create");

    mocks.updateSourceProfileTemplateMetadata.mockRejectedValue(new Error("Naam bestaat al."));
    await expect(updateSourceProfileTemplateAction(templateForm("template-1", "Dubbel"))).rejects.toThrow("templateModal=manage");
    expect(mocks.redirect).toHaveBeenLastCalledWith(expect.stringContaining("template=template-1"));

    mocks.setDefaultSourceProfileTemplate.mockRejectedValue(new Error("Bronprofielsjabloon niet gevonden."));
    await expect(setDefaultSourceProfileTemplateAction(templateForm("foreign"))).rejects.toThrow("templateModal=default");
    expect(mocks.redirect).toHaveBeenLastCalledWith(expect.stringContaining("template=foreign"));
  });

  it("uses the authenticated user and redirects after a successful rename", async () => {
    await expect(renameManagedSourceProfileAction(form("profile-1", " Nieuwe naam "))).rejects.toThrow("saved=renamed");
    expect(mocks.renameManagedSourceProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "profile-1", "Nieuwe naam", undefined);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/bronprofielen");

    const shared = form("profile-1", "Gedeelde naam");
    shared.set("confirmShared", "all");
    await expect(renameManagedSourceProfileAction(shared)).rejects.toThrow("saved=renamed");
    expect(mocks.renameManagedSourceProfile).toHaveBeenLastCalledWith(expect.objectContaining({ id: "superadmin" }), "profile-1", "Gedeelde naam", "all");
  });

  it("keeps a rejected or foreign profile id inside the central modal", async () => {
    mocks.renameManagedSourceProfile.mockRejectedValue(new Error("Bronprofiel niet beschikbaar."));
    await expect(renameManagedSourceProfileAction(form("foreign", "Naam"))).rejects.toThrow("profile=foreign");
    expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining("error=Bronprofiel%20niet%20beschikbaar."));
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

function form(sourceProfileId: string, name: string): FormData {
  const data = new FormData();
  data.set("sourceProfileId", sourceProfileId);
  data.set("name", name);
  return data;
}

function templateForm(templateId: string, name = "", description = ""): FormData {
  const data = new FormData();
  data.set("templateId", templateId);
  data.set("name", name);
  data.set("description", description);
  return data;
}
