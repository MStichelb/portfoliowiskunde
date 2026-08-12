import { describe, expect, it } from "vitest";

import {
  parsePortfolioDirectory,
  parseSectionDirectory,
  parseSolutionFileName,
} from "./parser";

describe("portfolio parser", () => {
  it("herkent portfoliomappen met lettercode en flexibele spaties", () => {
    expect(parsePortfolioDirectory(" Portfolio 3A - Toepassingen ")).toEqual({
      code: "3A",
      title: "Toepassingen",
    });
  });

  it("herkent onderdeelmappen", () => {
    expect(parseSectionDirectory("1 - Differentiaalvergelijkingen")).toEqual({
      order: 1,
      title: "Differentiaalvergelijkingen",
    });
  });

  it("parseert standaard, alternatief en stappen", () => {
    expect(parseSolutionFileName("PF3-Oef2b-alt(1).png")).toMatchObject({
      portfolioCode: "3",
      exerciseCode: "2b",
      variant: "alternative",
      step: 1,
      extension: "png",
    });
    expect(parseSolutionFileName("PF12-Oef13(2).pdf")).toMatchObject({
      portfolioCode: "12",
      exerciseCode: "13",
      variant: "standard",
      step: 2,
      extension: "pdf",
    });
    expect(parseSolutionFileName("PF3A-Oef12c.JPG")).toMatchObject({
      portfolioCode: "3A",
      exerciseCode: "12c",
      variant: "standard",
      step: 1,
      extension: "jpg",
    });
  });

  it("groepeert beschrijvende suffixen bij dezelfde structurele oefening", () => {
    for (const name of [
      "PF2-Oef30c-controlerend(2).png",
      "PF5-Oef5a(1)-bewijs.png",
      "PF5-Oef5a-bewijs(1).png",
    ]) {
      expect(parseSolutionFileName(name)).toMatchObject({ portfolioCode: name.startsWith("PF2") ? "2" : "5", exerciseCode: name.startsWith("PF2") ? "30c" : "5a", variant: "standard", step: name.includes("(2)") ? 2 : 1 });
    }
    for (const name of ["PF5-Oef5a-alt(1)-bewijs.png", "PF5-Oef5a-alt-bewijs(1).png", "PF5-Oef5a-bewijs-alt(1).png"]) {
      expect(parseSolutionFileName(name)).toMatchObject({ portfolioCode: "5", exerciseCode: "5a", variant: "alternative", step: 1 });
    }
    expect(parseSolutionFileName("PF5-Oef2-alternatief-bewijs.png")).toMatchObject({ variant: "standard", step: 1 });
  });

  it("weigert werkelijk malformed namen", () => {
    expect(parseSolutionFileName("Uitwerkingen portfolio 3.pdf")).toBeNull();
    expect(parseSolutionFileName("PF3-Oef2b-alt(1)(2).png")).toBeNull();
    expect(parseSolutionFileName("PF3-Oef2b--bewijs.png")).toBeNull();
  });
});
