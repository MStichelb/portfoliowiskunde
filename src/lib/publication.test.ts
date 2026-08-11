import { describe, expect, it } from "vitest";

import { isChildPublished, isPortfolioPublished, parseBrusselsDateTime } from "./publication";

describe("publication rules", () => {
  const now = new Date("2026-08-11T10:00:00.000Z");

  it("keeps a hidden portfolio inaccessible regardless of dates", () => {
    expect(isPortfolioPublished({ visible: false, publishFrom: "2026-08-01T00:00:00.000Z", publishUntil: null }, now)).toBe(false);
  });

  it("honours scheduled publication boundaries", () => {
    expect(isPortfolioPublished({ visible: true, publishFrom: null, publishUntil: null }, now)).toBe(true);
    expect(isPortfolioPublished({ visible: true, publishFrom: "2026-08-11T09:59:00.000Z", publishUntil: "2026-08-11T10:01:00.000Z" }, now)).toBe(true);
    expect(isPortfolioPublished({ visible: true, publishFrom: "2026-08-11T10:01:00.000Z", publishUntil: null }, now)).toBe(false);
  });

  it("never lets a child override a hidden parent", () => {
    expect(isChildPublished(false, { mode: "visible", publishFrom: null, publishUntil: null }, now)).toBe(false);
    expect(isChildPublished(true, { mode: "hidden", publishFrom: null, publishUntil: null }, now)).toBe(false);
  });

  it("stores Brussels local times as a UTC instant and rejects the skipped DST hour", () => {
    expect(parseBrusselsDateTime("2026-08-11T12:00")).toBe("2026-08-11T10:00:00.000Z");
    expect(parseBrusselsDateTime("2026-03-29T02:30")).toBeNull();
  });
});
