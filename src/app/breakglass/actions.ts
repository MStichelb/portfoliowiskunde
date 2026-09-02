"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { clearFailedLogins, getAuthenticationProblem, isLoginRateLimited, isValidPassword, loginRateLimitKey, recordBreakGlassLoginEvent, recordFailedLogin, startAdminSession } from "@/lib/auth";

export async function breakGlassLoginAction(formData: FormData) {
  if (getAuthenticationProblem()) redirect("/breakglass?error=config");
  const requestHeaders = await headers();
  const visitor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
  const key = loginRateLimitKey(visitor);
  if (await isLoginRateLimited(key)) {
    recordBreakGlassLoginEvent("rate-limited", key);
    redirect("/breakglass?error=rate-limited");
  }
  const password = String(formData.get("password") ?? "");
  if (!isValidPassword(password)) {
    await recordFailedLogin(key);
    recordBreakGlassLoginEvent("invalid", key);
    redirect("/breakglass?error=invalid");
  }
  await clearFailedLogins(key);
  await startAdminSession();
  recordBreakGlassLoginEvent("success", key);
  redirect("/admin");
}
