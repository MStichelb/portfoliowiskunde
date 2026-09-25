import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PortfolioGlobalResource } from "@/lib/repositories";

import { PortfolioDocumentLinks } from "./portfolio-document-links";

describe("PortfolioDocumentLinks", () => {
  it("laat in de leerlingweergave ontbrekende bronbestanden en lege externe links volledig weg", () => {
    const markup = renderToStaticMarkup(<PortfolioDocumentLinks
      portfolioId="portfolio-1"
      spaceSlug="5wis"
      resources={[
        sourceResource("assignments", "Opgaven", "assignment", true, "starts_with", "Portfolio"),
        sourceResource("hints", "Hints", "hints", false, "contains", "Hints"),
        sourceResource("final-solutions", "Eindoplossingen", "final-solutions", false, "starts_with", "Eindoplossingen"),
        genericSourceResource("missing-generic", "Ontbrekende bijlage", "missing-asset-id", false),
        externalResource("video", "Video", null),
      ]}
    />);

    expect(markup).toContain("/assignment?space=5wis");
    expect(markup).toContain("Opgaven");
    expect(markup).not.toContain("/hints");
    expect(markup).not.toContain("Eindoplossingen");
    expect(markup).not.toContain("Ontbrekende bijlage");
    expect(markup).not.toContain("Video");
    expect(markup).not.toContain(">Bestand<");
    expect(markup).not.toContain(">Link<");
  });

  it("geeft een generiek asset-ID voorrang op de legacy documentroute en codeert beide routes", () => {
    const markup = renderToStaticMarkup(<PortfolioDocumentLinks
      portfolioId="portfolio /1"
      spaceSlug="5 wis/alpha"
      resources={[
        sourceResource("assignments", "Opgaven", "assignment", true, "starts_with", "Portfolio", "asset /met?tekens"),
        sourceResource("hints", "Hints", "hints", true, "contains", "Hints"),
      ]}
    />);

    expect(markup).toContain('href="/api/resource-assets/asset%20%2Fmet%3Ftekens?space=5%20wis%2Falpha"');
    expect(markup).not.toContain("/api/portfolio-assets/portfolio%20%2F1/assignment");
    expect(markup).toContain('href="/api/portfolio-assets/portfolio%20%2F1/hints?space=5%20wis%2Falpha"');
  });

  it("behoudt in de leerlingweergave de profielvolgorde en toont externe en generieke bronresources", () => {
    const markup = renderToStaticMarkup(<PortfolioDocumentLinks
      portfolioId="portfolio-1"
      spaceSlug="5wis"
      resources={[
        sourceResource("assignments", "Opgaven", "assignment", true, "starts_with", "Portfolio"),
        genericSourceResource("lesson-video", "Lesvideo", "generic-asset-id"),
        externalResource("video", "Instructievideo", "https://example.com/uitleg"),
        sourceResource("hints", "Hints", "hints", true, "contains", "Hints"),
      ]}
    />);

    expect(markup).toContain('href="/api/resource-assets/generic-asset-id?space=5wis"');
    expect(markup).toContain('href="https://example.com/uitleg"');
    expect(markup.indexOf("Opgaven")).toBeLessThan(markup.indexOf("Lesvideo"));
    expect(markup.indexOf("Lesvideo")).toBeLessThan(markup.indexOf("Instructievideo"));
    expect(markup.indexOf("Instructievideo")).toBeLessThan(markup.indexOf("Hints"));
  });

  it("toont in admin alle profielresources, markeert missing en labelt Bestand versus Link", () => {
    const markup = renderToStaticMarkup(<PortfolioDocumentLinks
      portfolioId="portfolio-1"
      spaceSlug="5wis"
      admin
      resources={[
        sourceResource("assignments", "Opgaven", "assignment", true, "starts_with", "Portfolio"),
        genericSourceResource("lesson-video", "Lesvideo", "generic-asset-id"),
        sourceResource("hints", "Hints", "hints", false, "contains", "Hints"),
        externalResource("course", "Cursus", "https://example.com/cursus"),
        externalResource("video", "Externe video", null),
      ]}
    />);

    expect(markup).toContain('href="/api/admin/resource-assets/generic-asset-id?space=5wis"');
    expect(markup).toContain("Opgaven");
    expect(markup).toContain("Hints");
    expect(markup).toContain("Cursus");
    expect(markup).toContain("Externe video");
    expect(markup).toContain('data-resource-state="missing"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('href="#portfolio-external-link-portfolio-1-course"');
    expect(markup).toContain('href="#portfolio-external-link-portfolio-1-video"');
    expect(markup.match(/>Bestand</g)?.length).toBe(3);
    expect(markup.match(/>Link</g)?.length).toBe(2);
  });

  it("biedt in admin een info-popup met de herkenningsregels van bronbestanden", () => {
    const markup = renderToStaticMarkup(<PortfolioDocumentLinks
      portfolioId="portfolio-1"
      admin
      resources={[
        sourceResource("assignments", "Opgaven", "assignment", true, "starts_with", "Portfolio"),
        sourceResource("hints", "Hints", "hints", false, "contains", "Hints"),
      ]}
    />);

    expect(markup).toContain('href="#portfolio-resource-rules-portfolio-1"');
    expect(markup).toContain("Herkenningsregels");
    expect(markup).toContain("Bestandsnaam begint met");
    expect(markup).toContain("Portfolio");
    expect(markup).toContain("Bestandsnaam bevat");
    expect(markup).toContain("Hints");
    expect(markup).toContain("PDF");
    expect(markup).toContain('class="icon-button"');
  });
});

function sourceResource(
  id: string,
  label: string,
  documentKind: "assignment" | "hints" | "final-solutions",
  available: boolean,
  operator: "starts_with" | "contains" | "ends_with",
  value: string,
  assetId: string | null = null,
): PortfolioGlobalResource {
  return {
    id,
    kind: "source_file",
    label,
    icon: "file-text",
    semanticRole: "generic",
    documentKind,
    assetId,
    url: null,
    available,
    recognition: { target: "file_name", operator, value, caseSensitive: false, fileExtensions: ["pdf"] },
  };
}

function genericSourceResource(
  id: string,
  label: string,
  assetId: string,
  available = true,
): PortfolioGlobalResource {
  return {
    id,
    kind: "source_file",
    label,
    icon: "monitor-play",
    semanticRole: "generic",
    documentKind: null,
    assetId,
    url: null,
    available,
    recognition: { target: "file_name", operator: "contains", value: "Lesvideo", caseSensitive: false, fileExtensions: ["png"] },
  };
}

function externalResource(id: string, label: string, url: string | null): PortfolioGlobalResource {
  return { id, kind: "external_link", label, icon: "external-link", semanticRole: "generic", documentKind: null, assetId: null, url, available: Boolean(url), recognition: null };
}
