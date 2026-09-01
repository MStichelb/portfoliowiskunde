import { describe, expect, it } from "vitest";

import { createSmartschoolOAuthState, safeLocalReturnTo, verifySmartschoolOAuthState } from "./smartschool-oauth-state";

describe("Smartschool OAuth state", () => {
  it("valideert state, intent en een veilige lokale bestemming", () => {
    const created = createSmartschoolOAuthState("state-secret", { intent: "link", userId: "admin-1", returnTo: "/admin/5" }, 1_000);
    expect(verifySmartschoolOAuthState(created.cookieValue, created.state, "state-secret", 2_000)).toMatchObject({ intent: "link", userId: "admin-1", returnTo: "/admin/5" });
  });

  it("weigert mismatch, manipulatie en verlopen state", () => {
    const created = createSmartschoolOAuthState("state-secret", {}, 1_000);
    expect(verifySmartschoolOAuthState(created.cookieValue, "other", "state-secret", 2_000)).toBeNull();
    expect(verifySmartschoolOAuthState(`${created.cookieValue}x`, created.state, "state-secret", 2_000)).toBeNull();
    expect(verifySmartschoolOAuthState(created.cookieValue, created.state, "state-secret", 1_000 + 11 * 60 * 1_000)).toBeNull();
  });

  it("bewaart nooit een externe of auth-route als returnTo", () => {
    expect(safeLocalReturnTo("/5/portfolio/1?x=1")).toBe("/5/portfolio/1?x=1");
    expect(safeLocalReturnTo("//evil.example/path")).toBeNull();
    expect(safeLocalReturnTo("https://evil.example/path")).toBeNull();
    expect(safeLocalReturnTo("/api/auth/smartschool/link")).toBeNull();
  });
});
