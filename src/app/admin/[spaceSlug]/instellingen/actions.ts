"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth";
import { requireLearningSpaceConfiguration } from "@/lib/authorization";
import { getLearningSpace } from "@/lib/repositories";
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

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
