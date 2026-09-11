"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth";
import { renameManagedSourceProfile } from "@/lib/source-profiles";
import {
  createSourceProfileTemplate,
  duplicateSourceProfileTemplate,
  setDefaultSourceProfileTemplate,
  updateSourceProfileTemplateMetadata,
} from "@/lib/source-profile-templates";

export async function renameManagedSourceProfileAction(formData: FormData): Promise<never> {
  const user = await requireAdminUser();
  const sourceProfileId = value(formData, "sourceProfileId");
  try {
    await renameManagedSourceProfile(user, sourceProfileId, value(formData, "name"));
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
