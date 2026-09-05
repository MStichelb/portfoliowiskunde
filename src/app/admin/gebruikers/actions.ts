"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { createLearningSpaceGroupMapping, setConfiguredTeacherGroupId } from "@/lib/identity";
import {
  deleteManagedGroupMapping,
  listKnownClassGroups,
  listKnownExternalGroups,
  listManagedGroupMappings,
  removeManagedMembership,
  setIndividualLearningSpaceAccess,
  updateManagedUserClassOverride,
  updateManagedUserRole,
  updateManagedUserStatus,
  upsertManagedMembership,
} from "@/lib/user-management";
import { resetAllStudents, resetManagedUser, resetStudentsByClass } from "@/lib/user-reset";

export async function updateUserRoleAction(formData: FormData) {
  await requireAdmin();
  const role = value(formData, "role");
  if (role !== "teacher" && role !== "student") return fail("Ongeldige gebruikersrol.");
  await run(() => updateManagedUserRole(value(formData, "userId"), role));
}

export async function updateUserStatusAction(formData: FormData) {
  await requireAdmin();
  const status = value(formData, "status");
  if (status !== "active" && status !== "disabled") return fail("Ongeldige gebruikersstatus.");
  await run(() => updateManagedUserStatus(value(formData, "userId"), status));
}

export async function resetUserAction(formData: FormData) {
  await requireAdmin();
  await run(() => resetManagedUser(value(formData, "userId")));
}

export async function resetClassStudentsAction(formData: FormData) {
  await requireAdmin();
  const classGroupId = value(formData, "classGroupId");
  if (!classGroupId || !(await listKnownClassGroups()).some((group) => group.externalGroupId === classGroupId)) return fail("Selecteer een bekende klas.");
  await run(() => resetStudentsByClass(classGroupId));
}

export async function resetAllStudentsAction() {
  await requireAdmin();
  await run(() => resetAllStudents());
}

export async function updateUserClassAction(formData: FormData) {
  await requireAdmin();
  const groupId = value(formData, "classGroupId");
  if (groupId && !(await listKnownClassGroups()).some((group) => group.externalGroupId === groupId)) return fail("Onbekende klasgroep.");
  await run(() => updateManagedUserClassOverride(value(formData, "userId"), groupId || null));
}

export async function updateIndividualAccessAction(formData: FormData) {
  await requireAdmin();
  await run(() => setIndividualLearningSpaceAccess(
    value(formData, "userId"),
    value(formData, "learningSpaceId"),
    value(formData, "enabled") === "true",
  ));
}

export async function updateTeacherGroupAction(formData: FormData) {
  await requireAdmin();
  const groupId = value(formData, "groupId");
  const target = value(formData, "returnTo") === "/admin/gebruikers" ? "/admin/gebruikers" : "/admin/toegang";
  if (groupId && !(await listKnownExternalGroups()).some((group) => group.provider === "smartschool" && group.externalGroupId === groupId)) {
    return fail("Deze Smartschoolgroep is niet bekend.", target);
  }
  await run(() => setConfiguredTeacherGroupId(groupId || null), target);
}

export async function saveMembershipAction(formData: FormData) {
  await requireAdmin();
  const role = value(formData, "role");
  if (role !== "owner" && role !== "editor") return fail("Ongeldige beheerrol.", "/admin/toegang");
  await run(() => upsertManagedMembership(value(formData, "learningSpaceId"), value(formData, "userId"), role), "/admin/toegang");
}

export async function removeMembershipAction(formData: FormData) {
  await requireAdmin();
  await run(() => removeManagedMembership(value(formData, "learningSpaceId"), value(formData, "userId")), "/admin/toegang");
}

export async function createGroupMappingAction(formData: FormData) {
  await requireAdmin();
  const provider = value(formData, "provider");
  const externalGroupId = value(formData, "externalGroupId");
  const known = (await listKnownExternalGroups()).find((group) => group.provider === provider && group.externalGroupId === externalGroupId);
  if (!known) return fail("Deze Smartschoolgroep is niet bekend. Laat een groepslid eerst opnieuw aanmelden.", "/admin/toegang");
  const duplicate = (await listManagedGroupMappings()).some((mapping) => mapping.learningSpaceId === value(formData, "learningSpaceId") && mapping.provider === provider && mapping.externalGroupId === externalGroupId);
  if (duplicate) return fail("Deze Smartschoolgroep is al aan deze leeromgeving gekoppeld.", "/admin/toegang");
  await run(() => createLearningSpaceGroupMapping({
    learningSpaceId: value(formData, "learningSpaceId"), provider,
    externalGroupId, externalGroupName: known.externalGroupName,
  }), "/admin/toegang");
}

export async function removeGroupMappingAction(formData: FormData) {
  await requireAdmin();
  await run(() => deleteManagedGroupMapping(value(formData, "id")), "/admin/toegang");
}

async function run(operation: () => Promise<unknown>, target = "/admin/gebruikers") {
  try {
    await operation();
  } catch (error) {
    fail(error instanceof Error ? error.message : "De wijziging kon niet worden opgeslagen.", target);
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/gebruikers");
  revalidatePath("/admin/toegang");
  redirect(`${target}?saved=1`);
}

function fail(message: string, target = "/admin/gebruikers"): never {
  redirect(`${target}?error=${encodeURIComponent(message)}`);
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
