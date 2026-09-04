import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/authorization";
import { createMicrosoftAuthorizationUrl, createPkceChallenge, getMicrosoftConfigurationProblem } from "@/lib/onedrive";

const OAUTH_STATE_COOKIE = "portfolio_onedrive_oauth_state";
const OAUTH_VERIFIER_COOKIE = "portfolio_onedrive_oauth_verifier";
const OAUTH_OWNER_COOKIE = "portfolio_onedrive_oauth_owner";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!canAccessAdmin(user)) return new Response("Niet aangemeld.", { status: 401 });
  const settingsPath = user!.role === "superadmin" ? "/admin/instellingen" : "/admin/verbindingen";
  if (getMicrosoftConfigurationProblem()) {
    return NextResponse.redirect(new URL(`${settingsPath}?onedrive=configuration-error`, request.url));
  }
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const response = NextResponse.redirect(createMicrosoftAuthorizationUrl(state, createPkceChallenge(verifier)));
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/onedrive",
    maxAge: 10 * 60,
  } as const;
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, cookieOptions);
  response.cookies.set(OAUTH_OWNER_COOKIE, user!.id, cookieOptions);
  return response;
}
