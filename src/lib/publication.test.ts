import { describe, expect, it } from "vitest";

import { parseBrusselsDateTime, resolveChildPublication, resolvePortfolioPublication } from "./publication";

describe("publication resolver", () => {
  const now = new Date("2026-08-11T10:00:00.000Z");
  const visible = { mode: "visible" as const, publishFrom: null, publishUntil: null };
  const hidden = { mode: "hidden" as const, publishFrom: null, publishUntil: null };

  it("resolves visible parents and children as visible", () => {
    const portfolio = resolvePortfolioPublication({ visible: true, limited: false, publishFrom: null, publishUntil: null }, now);
    const section = resolveChildPublication(visible, portfolio, now);
    expect(portfolio.state).toBe("visible");
    expect(resolveChildPublication(visible, section, now).state).toBe("visible");
  });

  it("marks visible children as pending when a parent is hidden", () => {
    const portfolio = resolvePortfolioPublication({ visible: false, limited: false, publishFrom: null, publishUntil: null }, now);
    expect(resolveChildPublication(visible, portfolio, now)).toMatchObject({ state: "pending", reason: "parent" });
  });

  it("keeps an explicit child hidden and makes descendants pending", () => {
    const portfolio = resolvePortfolioPublication({ visible: true, limited: false, publishFrom: null, publishUntil: null }, now);
    const section = resolveChildPublication(hidden, portfolio, now);
    expect(section).toMatchObject({ state: "hidden", reason: "self-hidden" });
    expect(resolveChildPublication(visible, section, now)).toMatchObject({ state: "pending", reason: "parent" });
  });

  it("handles future and expired limited publication windows", () => {
    expect(resolvePortfolioPublication({ visible: true, limited: true, publishFrom: "2026-08-12T10:00:00.000Z", publishUntil: null }, now)).toMatchObject({ state: "pending", reason: "scheduled" });
    expect(resolvePortfolioPublication({ visible: true, limited: true, publishFrom: "2026-08-10T10:00:00.000Z", publishUntil: null }, now).state).toBe("visible");
    expect(resolvePortfolioPublication({ visible: true, limited: true, publishFrom: null, publishUntil: "2026-08-10T10:00:00.000Z" }, now)).toMatchObject({ state: "hidden", reason: "expired" });
  });

  it("stores Brussels local times as a UTC instant and rejects the skipped DST hour", () => {
    expect(parseBrusselsDateTime("2026-08-11T12:00")).toBe("2026-08-11T10:00:00.000Z");
    expect(parseBrusselsDateTime("2026-03-29T02:30")).toBeNull();
  });
});
