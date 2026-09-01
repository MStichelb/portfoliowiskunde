import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/auth/smartschool/login", () => {
  it("redirect naar het schoolplatform met state en zonder client secret", async () => {
    vi.stubEnv("SMARTSCHOOL_CLIENT_ID", "client-id");
    vi.stubEnv("SMARTSCHOOL_CLIENT_SECRET", "client-secret");
    vi.stubEnv("SMARTSCHOOL_PLATFORM_URL", "https://school.smartschool.be");
    vi.stubEnv("SMARTSCHOOL_REDIRECT_URI", "http://localhost:3000/api/auth/smartschool/callback");
    vi.stubEnv("ADMIN_SESSION_SECRET", "a-long-state-signing-secret-for-tests");
    const response = await GET(new NextRequest("http://localhost:3000/api/auth/smartschool/login?returnTo=%2F5"));
    const location = new URL(response.headers.get("location")!);

    expect(location.origin + location.pathname).toBe("https://school.smartschool.be/OAuth");
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/smartschool/callback");
    expect(location.searchParams.get("scope")).toBe("userinfo groupinfo");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(`${location}${response.headers.get("set-cookie")}`).not.toContain("client-secret");
  });
});
