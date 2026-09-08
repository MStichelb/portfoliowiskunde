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
  redirect(`/admin/verbindingen?emergency=${enabled ? "enabled" : "disabled"}`);
}

export async function saveSourcePathAction(formData: FormData) {
  await requireAdmin();
  const sourcePath = String(formData.get("sourcePath") ?? "").trim();
  if (!sourcePath) redirect("/admin?error=empty-source-path");
  try {
    await setLocalSourcePath(sourcePath);
  } catch {
    redirect("/admin?error=invalid-source-path");
  }
  revalidatePath("/admin");
  redirect("/admin");
}

export async function resetSourcePathAction() {
  await requireAdmin();
  await resetLocalSourcePath();
  revalidatePath("/admin");
  redirect("/admin");
}
