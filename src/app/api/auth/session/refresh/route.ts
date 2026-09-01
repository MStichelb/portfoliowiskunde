import { NextRequest, NextResponse } from "next/server";

import { refreshUserSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const refreshed = await refreshUserSession(request.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.json({ refreshed: Boolean(refreshed) });
  response.headers.set("Cache-Control", "no-store");
  if (refreshed) response.cookies.set(SESSION_COOKIE, refreshed.token, sessionCookieOptions());
  return response;
}
