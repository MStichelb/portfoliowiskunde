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
      themeId="theme-analysis"
      themes={[{ id: "theme-analysis", name: "Analyse" }, { id: "theme-algebra", name: "Algebra" }]}
      action={() => undefined}
    />);

    expect(markup).toContain("Bericht voor leerlingen");
    expect(markup).toContain("Eerste regel\nTweede regel</textarea>");
    expect(markup).toContain("Optionele tekst die op de portfoliopagina bij de documentknoppen wordt getoond.");
    expect(markup).toContain("Positie van bericht");
    expect(markup).toContain('name="customTextPosition" value="below_documents"');
    expect(markup).toContain('aria-pressed="true" class="selected">Onder de documentknoppen</button>');
    expect(markup).toContain('<option value="theme-analysis" selected="">Analyse</option>');
    expect(markup).toContain("Instellingen opslaan");
    expect(markup.match(/Instellingen opslaan/g)).toHaveLength(1);
    expect(markup).not.toContain("Thema opslaan");
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
      themeId={null}
      themes={[{ id: "theme-analysis", name: "Analyse" }]}
      action={() => undefined}
    />);

    expect(markup).toContain('<textarea name="customText"');
    expect(markup).toContain('name="customTextPosition" value="above_documents"');
    expect(markup).toContain('aria-pressed="true" class="selected">Boven de documentknoppen</button>');
    expect(markup).toContain('<option value="" selected="">Overige portfolio&#x27;s</option>');
  });
});
