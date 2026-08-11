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

  it("weigert gelijkaardige maar ongeldige namen", () => {
    expect(parseSolutionFileName("Uitwerkingen portfolio 3.pdf")).toBeNull();
    expect(parseSolutionFileName("PF3-Oef2b-extra.png")).toBeNull();
  });
});
