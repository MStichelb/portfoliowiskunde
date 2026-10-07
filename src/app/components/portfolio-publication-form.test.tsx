import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PortfolioPublicationForm } from "./portfolio-publication-form";

describe("PortfolioPublicationForm", () => {
  it.each(["none", "folder"] as const)("keeps the current theme visible with membership controlled by themeMode %s", (themeMode: "none" | "folder") => {
    const markup = renderToStaticMarkup(<PortfolioPublicationForm
      id="portfolio-1" title="Limieten" cardColor="#E7EEF2" visible limited={false} publishFrom="" publishUntil=""
      customText="Uitleg" customTextPosition="above_documents" themeId="analysis" themeMode={themeMode}
      collectionLabel="bundel" themeLabelSingular="dEEL" themes={[{ id: "analysis", name: "Analyse" }]} miscellaneousLabel="Overige bundels" action={() => undefined}
    />);
    expect(markup).toContain('<option value="analysis" selected="">Analyse</option>');
    expect(markup).toContain('>Deel<select name="themeId"');
    expect(markup.includes('<select name="themeId" disabled=""')).toBe(themeMode === "folder");
    expect(markup.includes("Bepaald door de bronmap. Verplaats de bundel in de bron om de groepering te wijzigen.")).toBe(themeMode === "folder");
    expect(markup).toContain('name="title"');
    expect(markup).toContain('name="cardColor"');
    expect(markup).toContain("Instellingen opslaan");
  });

  it("also locks root portfolios without a theme in folder mode", () => {
    const markup = renderToStaticMarkup(<PortfolioPublicationForm
      id="portfolio-root" title="Basis" cardColor="#E7EEF2" visible limited={false} publishFrom="" publishUntil=""
      customText={null} customTextPosition="above_documents" themeId={null} themeMode="folder"
      themes={[{ id: "analysis", name: "Analyse" }]} miscellaneousLabel="Overige portfolio's" action={() => undefined}
    />);
    expect(markup).toContain('<select name="themeId" disabled=""');
    expect(markup).toContain('<option value="" selected="">Overige portfolio&#x27;s</option>');
  });
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
      miscellaneousLabel="Overige portfolio's"
      action={() => undefined}
    />);

    expect(markup).toContain("Bericht voor leerlingen");
    expect(markup).toContain("Eerste regel\nTweede regel</textarea>");
    expect(markup).toContain("Optionele tekst die op de detailpagina bij de documentknoppen wordt getoond.");
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
      miscellaneousLabel="Overige Oefeningen"
      action={() => undefined}
    />);

    expect(markup).toContain('<textarea name="customText"');
    expect(markup).toContain('name="customTextPosition" value="above_documents"');
    expect(markup).toContain('aria-pressed="true" class="selected">Boven de documentknoppen</button>');
    expect(markup).toContain('<option value="" selected="">Overige Oefeningen</option>');
  });
});
