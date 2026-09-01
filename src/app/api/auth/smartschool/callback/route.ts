import { NextRequest, NextResponse } from "next/server";

import { createUserSession, getAuthenticatedUser, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getAccessibleLearningSpaceIds } from "@/lib/authorization";
import {
  findOrCreateExternalUser,
  linkExternalIdentityToUser,
  replaceExternalIdentityGroups,
  updateUserFromExternalIdentity,
  type AppUser,
} from "@/lib/identity";
import { getLearningSpaces } from "@/lib/repositories";
import { smartschoolPostLoginDestination } from "@/lib/smartschool-auth-flow";
import { getSmartschoolConfig, SmartschoolAuthProvider } from "@/lib/smartschool-client";
import { SMARTSCHOOL_STATE_COOKIE, smartschoolStateSecret, verifySmartschoolOAuthState } from "@/lib/smartschool-oauth-state";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = smartschoolStateSecret();
  const state = secret ? verifySmartschoolOAuthState(
    request.cookies.get(SMARTSCHOOL_STATE_COOKIE)?.value,
    request.nextUrl.searchParams.get("state"),
    secret,
  ) : null;
  if (!state) return callbackRedirect(request, "/aanmelden?error=state");
  if (request.nextUrl.searchParams.has("error")) return callbackRedirect(request, "/aanmelden?error=oauth");
  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) return callbackRedirect(request, "/aanmelden?error=code");

  try {
    const authentication = await new SmartschoolAuthProvider(getSmartschoolConfig()).authenticate({ code });
    let user: AppUser;
    let identityId: string;
    if (state.intent === "link") {
      const currentUser = await getAuthenticatedUser();
      if (!currentUser || currentUser.role !== "superadmin" || currentUser.id !== state.userId) {
        return callbackRedirect(request, "/admin?smartschool=link-denied");
      }
      const identity = await linkExternalIdentityToUser(currentUser.id, authentication.identity);
      user = currentUser;
      identityId = identity.id;
    } else {
      const mapped = await findOrCreateExternalUser(authentication.identity);
      user = mapped.user;
      identityId = mapped.identity.id;
    }
    user = await updateUserFromExternalIdentity(user.id, authentication.identity);
    if (user.status !== "active") return callbackRedirect(request, "/aanmelden?error=disabled");

    await replaceExternalIdentityGroups(identityId, authentication.groups);
    const spaces = await getLearningSpaces(true);
    const accessibleIds = await getAccessibleLearningSpaceIds(user);
    const effectiveAccess = { learningSpaceIds: accessibleIds, destination: accessibleIds.length === 0 ? "none" as const : accessibleIds.length === 1 ? "automatic" as const : "selection" as const, automaticLearningSpaceId: accessibleIds.length === 1 ? accessibleIds[0] : null };
    const destination = state.intent === "link"
      ? "/admin?smartschool=linked"
      : smartschoolPostLoginDestination(user, effectiveAccess, spaces, state.returnTo);
    const session = await createUserSession(user.id);
    const response = callbackRedirect(request, destination);
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Smartschool OAuth callback failed.", {
      intent: state.intent,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return callbackRedirect(request, state.intent === "link" ? "/admin?smartschool=link-failed" : "/aanmelden?error=auth");
  }
}

function callbackRedirect(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.cookies.set(SMARTSCHOOL_STATE_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/api/auth/smartschool",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
