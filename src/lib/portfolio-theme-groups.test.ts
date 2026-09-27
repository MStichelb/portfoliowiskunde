import { describe, expect, it } from "vitest";

import { buildPortfolioThemeGroups } from "./portfolio-theme-groups";

const themes = [{ id: "theme-a", name: "Analyse" }];

describe("buildPortfolioThemeGroups", () => {
  it("renders an entirely unthemed collection as one plain list", () => {
    expect(buildPortfolioThemeGroups([{ id: "one", themeId: null }], themes, "Overige portfolio's"))
      .toEqual([{ id: "all", name: null, portfolios: [{ id: "one", themeId: null }] }]);
  });

  it("adds an Other group only when themed and unthemed portfolios coexist", () => {
    const groups = buildPortfolioThemeGroups([
      { id: "themed", themeId: "theme-a" },
      { id: "plain", themeId: null },
    ], themes, "Overige portfolio's");
    expect(groups.map((group) => group.name)).toEqual(["Analyse", "Overige portfolio's"]);
  });

  it("omits an empty Other group when all portfolios have a real theme", () => {
    expect(buildPortfolioThemeGroups([{ id: "themed", themeId: "theme-a" }], themes, "Overige portfolio's"))
      .toEqual([{ id: "theme-a", name: "Analyse", portfolios: [{ id: "themed", themeId: "theme-a" }] }]);
  });
});
