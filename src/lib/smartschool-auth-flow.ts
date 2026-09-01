import { NextResponse, type NextRequest } from "next/server";

import type { AppUser, LearningSpaceAccessResolution } from "@/lib/identity";
import { getSmartschoolConfig, smartschoolAuthorizationUrl } from "@/lib/smartschool-client";
import {
  createSmartschoolOAuthState,
  SMARTSCHOOL_STATE_COOKIE,
  SMARTSCHOOL_STATE_MAX_AGE_SECONDS,
  smartschoolStateSecret,
  type SmartschoolOAuthIntent,
} from "@/lib/smartschool-oauth-state";

export function beginSmartschoolAuthorization(
  request: NextRequest,
  input: { intent?: SmartschoolOAuthIntent; userId?: string | null } = {},
): NextResponse {
  const config = getSmartschoolConfig();
  const secret = smartschoolStateSecret();
  if (!secret) throw new Error("De Smartschool-stateconfiguratie ontbreekt.");
  const returnTo = request.nextUrl.searchParams.get("returnTo");
  const oauthState = createSmartschoolOAuthState(secret, {
    intent: input.intent,
    userId: input.userId,
    returnTo,
  });
  const response = NextResponse.redirect(smartschoolAuthorizationUrl(config, oauthState.state));
  response.cookies.set(SMARTSCHOOL_STATE_COOKIE, oauthState.cookieValue, {
    httpOnly: true,
    maxAge: SMARTSCHOOL_STATE_MAX_AGE_SECONDS,
    path: "/api/auth/smartschool",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function smartschoolPostLoginDestination(
  user: AppUser,
  access: LearningSpaceAccessResolution,
  spaces: Array<{ id: string; slug: string }>,
  returnTo: string | null,
): string {
  const permittedReturnTo = authorizedReturnTo(user, access.learningSpaceIds, spaces, returnTo);
  if (permittedReturnTo) return permittedReturnTo;
  if (user.role === "superadmin" || user.role === "teacher") return "/admin";
  if (access.destination === "none") return "/geen-leeromgeving";
  if (access.destination === "automatic") {
    const space = spaces.find((candidate) => candidate.id === access.automaticLearningSpaceId);
    return space ? `/${encodeURIComponent(space.slug)}` : "/geen-leeromgeving";
  }
  return "/";
}

function authorizedReturnTo(
  user: AppUser,
  accessibleIds: string[],
  spaces: Array<{ id: string; slug: string }>,
  returnTo: string | null,
): string | null {
  if (!returnTo) return null;
  const pathname = new URL(returnTo, "https://portfolio.invalid").pathname;
  if (pathname === "/") return returnTo;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return user.role === "student" ? null : returnTo;
  const slug = decodeURIComponent(pathname.split("/").filter(Boolean)[0] ?? "");
  const space = spaces.find((candidate) => candidate.slug === slug);
  return space && accessibleIds.includes(space.id) ? returnTo : null;
}
