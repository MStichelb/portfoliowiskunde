import { describe, expect, it } from "vitest";

import {
  comparePortfolioIds,
  parseHintsDocumentCode,
  parsePortfolioDirectory,
  parsePortfolioDocumentCode,
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

  it("herkent en normaliseert puur alfabetische portfolio-ID's", () => {
    expect(parsePortfolioDirectory("Portfolio X - Kwadraten")).toEqual({ code: "X", title: "Kwadraten" });
    expect(parsePortfolioDirectory("Portfolio x - Kwadraten")).toEqual({ code: "X", title: "Kwadraten" });
    for (const id of ["1", "12", "2A", "12B", "A", "B", "X"]) {
      expect(parsePortfolioDirectory(`Portfolio ${id} - Test`)).toMatchObject({ code: id });
    }
  });

  it("herkent een begrensde Portfolio-prefix voor documentnamen", () => {
    expect(parsePortfolioDocumentCode("Portfolio 1.pdf")).toBe("1");
    expect(parsePortfolioDocumentCode("portfolio 2a - Integralen.PDF")).toBe("2A");
    expect(parsePortfolioDocumentCode("Portfolio X - Extra oefeningen.pdf")).toBe("X");
    expect(parsePortfolioDocumentCode("Portfolio 10 - Test.pdf")).toBe("10");
    expect(parsePortfolioDocumentCode("Hints portfolio 1.pdf")).toBeNull();
    expect(parsePortfolioDocumentCode("Portfolio 1_test.pdf")).toBeNull();
  });

  it("herkent een begrensde Hints portfolio-prefix met dezelfde ID-grammar", () => {
    expect(parseHintsDocumentCode("Hints portfolio 1.pdf")).toBe("1");
    expect(parseHintsDocumentCode("hints portfolio 2a - Integralen.PDF")).toBe("2A");
    expect(parseHintsDocumentCode("Hints portfolio X - Extra.pdf")).toBe("X");
    expect(parseHintsDocumentCode("Voorblad Hints portfolio 1.pdf")).toBeNull();
    expect(parseHintsDocumentCode("Hints portfolio 1_test.pdf")).toBeNull();
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
    expect(parseSolutionFileName("PFX-Oef1.png")).toMatchObject({ portfolioCode: "X", exerciseCode: "1", variant: "standard", step: 1 });
    expect(parseSolutionFileName("PFX-Oef2a.png")).toMatchObject({ portfolioCode: "X", exerciseCode: "2a", variant: "standard", step: 1 });
    expect(parseSolutionFileName("PFX-Oef3-alt(2).png")).toMatchObject({ portfolioCode: "X", exerciseCode: "3", variant: "alternative", step: 2 });
    expect(parseSolutionFileName("PFX-Oef4b(2).png")).toMatchObject({ portfolioCode: "X", exerciseCode: "4b", variant: "standard", step: 2 });
    expect(parseSolutionFileName("PF2A-Oef1.png")).toMatchObject({ portfolioCode: "2A", exerciseCode: "1" });
    expect(parseSolutionFileName("PF12B-Oef1.png")).toMatchObject({ portfolioCode: "12B", exerciseCode: "1" });
  });

  it("sorteert portfolio-ID's op numeriek deel, suffix en daarna letter-ID's", () => {
    const input = ["12", "2B", "3", "X", "10", "2", "A", "1", "2A", "11"];
    expect(input.sort(comparePortfolioIds)).toEqual(["1", "2", "2A", "2B", "3", "10", "11", "12", "A", "X"]);
    expect(["13", "12B", "12A", "12", "10", "9"].sort(comparePortfolioIds)).toEqual(["9", "10", "12", "12A", "12B", "13"]);
    expect(["x", "B", "a"].sort(comparePortfolioIds)).toEqual(["a", "B", "x"]);
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
    expect(parsePortfolioDirectory("Portfolio 2A3 - Ambigu")).toBeNull();
    expect(parsePortfolioDirectory("Portfolio X1 - Ambigu")).toBeNull();
    expect(parsePortfolioDirectory("Portfolio X Y - Vrije tekst")).toBeNull();
    expect(parseSolutionFileName("PF2A3-Oef1.png")).toBeNull();
    expect(parseSolutionFileName("PFX1-Oef1.png")).toBeNull();
  });
});
