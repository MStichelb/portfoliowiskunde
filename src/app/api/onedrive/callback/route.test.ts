import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  exchangeMicrosoftCode: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/onedrive", () => ({ exchangeMicrosoftCode: mocks.exchangeMicrosoftCode }));

import { GET } from "./route";

const cookieValues: Record<string, string> = {
  portfolio_onedrive_oauth_state: "expected-state",
  portfolio_onedrive_oauth_verifier: "verifier",
  portfolio_onedrive_oauth_owner: "admin-1",
};

describe("GET /api/onedrive/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({
      id: "admin-1",
      displayName: "Hoofdbeheerder",
      firstName: "Hoofdbeheerder",
      lastName: null,
      email: null,
      role: "superadmin",
      status: "active",
      classGroupOverrideId: null,
    });
    mocks.cookies.mockResolvedValue({
      get: vi.fn((name: string) => cookieValues[name] ? { value: cookieValues[name] } : undefined),
    });
    mocks.exchangeMicrosoftCode.mockResolvedValue(undefined);
  });

  it("returns a superadmin to the canonical connections page after OAuth", async () => {
    const response = await GET(new Request("http://localhost:3000/api/onedrive/callback?code=code&state=expected-state"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/verbindingen?onedrive=connected");
    expect(mocks.exchangeMicrosoftCode).toHaveBeenCalledWith("code", "verifier", "admin-1");
  });
});
