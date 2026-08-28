import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PortfolioDocumentLinks } from "./portfolio-document-links";

describe("PortfolioDocumentLinks", () => {
  it("laat de Hints-knop volledig weg zonder geïndexeerd document", () => {
    const markup = renderToStaticMarkup(<PortfolioDocumentLinks portfolioId="portfolio-1" spaceSlug="5wis" hasHints={false} />);

    expect(markup).not.toContain("/hints");
    expect(markup).not.toContain(">Hints<");
  });

  it("plaatst Hints tussen Opgaven en Eindoplossingen wanneer het document bestaat", () => {
    const markup = renderToStaticMarkup(<PortfolioDocumentLinks portfolioId="portfolio-1" spaceSlug="5wis" hasHints />);

    expect(markup).toContain("/hints?space=5wis");
    expect(markup.indexOf(">Opgaven<")).toBeLessThan(markup.indexOf(">Hints<"));
    expect(markup.indexOf(">Hints<")).toBeLessThan(markup.indexOf(">Eindoplossingen<"));
  });
});
