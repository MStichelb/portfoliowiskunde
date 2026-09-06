"use server";

import { notFound, redirect } from "next/navigation";

import { startUserSession } from "@/lib/auth";
import { isDevDummyUserId } from "@/lib/dev-users";
import { getUser } from "@/lib/identity";

export async function devLoginAction(formData: FormData): Promise<never> {
  if (process.env.NODE_ENV !== "development") notFound();
  const userId = String(formData.get("userId") ?? "");
  if (!isDevDummyUserId(userId)) notFound();
  const user = await getUser(userId);
  if (!user || user.status !== "active" || (user.role !== "teacher" && user.role !== "student")) notFound();
  await startUserSession(user.id);
  redirect(user.role === "teacher" ? "/admin" : "/");
}
