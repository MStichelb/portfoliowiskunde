"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth";
import { archiveSourceProfile, copySourceProfileToLearningSpace, linkSourceProfileToLearningSpace, permanentlyDeleteSourceProfile, renameManagedSourceProfile, restoreSourceProfile, saveManagedSourceProfile, updateManagedSourceProfileGlobalResources } from "@/lib/source-profiles";
import {
  archiveSourceProfileTemplate,
  copySourceProfileTemplateToLearningSpace,
  createSourceProfileTemplate,
  duplicateSourceProfileTemplate,
  permanentlyDeleteSourceProfileTemplate,
  restoreSourceProfileTemplate,
  setDefaultSourceProfileTemplate,
  updateSourceProfileTemplateGlobalResources,
  updateSourceProfileTemplateMetadata,
} from "@/lib/source-profile-templates";

export async function archiveManagedSourceProfileAction(formData: FormData): Promise<never> {
  return runProfileLifecycleAction(formData, "archived", archiveSourceProfile, false);
}

export async function restoreManagedSourceProfileAction(formData: FormData): Promise<never> {
  return runProfileLifecycleAction(formData, "restored", restoreSourceProfile, true);
}

export async function permanentlyDeleteManagedSourceProfileAction(formData: FormData): Promise<never> {
  return runProfileLifecycleAction(formData, "deleted", permanentlyDeleteSourceProfile, true);
}

export async function copyManagedSourceProfileAction(formData: FormData): Promise<never> {
  const user = await requireAdminUser();
  try {
    const result = await copySourceProfileToLearningSpace(user, value(formData, "sourceProfileId"), value(formData, "targetLearningSpaceId"));
    if (!result.activated) throw new Error("De profielkopie kon niet worden geactiveerd.");
  } catch (error) {
    redirect(`/admin/bronprofielen?error=${encodeURIComponent(error instanceof Error ? error.message : "Het profiel kon niet worden gekopieerd.")}`);
  }
  revalidatePath("/admin/bronprofielen");
  redirect("/admin/bronprofielen?saved=copied");
}

export async function linkManagedSourceProfileAction(formData: FormData): Promise<never> {
  const user = await requireAdminUser();
  try {
    await linkSourceProfileToLearningSpace(user, value(formData, "sourceProfileId"), value(formData, "targetLearningSpaceId"));
  } catch (error) {
    redirect(`/admin/bronprofielen?linkProfile=${encodeURIComponent(value(formData, "sourceProfileId"))}&error=${encodeURIComponent(error instanceof Error ? error.message : "Het profiel kon niet worden gekoppeld.")}`);
  }
  revalidatePath("/admin/bronprofielen");
  redirect("/admin/bronprofielen?saved=linked");
}

export async function copyManagedSourceProfileTemplateAction(formData: FormData): Promise<never> {
  const user = await requireAdminUser();
  const targetLearningSpaceId = value(formData, "managementLearningSpaceId");
  try {
    await copySourceProfileTemplateToLearningSpace(user, value(formData, "templateId"), targetLearningSpaceId);
  } catch (error) {
    redirect(`/admin/bronprofielen?error=${encodeURIComponent(error instanceof Error ? error.message : "Het sjabloon kon niet worden gekopieerd.")}`);
  }
  revalidatePath("/admin/bronprofielen");
  redirect("/admin/bronprofielen?saved=templateCopied");
}

export async function updateManagedSourceProfileGlobalResourcesAction(formData: FormData): Promise<never> {
  const user = await requireAdminUser();
  const sourceProfileId = value(formData, "sourceProfileId");
  try {
    await updateManagedSourceProfileGlobalResources(
      user,
      sourceProfileId,
      parseResources(formData),
      value(formData, "confirmShared") === "all" ? "all" : undefined,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "De globale documenten konden niet worden opgeslagen.";
    redirect(`/admin/bronprofielen?profile=${encodeURIComponent(sourceProfileId)}&error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/admin/bronprofielen");
  redirect("/admin/bronprofielen?saved=resourcesUpdated");
}

export async function saveManagedSourceProfileAction(formData: FormData): Promise<never> {
  const user = await requireAdminUser();
  const sourceProfileId = value(formData, "sourceProfileId");
  const mode = value(formData, "saveMode") === "copy" ? "copy" : "all";
  let saved: "profileUpdated" | "profileSplit";
  try {
    const result = await saveManagedSourceProfile(user, sourceProfileId, {
      name: value(formData, "name"),
      resources: parseResources(formData),
      mode,
      targetLearningSpaceId: value(formData, "targetLearningSpaceId") || undefined,
    });
    saved = result.mode === "copy" ? "profileSplit" : "profileUpdated";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Het bronprofiel kon niet worden opgeslagen.";
    redirect(`/admin/bronprofielen?profile=${encodeURIComponent(sourceProfileId)}&error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/admin/bronprofielen");
  redirect(`/admin/bronprofielen?saved=${saved}`);
}

export async function renameManagedSourceProfileAction(formData: FormData): Promise<never> {
  const user = await requireAdminUser();
  const sourceProfileId = value(formData, "sourceProfileId");
  try {
    await renameManagedSourceProfile(user, sourceProfileId, value(formData, "name"), value(formData, "confirmShared") === "all" ? "all" : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : "De profielnaam kon niet worden gewijzigd.";
    redirect(`/admin/bronprofielen?profile=${encodeURIComponent(sourceProfileId)}&error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/admin/bronprofielen");
  redirect("/admin/bronprofielen?saved=renamed");
}

export async function createSourceProfileTemplateAction(formData: FormData): Promise<never> {
  return runTemplateAction(formData, "created", "create", async (user) => {
    await createSourceProfileTemplate(user, {
      name: value(formData, "name"),
      description: value(formData, "description"),
      sourceTemplateId: value(formData, "sourceTemplateId"),
    });
  });
}

export async function updateSourceProfileTemplateAction(formData: FormData): Promise<never> {
  return runTemplateAction(formData, "updated", "manage", async (user, templateId) => {
    await updateSourceProfileTemplateMetadata(user, templateId, {
      name: value(formData, "name"),
      description: value(formData, "description"),
    });
  });
}

export async function updateSourceProfileTemplateGlobalResourcesAction(formData: FormData): Promise<never> {
  return runTemplateAction(formData, "resourcesUpdated", "manage", async (user, templateId) => {
    await updateSourceProfileTemplateGlobalResources(user, templateId, parseResources(formData));
  });
}

export async function duplicateSourceProfileTemplateAction(formData: FormData): Promise<never> {
  return runTemplateAction(formData, "duplicated", "manage", async (user, templateId) => {
    await duplicateSourceProfileTemplate(user, templateId);
  });
}

export async function setDefaultSourceProfileTemplateAction(formData: FormData): Promise<never> {
  return runTemplateAction(formData, "default", "default", async (user, templateId) => {
    await setDefaultSourceProfileTemplate(user, templateId);
  });
}

export async function archiveSourceProfileTemplateAction(formData: FormData): Promise<never> {
  return runTemplateLifecycleAction(formData, "archived", archiveSourceProfileTemplate, false);
}

export async function restoreSourceProfileTemplateAction(formData: FormData): Promise<never> {
  return runTemplateLifecycleAction(formData, "restored", restoreSourceProfileTemplate, true);
}

export async function permanentlyDeleteSourceProfileTemplateAction(formData: FormData): Promise<never> {
  return runTemplateLifecycleAction(formData, "deleted", permanentlyDeleteSourceProfileTemplate, true);
}

async function runProfileLifecycleAction(
  formData: FormData,
  saved: "archived" | "restored" | "deleted",
  mutation: (user: Awaited<ReturnType<typeof requireAdminUser>>, sourceProfileId: string) => Promise<void>,
  showArchive: boolean,
): Promise<never> {
  const user = await requireAdminUser();
  const sourceProfileId = value(formData, "sourceProfileId");
  try {
    await mutation(user, sourceProfileId);
  } catch (error) {
    const archive = showArchive ? "&archive=1" : "";
    redirect(`/admin/bronprofielen?error=${encodeURIComponent(error instanceof Error ? error.message : "De bronprofiellifecycle kon niet worden uitgevoerd.")}${archive}`);
  }
  revalidatePath("/admin/bronprofielen");
  redirect(`/admin/bronprofielen?saved=${saved}${showArchive ? "&archive=1" : ""}`);
}

async function runTemplateLifecycleAction(
  formData: FormData,
  saved: "archived" | "restored" | "deleted",
  mutation: (user: Awaited<ReturnType<typeof requireAdminUser>>, templateId: string) => Promise<void>,
  showArchive: boolean,
): Promise<never> {
  const user = await requireAdminUser();
  const templateId = value(formData, "templateId");
  try {
    await mutation(user, templateId);
  } catch (error) {
    const archive = showArchive ? "&templateArchive=1" : "";
    redirect(`/admin/bronprofielen?tab=templates&templateError=${encodeURIComponent(error instanceof Error ? error.message : "De sjabloonlifecycle kon niet worden uitgevoerd.")}${archive}`);
  }
  revalidatePath("/admin/bronprofielen");
  redirect(`/admin/bronprofielen?tab=templates&templateSaved=${saved}${showArchive ? "&templateArchive=1" : ""}`);
}

async function runTemplateAction(
  formData: FormData,
  saved: "created" | "updated" | "duplicated" | "default" | "resourcesUpdated",
  errorModal: "create" | "manage" | "default",
  mutation: (user: Awaited<ReturnType<typeof requireAdminUser>>, templateId: string) => Promise<void>,
): Promise<never> {
  const user = await requireAdminUser();
  const templateId = value(formData, "templateId");
  try {
    await mutation(user, templateId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Het bronprofielsjabloon kon niet worden gewijzigd.";
    const target = templateId ? `&template=${encodeURIComponent(templateId)}` : "";
    redirect(`/admin/bronprofielen?templateModal=${errorModal}${target}&templateError=${encodeURIComponent(message)}`);
  }
  revalidatePath("/admin/bronprofielen");
  redirect(`/admin/bronprofielen?templateSaved=${saved}`);
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function parseResources(formData: FormData): unknown {
  const raw = value(formData, "resourcesJson");
  if (!raw) throw new Error("Globale documenten ontbreken.");
  try { return JSON.parse(raw) as unknown; } catch { throw new Error("Globale documenten hebben een ongeldig formaat."); }
}
