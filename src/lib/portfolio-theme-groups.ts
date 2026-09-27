export interface ThemeGroupTheme {
  id: string;
  name: string;
}

export interface ThemeGroupPortfolio {
  themeId: string | null;
}

export interface PortfolioThemeGroup<TPortfolio extends ThemeGroupPortfolio> {
  id: string;
  name: string | null;
  portfolios: TPortfolio[];
}

export function buildPortfolioThemeGroups<TPortfolio extends ThemeGroupPortfolio>(
  portfolios: TPortfolio[],
  themes: ThemeGroupTheme[],
  miscellaneousLabel: string,
): PortfolioThemeGroup<TPortfolio>[] {
  const themedGroups = themes
    .map((theme) => ({
      id: theme.id,
      name: theme.name,
      portfolios: portfolios.filter((portfolio) => portfolio.themeId === theme.id),
    }))
    .filter((group) => group.portfolios.length > 0);

  if (themedGroups.length === 0) {
    return portfolios.length > 0 ? [{ id: "all", name: null, portfolios }] : [];
  }

  const knownThemeIds = new Set(themes.map((theme) => theme.id));
  const unthemed = portfolios.filter((portfolio) => !portfolio.themeId || !knownThemeIds.has(portfolio.themeId));
  return unthemed.length > 0
    ? [...themedGroups, { id: "other", name: miscellaneousLabel, portfolios: unthemed }]
    : themedGroups;
}
