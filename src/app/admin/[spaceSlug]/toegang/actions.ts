"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth";
import { requireLearningSpaceConfiguration } from "@/lib/authorization";
import { getLearningSpace } from "@/lib/repositories";
import {
  removeLearningSpaceTeacherAccess,
  setLearningSpaceTeacherAccess,
  type LearningSpaceTeacherAccessRole,
} from "@/lib/user-management";

export async function saveLearningSpaceTeacherAccessAction(formData: FormData) {
  await mutateTeacherAccess(
    value(formData, "learningSpaceId"),
    value(formData, "userId"),
    value(formData, "role"),
  );
}

export async function removeLearningSpaceTeacherAccessAction(formData: FormData) {
  await mutateTeacherAccess(value(formData, "learningSpaceId"), value(formData, "userId"), null);
}

async function mutateTeacherAccess(
  learningSpaceId: string,
  userId: string,
  requestedRole: string | null,
): Promise<never> {
  const actor = await requireAdminUser();
  await requireLearningSpaceConfiguration(actor, learningSpaceId);
  const space = await getLearningSpace(learningSpaceId);
  if (!space) redirect("/admin");
  try {
    if (requestedRole === null) {
      await removeLearningSpaceTeacherAccess(learningSpaceId, userId);
    } else {
      if (requestedRole !== "viewer" && requestedRole !== "editor") throw new Error("Ongeldige toegangsrol.");
      const role: LearningSpaceTeacherAccessRole = requestedRole;
      await setLearningSpaceTeacherAccess(learningSpaceId, userId, role);
    }
  } catch (error) {
    redirect(`/admin/${encodeURIComponent(space.slug)}/toegang?accessError=${encodeURIComponent(
      error instanceof Error ? error.message : "De toegang kon niet worden gewijzigd.",
    )}`);
  }
  revalidatePath(`/admin/${encodeURIComponent(space.slug)}/toegang`);
  revalidatePath("/admin/gebruikers");
  redirect(`/admin/${encodeURIComponent(space.slug)}/toegang?accessSaved=1`);
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
