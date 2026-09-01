"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { clearFailedLogins, getAuthenticationProblem, isLoginRateLimited, isValidPassword, loginRateLimitKey, recordBreakGlassLoginEvent, recordFailedLogin, startAdminSession } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  if (getAuthenticationProblem()) redirect("/admin/login?error=config");
  const requestHeaders = await headers();
  const visitor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
  const key = loginRateLimitKey(visitor);
  if (await isLoginRateLimited(key)) {
    recordBreakGlassLoginEvent("rate-limited", key);
    redirect("/admin/login?error=rate-limited");
  }
  const password = String(formData.get("password") ?? "");
  if (!isValidPassword(password)) {
    await recordFailedLogin(key);
    recordBreakGlassLoginEvent("invalid", key);
    redirect("/admin/login?error=invalid");
  }
  await clearFailedLogins(key);
  await startAdminSession();
  recordBreakGlassLoginEvent("success", key);
  redirect("/admin");
}
