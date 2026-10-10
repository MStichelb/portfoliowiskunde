import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./mutation-feedback-form", () => ({
  MutationFeedbackForm: ({ successMessage, children }: { successMessage: string; children: React.ReactNode }) => <form data-success={successMessage}>{children}</form>,
}));

import { SectionPublicationForm } from "./section-publication-form";

describe("SectionPublicationForm", () => {
  it.each([[undefined, "onderdeel"], ["sECTIE", "sectie"]])("uses section terminology in publication feedback (%s)", (sectionLabelSingular, expected) => {
    const tree = renderToStaticMarkup(<SectionPublicationForm
      id="section" portfolioId="portfolio" visible limited={false} publishFrom="" publishUntil=""
      sectionLabelSingular={sectionLabelSingular} action={() => undefined}
    />);
    expect(tree).toContain('name="id" value="section"');
    expect(tree).toContain(`data-success="Planning voor ${expected} opgeslagen."`);
  });
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
