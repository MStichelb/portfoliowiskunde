import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PortfolioGlobalResource } from "@/lib/repositories";

import { PortfolioDocumentsWithMessage } from "./portfolio-documents-with-message";

describe("PortfolioDocumentsWithMessage", () => {
  it("rendert niets extra zonder custom tekst en behoudt alleen beschikbare resourceknoppen", () => {
    const markup = render(null, "above_documents", [sourceResource("assignments", "Opgaven", "assignment", true), sourceResource("hints", "Hints", "hints", true), sourceResource("final-solutions", "Eindoplossingen", "final-solutions", true)]);
    const emptyMarkup = render("   ", "below_documents", [sourceResource("hints", "Hints", "hints", false)]);

    expect(markup).not.toContain("portfolio-custom-message");
    expect(emptyMarkup).not.toContain("portfolio-custom-message");
    expect(markup).toContain("Opgaven");
    expect(markup).toContain("Hints");
    expect(markup).toContain("Eindoplossingen");
    expect(emptyMarkup).not.toContain("document-actions");
  });

  it("plaatst het bericht boven de documentknoppen", () => {
    const markup = render("Bekijk eerst de opgaven.", "above_documents", [sourceResource("assignments", "Opgaven", "assignment", true)]);

    expect(markup.indexOf("Bekijk eerst de opgaven.")).toBeLessThan(markup.indexOf("document-actions"));
  });

  it("plaatst het bericht onder de documentknoppen", () => {
    const markup = render("Werk stap voor stap.", "below_documents", [sourceResource("assignments", "Opgaven", "assignment", true)]);

    expect(markup.indexOf("Werk stap voor stap.")).toBeGreaterThan(markup.indexOf("document-actions"));
  });

  it("behoudt multiline tekst en ontsnapt HTML als plain text", () => {
    const markup = render("Eerste regel\n<strong>Tweede regel</strong>", "above_documents", []);

    expect(markup).toContain("Eerste regel\n&lt;strong&gt;Tweede regel&lt;/strong&gt;");
    expect(markup).not.toContain("<strong>Tweede regel</strong>");
  });
});

function render(
  customText: string | null,
  customTextPosition: "above_documents" | "below_documents",
  resources: PortfolioGlobalResource[],
): string {
  return renderToStaticMarkup(<PortfolioDocumentsWithMessage
    portfolioId="portfolio-1"
    spaceSlug="5wis"
    resources={resources}
    customText={customText}
    customTextPosition={customTextPosition}
  />);
}

function sourceResource(
  id: string,
  label: string,
  documentKind: "assignment" | "hints" | "final-solutions",
  available: boolean,
): PortfolioGlobalResource {
  return { id, kind: "source_file", label, icon: "file-text", semanticRole: "generic", documentKind, assetId: null, url: null, available };
}
