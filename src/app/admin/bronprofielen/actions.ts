"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth";
import { renameManagedSourceProfile } from "@/lib/source-profiles";

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

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
