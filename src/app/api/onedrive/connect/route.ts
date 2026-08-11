import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth";
import { createMicrosoftAuthorizationUrl, getMicrosoftConfigurationProblem } from "@/lib/onedrive";

const OAUTH_STATE_COOKIE = "portfolio_onedrive_oauth_state";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return new Response("Niet aangemeld.", { status: 401 });
  if (getMicrosoftConfigurationProblem()) {
    return NextResponse.redirect(new URL("/admin/instellingen?onedrive=configuration-error", request.url));
  }
  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(createMicrosoftAuthorizationUrl(state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/onedrive",
    maxAge: 10 * 60,
  });
  return response;
}
