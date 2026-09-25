import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SolutionVariantHeading } from "./solution-variant-heading";

describe("SolutionVariantHeading", () => {
  it("keeps the legacy heading defaults", () => {
    const standard = renderToStaticMarkup(<SolutionVariantHeading kind="standard" />);
    const alternative = renderToStaticMarkup(<SolutionVariantHeading kind="alternative" />);

    expect(standard).toContain("Uitwerking");
    expect(standard).toContain("lucide-notebook-pen");
    expect(alternative).toContain("Alternatieve uitwerking");
    expect(alternative).toContain("lucide-shapes");
  });

  it("uses the source-profile label and icon when supplied", () => {
    const markup = renderToStaticMarkup(<SolutionVariantHeading kind="standard" label="Modelantwoord" icon="lightbulb" />);

    expect(markup).toContain("Modelantwoord");
    expect(markup).toContain("lucide-lightbulb");
    expect(markup).not.toContain("lucide-notebook-pen");
  });
});
