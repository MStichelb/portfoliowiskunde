import { describe, expect, it, vi } from "vitest";

import {
  getSmartschoolConfig,
  normalizeSmartschoolResponses,
  SMARTSCHOOL_PRODUCTION_REDIRECT_URI,
  SMARTSCHOOL_SCOPES,
  SmartschoolAuthProvider,
  smartschoolAuthorizationUrl,
} from "./smartschool-client";

const config = {
  clientId: "client-id",
  clientSecret: "server-secret",
  platformUrl: "https://school.smartschool.be",
  redirectUri: "http://localhost:3000/api/auth/smartschool/callback",
};

describe("Smartschool OAuth client", () => {
  it("bouwt de platformgebonden authorization URL met exact de vereiste scopes", () => {
    const url = smartschoolAuthorizationUrl(config, "safe-state");
    expect(url.origin + url.pathname).toBe("https://school.smartschool.be/OAuth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(SMARTSCHOOL_SCOPES);
    expect(url.searchParams.get("state")).toBe("safe-state");
    expect(url.toString()).not.toContain(config.clientSecret);
  });

  it("vereist in productie de exacte geregistreerde redirect URI", () => {
    expect(getSmartschoolConfig({
      NODE_ENV: "production",
      SMARTSCHOOL_CLIENT_ID: "id",
      SMARTSCHOOL_CLIENT_SECRET: "secret",
      SMARTSCHOOL_PLATFORM_URL: "https://school.smartschool.be/",
      SMARTSCHOOL_REDIRECT_URI: SMARTSCHOOL_PRODUCTION_REDIRECT_URI,
    })).toMatchObject({ platformUrl: "https://school.smartschool.be", redirectUri: SMARTSCHOOL_PRODUCTION_REDIRECT_URI });
    expect(() => getSmartschoolConfig({
      NODE_ENV: "production",
      SMARTSCHOOL_CLIENT_ID: "id",
      SMARTSCHOOL_CLIENT_SECRET: "secret",
      SMARTSCHOOL_PLATFORM_URL: "https://school.smartschool.be",
      SMARTSCHOOL_REDIRECT_URI: "https://example.invalid/callback",
    })).toThrow("productiecallback");
  });

  it("wisselt de code en haalt userinfo/groupinfo via server-side form-POST op", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "short-lived-token", token_type: "Bearer" }))
      .mockResolvedValueOnce(jsonResponse(userinfoFixture()))
      .mockResolvedValueOnce(jsonResponse(groupinfoFixture()));
    const result = await new SmartschoolAuthProvider(config, fetchMock).authenticate({ code: "authorization-code" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://school.smartschool.be/OAuth/index/token", expect.objectContaining({ method: "POST" }));
    const tokenBody = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(Object.fromEntries(tokenBody)).toEqual({
      grant_type: "authorization_code",
      code: "authorization-code",
      client_id: "client-id",
      client_secret: "server-secret",
      redirect_uri: config.redirectUri,
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://school.smartschool.be/Api/V1/userinfo");
    expect(fetchMock.mock.calls[2][0]).toBe("https://school.smartschool.be/Api/V1/groupinfo");
    expect(String(fetchMock.mock.calls[1][1].body)).toBe("access_token=short-lived-token");
    expect(result.identity).toMatchObject({ provider: "smartschool", providerSubject: "external-user", providerPlatform: config.platformUrl });
    expect(result.groups).toEqual([
      { provider: "smartschool", externalGroupId: "class-6", externalGroupName: "6WIS", membershipType: "direct" },
      { provider: "smartschool", externalGroupId: "students", externalGroupName: "Leerlingen", membershipType: "parent" },
    ]);
  });

  it("normaliseert uitsluitend aanwezige officiële velden en weigert een ander platform", () => {
    expect(normalizeSmartschoolResponses(userinfoFixture(), { groups: [{ groupID: "group", name: "Naam" }] }, config.platformUrl).identity.displayName).toBe("Voorbeeld Leerling");
    expect(() => normalizeSmartschoolResponses({ ...userinfoFixture(), platform: "https://other.smartschool.be" }, {}, config.platformUrl)).toThrow();
  });
});

function userinfoFixture() {
  return { userID: "external-user", name: "Voorbeeld", surname: "Leerling", fullname: "Voorbeeld Leerling", username: "voorbeeld", platform: "https://school.smartschool.be", isMainAccount: 1, isCoAccount: 0 };
}

function groupinfoFixture() {
  return {
    groups: [{ groupID: "class-6", name: "6WIS", description: "Klas", platform: "https://school.smartschool.be" }],
    parentGroups: [{ groupID: "students", name: "Leerlingen", platform: "https://school.smartschool.be" }],
  };
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}
