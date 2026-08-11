"use server";

import { redirect } from "next/navigation";

import { getAuthenticationProblem, isValidPassword, startAdminSession } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  if (getAuthenticationProblem()) redirect("/admin/login?error=config");
  const password = String(formData.get("password") ?? "");
  if (!isValidPassword(password)) redirect("/admin/login?error=invalid");
  await startAdminSession();
  redirect("/admin");
}
