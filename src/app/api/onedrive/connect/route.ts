import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth";
import { createMicrosoftAuthorizationUrl, createPkceChallenge, getMicrosoftConfigurationProblem } from "@/lib/onedrive";

const OAUTH_STATE_COOKIE = "portfolio_onedrive_oauth_state";
const OAUTH_VERIFIER_COOKIE = "portfolio_onedrive_oauth_verifier";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return new Response("Niet aangemeld.", { status: 401 });
  if (getMicrosoftConfigurationProblem()) {
    return NextResponse.redirect(new URL("/admin/instellingen?onedrive=configuration-error", request.url));
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
  return response;
}
