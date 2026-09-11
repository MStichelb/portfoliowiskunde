"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace, requireLearningSpaceConfiguration } from "@/lib/authorization";
import { getLearningSpace } from "@/lib/repositories";
import { copyActiveSourceProfileToLearningSpace, createOwnSourceProfile, renameSourceProfile, switchActiveSourceProfile } from "@/lib/source-profiles";
import { copySourceProfileTemplateToLearningSpace } from "@/lib/source-profile-templates";
import { listManagedMemberships, removeManagedMembership, upsertManagedMembership } from "@/lib/user-management";

export async function addLearningSpaceEditorAction(formData: FormData) {
  const learningSpaceId = value(formData, "learningSpaceId");
  const user = await requireAdminUser();
  await requireLearningSpaceConfiguration(user, learningSpaceId);
  const space = await getLearningSpace(learningSpaceId);
  if (!space) redirect("/admin");
  try {
    await upsertManagedMembership(learningSpaceId, value(formData, "userId"), "editor");
  } catch (error) {
    redirect(`/admin/${encodeURIComponent(space.slug)}/instellingen?memberError=${encodeURIComponent(error instanceof Error ? error.message : "Editor kon niet worden toegevoegd.")}`);
  }
  revalidatePath(`/admin/${encodeURIComponent(space.slug)}/instellingen`);
  redirect(`/admin/${encodeURIComponent(space.slug)}/instellingen?memberSaved=1`);
}

export async function removeLearningSpaceEditorAction(formData: FormData) {
  const learningSpaceId = value(formData, "learningSpaceId");
  const targetUserId = value(formData, "userId");
  const user = await requireAdminUser();
  await requireLearningSpaceConfiguration(user, learningSpaceId);
  const space = await getLearningSpace(learningSpaceId);
  if (!space) redirect("/admin");
  const membership = (await listManagedMemberships()).find((item) => item.learningSpaceId === learningSpaceId && item.userId === targetUserId);
  if (!membership || membership.role !== "editor") {
    redirect(`/admin/${encodeURIComponent(space.slug)}/instellingen?memberError=${encodeURIComponent("Alleen een editor kan via deze sectie worden verwijderd.")}`);
  }
  await removeManagedMembership(learningSpaceId, targetUserId);
  revalidatePath(`/admin/${encodeURIComponent(space.slug)}/instellingen`);
  redirect(`/admin/${encodeURIComponent(space.slug)}/instellingen?memberSaved=1`);
}

export async function switchSourceProfileAction(formData: FormData) {
  await runSourceProfileAction(formData, "switched", "switch", async (user, learningSpaceId) => {
    await switchActiveSourceProfile(user, learningSpaceId, value(formData, "sourceProfileId"));
  });
}

export async function createOwnSourceProfileAction(formData: FormData) {
  await runSourceProfileAction(formData, "created", null, async (user, learningSpaceId) => {
    await createOwnSourceProfile(user, learningSpaceId);
  });
}

export async function copySourceProfileAction(formData: FormData) {
  await runSourceProfileAction(formData, "copiedInactive", "copy", async (user, learningSpaceId) => {
    await copyActiveSourceProfileToLearningSpace(user, learningSpaceId, value(formData, "targetLearningSpaceId"));
  });
}

export async function copySourceProfileTemplateAction(formData: FormData) {
  await runSourceProfileAction(formData, "templateCopied", "switch", async (user, learningSpaceId) => {
    await copySourceProfileTemplateToLearningSpace(user, value(formData, "templateId"), learningSpaceId, true);
  });
}

export async function renameSourceProfileAction(formData: FormData) {
  await runSourceProfileAction(formData, "renamed", "rename", async (user, learningSpaceId) => {
    await renameSourceProfile(user, learningSpaceId, value(formData, "sourceProfileId"), value(formData, "name"));
  });
}

async function runSourceProfileAction(
  formData: FormData,
  saved: SourceProfileSaved,
  errorModal: "switch" | "rename" | "copy" | null,
  mutation: (user: Awaited<ReturnType<typeof requireAdminUser>>, learningSpaceId: string) => Promise<SourceProfileSaved | void>,
): Promise<never> {
  const learningSpaceId = value(formData, "learningSpaceId");
  const user = await requireAdminUser();
  if (!await canManageLearningSpace(user, learningSpaceId)) redirect("/admin");
  const space = await getLearningSpace(learningSpaceId);
  if (!space) redirect("/admin");
  try {
    saved = await mutation(user, learningSpaceId) ?? saved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bronprofiel kon niet worden gewijzigd.";
    const modalQuery = errorModal ? `&profileModal=${errorModal}` : "";
    redirect(`/admin/${encodeURIComponent(space.slug)}/instellingen?profileError=${encodeURIComponent(message)}${modalQuery}`);
  }
  revalidatePath(`/admin/${encodeURIComponent(space.slug)}/instellingen`);
  redirect(`/admin/${encodeURIComponent(space.slug)}/instellingen?profileSaved=${saved}`);
}

type SourceProfileSaved = "switched" | "created" | "copied" | "copiedInactive" | "templateCopied" | "renamed";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
