"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth";
import { canConfigureLearningSpace } from "@/lib/authorization";
import { copySourceProfileToLearningSpace, linkSourceProfileToLearningSpace, renameManagedSourceProfile } from "@/lib/source-profiles";
import {
  copySourceProfileTemplateToLearningSpace,
  createSourceProfileTemplate,
  duplicateSourceProfileTemplate,
  setDefaultSourceProfileTemplate,
  updateSourceProfileTemplateMetadata,
} from "@/lib/source-profile-templates";

export async function copyManagedSourceProfileAction(formData: FormData): Promise<never> {
  const user = await requireAdminUser();
  let activated = false;
  try {
    const result = await copySourceProfileToLearningSpace(user, value(formData, "sourceProfileId"), value(formData, "targetLearningSpaceId"));
    activated = result.activated;
  } catch (error) {
    redirect(`/admin/bronprofielen?error=${encodeURIComponent(error instanceof Error ? error.message : "Het profiel kon niet worden gekopieerd.")}`);
  }
  revalidatePath("/admin/bronprofielen");
  redirect(`/admin/bronprofielen?saved=${activated ? "copied" : "copiedInactive"}`);
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
  let activated = false;
  try {
    activated = await canConfigureLearningSpace(user, targetLearningSpaceId);
    await copySourceProfileTemplateToLearningSpace(user, value(formData, "templateId"), targetLearningSpaceId, activated);
  } catch (error) {
    redirect(`/admin/bronprofielen?error=${encodeURIComponent(error instanceof Error ? error.message : "Het sjabloon kon niet worden gekopieerd.")}`);
  }
  revalidatePath("/admin/bronprofielen");
  redirect(`/admin/bronprofielen?saved=${activated ? "templateCopied" : "templateCopiedInactive"}`);
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

async function runTemplateAction(
  formData: FormData,
  saved: "created" | "updated" | "duplicated" | "default",
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
