import { afterEach, describe, expect, it } from "vitest";

import { createMicrosoftAuthorizationUrl, createPkceChallenge, microsoftGraphUrl } from "./onedrive";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("Microsoft Graph production boundaries", () => {
  it("requests only read access, offline access and PKCE", () => {
    process.env.MICROSOFT_CLIENT_ID = "client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "client-secret";
    process.env.MICROSOFT_TENANT_ID = "tenant-id";
    process.env.MICROSOFT_REDIRECT_URI = "https://example.test/api/onedrive/callback";
    process.env.GRAPH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const challenge = createPkceChallenge("a".repeat(64));
    const url = new URL(createMicrosoftAuthorizationUrl("state", challenge));
    expect(url.searchParams.get("scope")).toBe("offline_access Files.Read");
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("allows only HTTPS URLs below Microsoft Graph v1.0", () => {
    expect(microsoftGraphUrl("/drives/example/items/root")).toBe("https://graph.microsoft.com/v1.0/drives/example/items/root");
    expect(microsoftGraphUrl("https://graph.microsoft.com/v1.0/me/drive")).toBe("https://graph.microsoft.com/v1.0/me/drive");
    expect(() => microsoftGraphUrl("https://graph.microsoft.com.evil.test/v1.0/me")).toThrow();
    expect(() => microsoftGraphUrl("https://graph.microsoft.com/beta/me")).toThrow();
  });
});
