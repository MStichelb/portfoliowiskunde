"use server";

import { revalidatePath } from "next/cache";

import { setExerciseVisibility, setPortfolioVisibility } from "@/lib/repositories";
import { synchronizeSource } from "@/lib/sync";

export async function syncAction() {
  await synchronizeSource();
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function portfolioVisibilityAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const visible = formData.get("visible") === "true";
  if (!id) return;
  await setPortfolioVisibility(id, visible);
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function exerciseVisibilityAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const visible = formData.get("visible") === "true";
  if (!id) return;
  await setExerciseVisibility(id, visible);
  revalidatePath("/");
  revalidatePath("/admin");
}
