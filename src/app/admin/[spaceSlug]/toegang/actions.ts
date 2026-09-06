"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth";
import { requireLearningSpaceConfiguration } from "@/lib/authorization";
import { createLearningSpaceGroupMapping } from "@/lib/identity";
import { getLearningSpace } from "@/lib/repositories";
import {
  deleteLearningSpaceGroupMapping,
  listKnownExternalGroups,
  listLearningSpaceGroupMappings,
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

export async function saveLearningSpaceGroupMappingAction(formData: FormData) {
  const learningSpaceId = value(formData, "learningSpaceId");
  const actor = await requireAdminUser();
  await requireLearningSpaceConfiguration(actor, learningSpaceId);
  const space = await getLearningSpace(learningSpaceId);
  if (!space) redirect("/admin");

  try {
    const externalGroupId = value(formData, "externalGroupId");
    const known = (await listKnownExternalGroups()).find((group) =>
      group.provider === "smartschool" && group.externalGroupId === externalGroupId);
    if (!known) throw new Error("Deze Smartschoolgroep is niet bekend. Laat een groepslid eerst opnieuw aanmelden.");
    const duplicate = (await listLearningSpaceGroupMappings(learningSpaceId)).some((mapping) =>
      mapping.provider === "smartschool" && mapping.externalGroupId === externalGroupId);
    if (duplicate) throw new Error("Deze Smartschoolgroep is al aan deze leeromgeving gekoppeld.");
    await createLearningSpaceGroupMapping({
      learningSpaceId,
      provider: "smartschool",
      externalGroupId,
      externalGroupName: known.externalGroupName,
    });
  } catch (error) {
    redirectToGroupResult(space.slug, error instanceof Error ? error.message : "De groep kon niet worden gekoppeld.");
  }

  finishGroupMutation(space.slug);
}

export async function removeLearningSpaceGroupMappingAction(formData: FormData) {
  const learningSpaceId = value(formData, "learningSpaceId");
  const actor = await requireAdminUser();
  await requireLearningSpaceConfiguration(actor, learningSpaceId);
  const space = await getLearningSpace(learningSpaceId);
  if (!space) redirect("/admin");

  try {
    const mappingId = value(formData, "mappingId");
    const mapping = (await listLearningSpaceGroupMappings(learningSpaceId)).find((candidate) => candidate.id === mappingId);
    if (!mapping) throw new Error("Deze groepskoppeling bestaat niet in deze leeromgeving.");
    await deleteLearningSpaceGroupMapping(mappingId, learningSpaceId);
  } catch (error) {
    redirectToGroupResult(space.slug, error instanceof Error ? error.message : "De koppeling kon niet worden verwijderd.");
  }

  finishGroupMutation(space.slug);
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

function finishGroupMutation(spaceSlug: string): never {
  const path = `/admin/${encodeURIComponent(spaceSlug)}/toegang`;
  revalidatePath(path);
  revalidatePath("/admin/gebruikers");
  redirect(`${path}?groupSaved=1`);
}

function redirectToGroupResult(spaceSlug: string, message: string): never {
  redirect(`/admin/${encodeURIComponent(spaceSlug)}/toegang?groupError=${encodeURIComponent(message)}`);
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
