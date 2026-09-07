import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PortfolioPublicationForm } from "./portfolio-publication-form";

describe("PortfolioPublicationForm", () => {
  it("toont opgeslagen berichttekst en positie in de bestaande settingsflow", () => {
    const markup = renderToStaticMarkup(<PortfolioPublicationForm
      id="portfolio-1"
      title="Goniometrie"
      cardColor="#E7EEF2"
      visible
      limited={false}
      publishFrom=""
      publishUntil=""
      customText={"Eerste regel\nTweede regel"}
      customTextPosition="below_documents"
      action={() => undefined}
    />);

    expect(markup).toContain("Bericht voor leerlingen");
    expect(markup).toContain("Eerste regel\nTweede regel</textarea>");
    expect(markup).toContain("Optionele tekst die op de portfoliopagina bij de documentknoppen wordt getoond.");
    expect(markup).toContain("Positie van bericht");
    expect(markup).toContain('<option value="below_documents" selected="">Onder de documentknoppen</option>');
    expect(markup).toContain("Instellingen opslaan");
  });

  it("ondersteunt een portfolio zonder custom bericht", () => {
    const markup = renderToStaticMarkup(<PortfolioPublicationForm
      id="portfolio-2"
      title="Integralen"
      cardColor="#E7EEF2"
      visible={false}
      limited={false}
      publishFrom=""
      publishUntil=""
      customText={null}
      customTextPosition="above_documents"
      action={() => undefined}
    />);

    expect(markup).toContain('<textarea name="customText"');
    expect(markup).toContain('<option value="above_documents" selected="">Boven de documentknoppen</option>');
  });
});
