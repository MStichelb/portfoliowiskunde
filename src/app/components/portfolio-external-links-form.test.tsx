import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PortfolioGlobalResource } from "@/lib/repositories";

import { PortfolioExternalLinksForm } from "./portfolio-external-links-form";

const action = async () => undefined;

describe("PortfolioExternalLinksForm", () => {
  it("rendert per externe resource een verborgen popup met de concrete URL", () => {
    const resources: PortfolioGlobalResource[] = [
      { id: "assignments", kind: "source_file", label: "Opgaven", icon: "file-text", semanticRole: "assignment", documentKind: "assignment", assetId: null, url: null, available: true },
      { id: "video", kind: "external_link", label: "Instructievideo", icon: "monitor-play", semanticRole: "generic", documentKind: null, assetId: null, url: "https://example.com/video", available: true },
      { id: "geogebra", kind: "external_link", label: "GeoGebra", icon: "external-link", semanticRole: "generic", documentKind: null, assetId: null, url: null, available: false },
    ];

    const markup = renderToStaticMarkup(<PortfolioExternalLinksForm portfolioId="portfolio-1" resources={resources} action={action} />);

    expect(markup).toContain('id="portfolio-external-link-portfolio-1-video"');
    expect(markup).toContain('id="portfolio-external-link-portfolio-1-geogebra"');
    expect(markup).toContain('name="portfolioId" value="portfolio-1"');
    expect(markup).toContain('name="externalLink:video"');
    expect(markup).toContain('value="https://example.com/video"');
    expect(markup).toContain('name="externalLink:geogebra"');
    expect(markup).not.toContain('name="externalLink:assignments"');
    expect(markup).toContain('href="https://example.com/video"');
    expect(markup).toContain("Link openen");
    expect(markup).toContain("Laat het veld leeg en sla op om de link voor dit portfolio te verwijderen.");
  });

  it("neemt in elk popup-formulier de overige externe links als hidden values mee zodat opslaan niets anders wist", () => {
    const resources: PortfolioGlobalResource[] = [
      { id: "video", kind: "external_link", label: "Video", icon: "monitor-play", semanticRole: "generic", documentKind: null, assetId: null, url: "https://example.com/video", available: true },
      { id: "course", kind: "external_link", label: "Cursus", icon: "book-open", semanticRole: "generic", documentKind: null, assetId: null, url: "https://example.com/course", available: true },
    ];

    const markup = renderToStaticMarkup(<PortfolioExternalLinksForm portfolioId="portfolio-1" resources={resources} action={action} />);

    expect(markup.match(/name="externalLink:video"/g)?.length).toBe(2);
    expect(markup.match(/name="externalLink:course"/g)?.length).toBe(2);
    expect(markup).toContain('type="hidden" name="externalLink:course" value="https://example.com/course"');
    expect(markup).toContain('type="hidden" name="externalLink:video" value="https://example.com/video"');
  });

  it("rendert niets wanneer het actieve bronprofiel geen externe links bevat", () => {
    const markup = renderToStaticMarkup(<PortfolioExternalLinksForm portfolioId="portfolio-1" resources={[]} action={action} />);
    expect(markup).toBe("");
  });
});
