import { describe, expect, it } from "vitest";

import { createSessionToken, isValidSessionToken } from "./auth";

describe("admin session tokens", () => {
  it("accepteert een geldig getekend token", () => {
    const now = 1_700_000_000_000;
    expect(isValidSessionToken(createSessionToken("test-secret", now), "test-secret", now)).toBe(true);
  });

  it("weigert gewijzigde, verlopen en verkeerd ondertekende tokens", () => {
    const now = 1_700_000_000_000;
    const token = createSessionToken("test-secret", now);
    expect(isValidSessionToken(`${token}x`, "test-secret", now)).toBe(false);
    expect(isValidSessionToken(token, "other-secret", now)).toBe(false);
    expect(isValidSessionToken(token, "test-secret", now + 60 * 60 * 13 * 1000)).toBe(false);
  });
});
