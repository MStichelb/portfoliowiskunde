"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { archiveSubject, createSubject, moveSubject, permanentlyDeleteSubject, renameSubject, restoreSubject } from "@/lib/subjects";

export async function createSubjectAction(formData: FormData): Promise<never> {
  return runSubjectAction("created", async (user) => {
    await createSubject(user, { name: value(formData, "name") });
  });
}

export async function renameSubjectAction(formData: FormData): Promise<never> {
  return runSubjectAction("renamed", async (user) => {
    await renameSubject(user, value(formData, "subjectId"), value(formData, "name"));
  });
}

export async function moveSubjectAction(formData: FormData): Promise<never> {
  return runSubjectAction("moved", async (user) => {
    const direction = value(formData, "direction");
    if (direction !== "up" && direction !== "down") throw new Error("Ongeldige verplaatsing.");
    await moveSubject(user, value(formData, "subjectId"), direction);
  });
}

export async function archiveSubjectAction(formData: FormData): Promise<never> {
  return runSubjectAction("archived", async (user) => {
    await archiveSubject(user, value(formData, "subjectId"));
  });
}

export async function restoreSubjectAction(formData: FormData): Promise<never> {
  return runSubjectAction("restored", async (user) => {
    await restoreSubject(user, value(formData, "subjectId"));
  });
}

export async function permanentlyDeleteSubjectAction(formData: FormData): Promise<never> {
  return runSubjectAction("deleted", async (user) => {
    await permanentlyDeleteSubject(user, value(formData, "subjectId"));
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
