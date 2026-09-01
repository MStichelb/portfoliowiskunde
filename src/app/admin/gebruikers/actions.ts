"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { createLearningSpaceGroupMapping } from "@/lib/identity";
import {
  deleteManagedGroupMapping,
  listKnownExternalGroups,
  removeManagedMembership,
  updateManagedUserRole,
  updateManagedUserStatus,
  upsertManagedMembership,
} from "@/lib/user-management";

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

export async function saveMembershipAction(formData: FormData) {
  await requireAdmin();
  const role = value(formData, "role");
  if (role !== "owner" && role !== "editor") return fail("Ongeldige beheerrol.");
  await run(() => upsertManagedMembership(value(formData, "learningSpaceId"), value(formData, "userId"), role));
}

export async function removeMembershipAction(formData: FormData) {
  await requireAdmin();
  await run(() => removeManagedMembership(value(formData, "learningSpaceId"), value(formData, "userId")));
}

export async function createGroupMappingAction(formData: FormData) {
  await requireAdmin();
  const provider = value(formData, "provider");
  const externalGroupId = value(formData, "externalGroupId");
  const known = (await listKnownExternalGroups()).find((group) => group.provider === provider && group.externalGroupId === externalGroupId);
  if (!known) return fail("Deze Smartschoolgroep is niet bekend. Laat een groepslid eerst opnieuw aanmelden.");
  await run(() => createLearningSpaceGroupMapping({
    learningSpaceId: value(formData, "learningSpaceId"), provider,
    externalGroupId, externalGroupName: known.externalGroupName,
  }));
}

export async function removeGroupMappingAction(formData: FormData) {
  await requireAdmin();
  await run(() => deleteManagedGroupMapping(value(formData, "id")));
}

async function run(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    fail(error instanceof Error ? error.message : "De wijziging kon niet worden opgeslagen.");
  }
  revalidatePath("/admin/gebruikers");
  redirect("/admin/gebruikers?saved=1");
}

function fail(message: string): never {
  redirect(`/admin/gebruikers?error=${encodeURIComponent(message)}`);
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
