import { describe, expect, it } from "vitest";

import { parseBrusselsDateTime, resolveChildPublication, resolvePortfolioPublication } from "./publication";

describe("publication resolver", () => {
  const now = new Date("2026-08-11T10:00:00.000Z");
  const visible = { mode: "visible" as const, limited: false, publishFrom: null, publishUntil: null };
  const hidden = { mode: "hidden" as const, limited: false, publishFrom: null, publishUntil: null };
  const future = { mode: "visible" as const, limited: true, publishFrom: "2026-08-12T10:00:00.000Z", publishUntil: null };

  it("makes a fully enabled chain visible", () => {
    const portfolio = resolvePortfolioPublication({ visible: true, limited: false, publishFrom: null, publishUntil: null }, now);
    const section = resolveChildPublication(visible, portfolio, now);
    expect(resolveChildPublication(visible, section, now).state).toBe("visible");
  });

  it("marks visible descendants as will-be-visible for future portfolio or section schedules", () => {
    const portfolioFuture = resolvePortfolioPublication({ visible: true, limited: true, publishFrom: "2026-08-12T10:00:00.000Z", publishUntil: null }, now);
    expect(resolveChildPublication(visible, portfolioFuture, now).state).toBe("will-be-visible");
    const portfolio = resolvePortfolioPublication({ visible: true, limited: false, publishFrom: null, publishUntil: null }, now);
    const sectionFuture = resolveChildPublication(future, portfolio, now);
    expect(resolveChildPublication(visible, sectionFuture, now)).toMatchObject({ state: "will-be-visible", reason: "parent-scheduled" });
  });

  it("marks a visible exercise as will-remain-hidden behind an explicit hidden section", () => {
    const portfolio = resolvePortfolioPublication({ visible: true, limited: false, publishFrom: null, publishUntil: null }, now);
    const section = resolveChildPublication(hidden, portfolio, now);
    expect(resolveChildPublication(visible, section, now)).toMatchObject({ state: "will-remain-hidden", reason: "parent-hidden" });
    const futurePortfolio = resolvePortfolioPublication({ visible: true, limited: true, publishFrom: "2026-08-12T10:00:00.000Z", publishUntil: null }, now);
    const hiddenSection = resolveChildPublication(hidden, futurePortfolio, now);
    expect(resolveChildPublication(visible, hiddenSection, now).state).toBe("will-remain-hidden");
  });

  it("keeps an explicitly hidden exercise hidden and expires schedules securely", () => {
    const portfolio = resolvePortfolioPublication({ visible: true, limited: false, publishFrom: null, publishUntil: null }, now);
    expect(resolveChildPublication(hidden, portfolio, now)).toMatchObject({ state: "hidden", reason: "self-hidden" });
    expect(resolveChildPublication({ mode: "visible", limited: true, publishFrom: null, publishUntil: "2026-08-10T10:00:00.000Z" }, portfolio, now).state).toBe("will-remain-hidden");
  });

  it("stores Brussels local times as a UTC instant and rejects the skipped DST hour", () => {
    expect(parseBrusselsDateTime("2026-08-11T12:00")).toBe("2026-08-11T10:00:00.000Z");
    expect(parseBrusselsDateTime("2026-03-29T02:30")).toBeNull();
  });
});
