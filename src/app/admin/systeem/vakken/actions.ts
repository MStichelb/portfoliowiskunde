"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { createSubject, renameSubject, setSubjectActive, updateSubjectSortOrder } from "@/lib/subjects";

export async function createSubjectAction(formData: FormData): Promise<never> {
  return runSubjectAction("created", async (user) => {
    await createSubject(user, { name: value(formData, "name"), sortOrder: sortOrder(formData) });
  });
}

export async function renameSubjectAction(formData: FormData): Promise<never> {
  return runSubjectAction("renamed", async (user) => {
    await renameSubject(user, value(formData, "subjectId"), value(formData, "name"));
  });
}

export async function updateSubjectSortOrderAction(formData: FormData): Promise<never> {
  return runSubjectAction("sorted", async (user) => {
    await updateSubjectSortOrder(user, value(formData, "subjectId"), sortOrder(formData));
  });
}

export async function setSubjectActiveAction(formData: FormData): Promise<never> {
  const active = value(formData, "active") === "true";
  return runSubjectAction(active ? "activated" : "deactivated", async (user) => {
    await setSubjectActive(user, value(formData, "subjectId"), active);
  });
}

async function runSubjectAction(saved: string, mutation: (user: Awaited<ReturnType<typeof requireAdmin>>) => Promise<void>): Promise<never> {
  const user = await requireAdmin();
  try {
    await mutation(user);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Het vak kon niet worden opgeslagen.";
    redirect(`/admin/systeem/vakken?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/admin/systeem/vakken");
  redirect(`/admin/systeem/vakken?saved=${saved}`);
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function sortOrder(formData: FormData): number {
  const raw = value(formData, "sortOrder");
  if (!/^\d+$/.test(raw)) throw new Error("De sortering moet een geheel getal van nul of groter zijn.");
  return Number(raw);
}
