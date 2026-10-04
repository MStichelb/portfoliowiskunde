import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SectionPublicationForm } from "./section-publication-form";

describe("SectionPublicationForm", () => {
  it("submits the stable section id instead of the user-facing section code", () => {
    const markup = renderToStaticMarkup(<SectionPublicationForm
      id="section-stable-id"
      portfolioId="portfolio-1"
      visible
      limited={false}
      publishFrom=""
      publishUntil=""
      action={() => undefined}
    />);

    expect(markup).toContain('name="id" value="section-stable-id"');
    expect(markup).toContain('name="portfolioId" value="portfolio-1"');
    expect(markup).not.toContain('name="sectionCode"');
  });
});
