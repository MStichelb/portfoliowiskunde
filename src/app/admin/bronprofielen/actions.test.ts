import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  renameManagedSourceProfile: vi.fn(),
  saveManagedSourceProfile: vi.fn(),
  updateManagedSourceProfileGlobalResources: vi.fn(),
  updateManagedSourceProfileExerciseResources: vi.fn(),
  copySourceProfileToLearningSpace: vi.fn(),
  linkSourceProfileToLearningSpace: vi.fn(),
  archiveSourceProfile: vi.fn(),
  restoreSourceProfile: vi.fn(),
  permanentlyDeleteSourceProfile: vi.fn(),
  copySourceProfileTemplateToLearningSpace: vi.fn(),
  createSourceProfileTemplate: vi.fn(),
  saveSourceProfileTemplate: vi.fn(),
  updateSourceProfileTemplateMetadata: vi.fn(),
  updateSourceProfileTemplateGlobalResources: vi.fn(),
  updateSourceProfileTemplateExerciseResources: vi.fn(),
  duplicateSourceProfileTemplate: vi.fn(),
  setDefaultSourceProfileTemplate: vi.fn(),
  archiveSourceProfileTemplate: vi.fn(),
  restoreSourceProfileTemplate: vi.fn(),
  permanentlyDeleteSourceProfileTemplate: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`NEXT_REDIRECT:${destination}`); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/source-profiles", () => ({ renameManagedSourceProfile: mocks.renameManagedSourceProfile, saveManagedSourceProfile: mocks.saveManagedSourceProfile, updateManagedSourceProfileGlobalResources: mocks.updateManagedSourceProfileGlobalResources, updateManagedSourceProfileExerciseResources: mocks.updateManagedSourceProfileExerciseResources, copySourceProfileToLearningSpace: mocks.copySourceProfileToLearningSpace, linkSourceProfileToLearningSpace: mocks.linkSourceProfileToLearningSpace, archiveSourceProfile: mocks.archiveSourceProfile, restoreSourceProfile: mocks.restoreSourceProfile, permanentlyDeleteSourceProfile: mocks.permanentlyDeleteSourceProfile }));
vi.mock("@/lib/source-profile-templates", () => ({
  copySourceProfileTemplateToLearningSpace: mocks.copySourceProfileTemplateToLearningSpace,
  createSourceProfileTemplate: mocks.createSourceProfileTemplate,
  saveSourceProfileTemplate: mocks.saveSourceProfileTemplate,
  updateSourceProfileTemplateMetadata: mocks.updateSourceProfileTemplateMetadata,
  updateSourceProfileTemplateGlobalResources: mocks.updateSourceProfileTemplateGlobalResources,
  updateSourceProfileTemplateExerciseResources: mocks.updateSourceProfileTemplateExerciseResources,
  duplicateSourceProfileTemplate: mocks.duplicateSourceProfileTemplate,
  setDefaultSourceProfileTemplate: mocks.setDefaultSourceProfileTemplate,
  archiveSourceProfileTemplate: mocks.archiveSourceProfileTemplate,
  restoreSourceProfileTemplate: mocks.restoreSourceProfileTemplate,
  permanentlyDeleteSourceProfileTemplate: mocks.permanentlyDeleteSourceProfileTemplate,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";

import {
  archiveManagedSourceProfileAction,
  archiveSourceProfileTemplateAction,
  copyManagedSourceProfileAction,
  copyManagedSourceProfileTemplateAction,
  createSourceProfileTemplateAction,
  duplicateSourceProfileTemplateAction,
  linkManagedSourceProfileAction,
  permanentlyDeleteManagedSourceProfileAction,
  permanentlyDeleteSourceProfileTemplateAction,
  renameManagedSourceProfileAction,
  restoreManagedSourceProfileAction,
  restoreSourceProfileTemplateAction,
  saveManagedSourceProfileAction,
  saveSourceProfileTemplateAction,
  setDefaultSourceProfileTemplateAction,
  updateSourceProfileTemplateAction,
  updateManagedSourceProfileExerciseResourcesAction,
  updateManagedSourceProfileGlobalResourcesAction,
  updateSourceProfileTemplateExerciseResourcesAction,
  updateSourceProfileTemplateGlobalResourcesAction,
} from "./actions";

describe("central source profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: "superadmin", role: "superadmin", status: "active" });
    mocks.renameManagedSourceProfile.mockResolvedValue(undefined);
    mocks.saveManagedSourceProfile.mockResolvedValue({ mode: "all", profile: { id: "profile-1" } });
    mocks.updateManagedSourceProfileGlobalResources.mockResolvedValue(undefined);
    mocks.updateManagedSourceProfileExerciseResources.mockResolvedValue(undefined);
    mocks.updateSourceProfileTemplateGlobalResources.mockResolvedValue(undefined);
    mocks.updateSourceProfileTemplateExerciseResources.mockResolvedValue(undefined);
    mocks.copySourceProfileToLearningSpace.mockResolvedValue({ profile: { id: "copy" }, activated: true });
    mocks.linkSourceProfileToLearningSpace.mockResolvedValue(undefined);
    mocks.copySourceProfileTemplateToLearningSpace.mockResolvedValue(undefined);
    mocks.createSourceProfileTemplate.mockResolvedValue(undefined);
    mocks.saveSourceProfileTemplate.mockResolvedValue(undefined);
    mocks.updateSourceProfileTemplateMetadata.mockResolvedValue(undefined);
    mocks.duplicateSourceProfileTemplate.mockResolvedValue(undefined);
    mocks.setDefaultSourceProfileTemplate.mockResolvedValue(undefined);
    mocks.archiveSourceProfile.mockResolvedValue(undefined);
    mocks.restoreSourceProfile.mockResolvedValue(undefined);
    mocks.permanentlyDeleteSourceProfile.mockResolvedValue(undefined);
    mocks.archiveSourceProfileTemplate.mockResolvedValue(undefined);
    mocks.restoreSourceProfileTemplate.mockResolvedValue(undefined);
    mocks.permanentlyDeleteSourceProfileTemplate.mockResolvedValue(undefined);
  });

  it("routes independent central copies through authenticated domain helpers", async () => {
    const profileData = form("profile-1", "");
    profileData.set("targetLearningSpaceId", "space-5");
    await expect(copyManagedSourceProfileAction(profileData)).rejects.toThrow("saved=copied");
    expect(mocks.copySourceProfileToLearningSpace).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "profile-1", "space-5");

    const templateData = templateForm("template-1");
    templateData.set("managementLearningSpaceId", "space-5");
    await expect(copyManagedSourceProfileTemplateAction(templateData)).rejects.toThrow("saved=templateCopied");
    expect(mocks.copySourceProfileTemplateToLearningSpace).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "template-1", "space-5");
  });

  it("rejects an impossible inactive copy result and routes linking through the guarded helper", async () => {
    mocks.copySourceProfileToLearningSpace.mockResolvedValue({ profile: { id: "copy" }, activated: false });
    const copyData = form("profile-1", "");
    copyData.set("targetLearningSpaceId", "space-5");
    await expect(copyManagedSourceProfileAction(copyData)).rejects.toThrow("error=De%20profielkopie%20kon%20niet%20worden%20geactiveerd");

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

  it("saves profile name and resources through one authenticated action and supports split-copy mode", async () => {
    const data = new FormData();
    data.set("sourceProfileId", "profile-1");
    data.set("name", " Nieuwe naam ");
    data.set("resourcesJson", JSON.stringify([{ id: "manual", kind: "external_link", label: "Formularium", icon: "link", order: 10, semanticRole: "generic" }]));
    data.set("exerciseScannerJson", JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.scanner.exercise));
    data.set("exerciseResourcesJson", JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources));
    data.set("saveMode", "all");
    await expect(saveManagedSourceProfileAction(data)).rejects.toThrow("saved=profileUpdated");
    expect(mocks.saveManagedSourceProfile).toHaveBeenLastCalledWith(expect.objectContaining({ id: "superadmin" }), "profile-1", expect.objectContaining({
      name: "Nieuwe naam",
      exerciseScanner: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.scanner.exercise,
      exerciseResources: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources,
      mode: "all",
      targetLearningSpaceId: undefined,
    }));

    mocks.saveManagedSourceProfile.mockResolvedValueOnce({ mode: "copy", profile: { id: "copy" } });
    data.set("saveMode", "copy");
    data.set("targetLearningSpaceId", "space-5");
    await expect(saveManagedSourceProfileAction(data)).rejects.toThrow("saved=profileSplit");
    expect(mocks.saveManagedSourceProfile).toHaveBeenLastCalledWith(expect.objectContaining({ id: "superadmin" }), "profile-1", expect.objectContaining({
      mode: "copy",
      targetLearningSpaceId: "space-5",
    }));
  });

  it("shows a readable validation message instead of serialized Zod issues", async () => {
    mocks.saveManagedSourceProfile.mockRejectedValueOnce(new ZodError([{
      code: "custom",
      path: [0, "recognition", "fileExtensions"],
      message: "Kies minstens één toegestaan bestandstype.",
    }]));
    const data = new FormData();
    data.set("sourceProfileId", "profile-1");
    data.set("name", "Profiel");
    data.set("resourcesJson", JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources));
    data.set("exerciseScannerJson", JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.scanner.exercise));
    data.set("exerciseResourcesJson", JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources));
    data.set("saveMode", "all");

    await expect(saveManagedSourceProfileAction(data)).rejects.toThrow("error=Kies%20minstens%20%C3%A9%C3%A9n%20toegestaan%20bestandstype.");
    expect(mocks.redirect).toHaveBeenLastCalledWith(expect.not.stringContaining("%5B%7B"));
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

  it("routes profile lifecycle actions through authenticated domain guards", async () => {
    const data = form("profile-1", "");
    await expect(archiveManagedSourceProfileAction(data)).rejects.toThrow("saved=archived");
    await expect(restoreManagedSourceProfileAction(data)).rejects.toThrow("saved=restored");
    await expect(permanentlyDeleteManagedSourceProfileAction(data)).rejects.toThrow("saved=deleted");
    expect(mocks.archiveSourceProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "profile-1");
    expect(mocks.restoreSourceProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "profile-1");
    expect(mocks.permanentlyDeleteSourceProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "profile-1");
  });

  it("routes template lifecycle actions and keeps archive visible after restore/delete", async () => {
    const data = templateForm("template-1");
    await expect(archiveSourceProfileTemplateAction(data)).rejects.toThrow("templateSaved=archived");
    await expect(restoreSourceProfileTemplateAction(data)).rejects.toThrow("templateSaved=restored");
    await expect(permanentlyDeleteSourceProfileTemplateAction(data)).rejects.toThrow("templateSaved=deleted");
    expect(mocks.archiveSourceProfileTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "template-1");
    expect(mocks.restoreSourceProfileTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "template-1");
    expect(mocks.permanentlyDeleteSourceProfileTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "template-1");
    expect(mocks.redirect).toHaveBeenLastCalledWith(expect.stringContaining("templateArchive=1"));
  });

  it("updates concrete profile global resources through the authenticated write path", async () => {
    const form = new FormData();
    form.set("sourceProfileId", "profile-1");
    form.set("resourcesJson", JSON.stringify([{ id: "manual", kind: "external_link", label: "Formularium", icon: "link", order: 10, semanticRole: "generic" }]));
    await expect(updateManagedSourceProfileGlobalResourcesAction(form)).rejects.toThrow("NEXT_REDIRECT:/admin/bronprofielen?saved=resourcesUpdated");
    expect(mocks.updateManagedSourceProfileGlobalResources).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "profile-1", expect.any(Array), undefined);
  });

  it("saves template metadata and both resource groups through one top-level save action", async () => {
    const form = templateForm("template-1", " Nieuwe naam ", " Nieuwe beschrijving ");
    form.set("resourcesJson", JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources));
    form.set("exerciseScannerJson", JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.scanner.exercise));
    form.set("exerciseResourcesJson", JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources));

    await expect(saveSourceProfileTemplateAction(form)).rejects.toThrow("NEXT_REDIRECT:/admin/bronprofielen?templateSaved=updated");
    expect(mocks.saveSourceProfileTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "superadmin" }),
      "template-1",
      {
        name: "Nieuwe naam",
        description: "Nieuwe beschrijving",
        resources: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources,
        exerciseScanner: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.scanner.exercise,
        exerciseResources: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources,
      },
    );
  });

  it("updates template global resources through the superadmin write path", async () => {
    const form = new FormData();
    form.set("templateId", "template-1");
    form.set("resourcesJson", JSON.stringify([{ id: "manual", kind: "external_link", label: "Formularium", icon: "link", order: 10, semanticRole: "generic" }]));
    await expect(updateSourceProfileTemplateGlobalResourcesAction(form)).rejects.toThrow("NEXT_REDIRECT:/admin/bronprofielen?templateSaved=resourcesUpdated");
    expect(mocks.updateSourceProfileTemplateGlobalResources).toHaveBeenCalledWith(expect.objectContaining({ id: "superadmin" }), "template-1", expect.any(Array));
  });


  it("updates concrete profile exercise resources through the authenticated write path", async () => {
    const form = new FormData();
    form.set("sourceProfileId", "profile-1");
    form.set("exerciseScannerJson", JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.scanner.exercise));
    form.set("exerciseResourcesJson", JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources));
    await expect(updateManagedSourceProfileExerciseResourcesAction(form)).rejects.toThrow("NEXT_REDIRECT:/admin/bronprofielen?saved=exerciseResourcesUpdated");
    expect(mocks.updateManagedSourceProfileExerciseResources).toHaveBeenCalledWith(
      expect.objectContaining({ id: "superadmin" }),
      "profile-1",
      BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources,
      undefined,
    );
  });

  it("updates template exercise resources through the superadmin write path", async () => {
    const form = new FormData();
    form.set("templateId", "template-1");
    form.set("exerciseScannerJson", JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.scanner.exercise));
    form.set("exerciseResourcesJson", JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources));
    await expect(updateSourceProfileTemplateExerciseResourcesAction(form)).rejects.toThrow("NEXT_REDIRECT:/admin/bronprofielen?templateSaved=exerciseResourcesUpdated");
    expect(mocks.updateSourceProfileTemplateExerciseResources).toHaveBeenCalledWith(
      expect.objectContaining({ id: "superadmin" }),
      "template-1",
      BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.exerciseResources,
    );
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
