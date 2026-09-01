import { NextRequest, NextResponse } from "next/server";

import { beginSmartschoolAuthorization } from "@/lib/smartschool-auth-flow";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    return beginSmartschoolAuthorization(request);
  } catch {
    return NextResponse.redirect(new URL("/aanmelden?error=config", request.url));
  }
}
