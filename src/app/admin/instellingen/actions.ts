"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { setPublicEmergencyAccess } from "@/lib/public-access";
import { resetLocalSourcePath, setLocalSourcePath } from "@/lib/repositories";

export async function setPublicEmergencyAccessAction(formData: FormData) {
  await requireAdmin();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  await setPublicEmergencyAccess(enabled);
  revalidatePath("/");
  revalidatePath("/admin", "layout");
  redirect(`/admin/instellingen?emergency=${enabled ? "enabled" : "disabled"}`);
}

export async function saveSourcePathAction(formData: FormData) {
  await requireAdmin();
  const sourcePath = String(formData.get("sourcePath") ?? "").trim();
  if (!sourcePath) redirect("/admin/instellingen?error=empty");
  try {
    await setLocalSourcePath(sourcePath);
  } catch {
    redirect("/admin/instellingen?error=invalid-path");
  }
  revalidatePath("/admin");
  revalidatePath("/admin/instellingen");
  redirect("/admin/instellingen?saved=1");
}

export async function resetSourcePathAction() {
  await requireAdmin();
  await resetLocalSourcePath();
  revalidatePath("/admin");
  revalidatePath("/admin/instellingen");
  redirect("/admin/instellingen?reset=1");
}
