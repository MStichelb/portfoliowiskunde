import { describe, expect, it } from "vitest";

import { cardColorStyle, DEFAULT_PORTFOLIO_COLOR, isHexColor, normalizeHexColor } from "./ui-colors";

describe("configurable card colors", () => {
  it("normalizes supported six-digit hex colors", () => {
    expect(normalizeHexColor("#a1b2c3", DEFAULT_PORTFOLIO_COLOR)).toBe("#A1B2C3");
    expect(isHexColor("#A1B2C3")).toBe(true);
  });

  it("rejects malformed values and falls back safely", () => {
    expect(normalizeHexColor("red", DEFAULT_PORTFOLIO_COLOR)).toBe(DEFAULT_PORTFOLIO_COLOR);
    expect(isHexColor("#fff")).toBe(false);
    expect(cardColorStyle("invalid", DEFAULT_PORTFOLIO_COLOR)["--card-color"]).toBe(DEFAULT_PORTFOLIO_COLOR);
  });
});
