import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PortfolioDocumentsWithMessage } from "./portfolio-documents-with-message";

describe("PortfolioDocumentsWithMessage", () => {
  it("rendert niets extra zonder custom tekst en behoudt de documentknoppen", () => {
    const markup = render(null, "above_documents", true);
    const emptyMarkup = render("   ", "below_documents", false);

    expect(markup).not.toContain("portfolio-custom-message");
    expect(emptyMarkup).not.toContain("portfolio-custom-message");
    expect(markup).toContain(">Opgaven<");
    expect(markup).toContain(">Hints<");
    expect(markup).toContain(">Eindoplossingen<");
  });

  it("plaatst het bericht boven de documentknoppen", () => {
    const markup = render("Bekijk eerst de opgaven.", "above_documents", false);

    expect(markup.indexOf("Bekijk eerst de opgaven.")).toBeLessThan(markup.indexOf("document-actions"));
  });

  it("plaatst het bericht onder de documentknoppen", () => {
    const markup = render("Werk stap voor stap.", "below_documents", false);

    expect(markup.indexOf("Werk stap voor stap.")).toBeGreaterThan(markup.indexOf("document-actions"));
  });

  it("behoudt multiline tekst en ontsnapt HTML als plain text", () => {
    const markup = render("Eerste regel\n<strong>Tweede regel</strong>", "above_documents", false);

    expect(markup).toContain("Eerste regel\n&lt;strong&gt;Tweede regel&lt;/strong&gt;");
    expect(markup).not.toContain("<strong>Tweede regel</strong>");
  });
});

function render(customText: string | null, customTextPosition: "above_documents" | "below_documents", hasHints: boolean): string {
  return renderToStaticMarkup(<PortfolioDocumentsWithMessage
    portfolioId="portfolio-1"
    spaceSlug="5wis"
    hasHints={hasHints}
    customText={customText}
    customTextPosition={customTextPosition}
  />);
}
