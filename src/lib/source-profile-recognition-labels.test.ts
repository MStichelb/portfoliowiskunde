import { describe, expect, it } from "vitest";
import { portfolioNumberRuleLabel } from "./source-profile-recognition-labels";
import { portfolioScannerSchema } from "./source-profile-config";
import { parsePortfolioDirectory } from "./parser";

describe("collection recognition presentation and existing boundary", () => {
  it("describes the configured required text and recognizes the matching folder", () => {
    expect(portfolioNumberRuleLabel({ marker: "Portfolio" })).toBe("Mapnaam begint met “Portfolio”, gevolgd door de code en eventueel een titel");
    expect(parsePortfolioDirectory("Portfolio1.1 - Stelsels", { marker: "Portfolio" })).toEqual({ code: "1.1", title: "Stelsels" });
  });
  it.each(["", "   "])("does not show empty quotes or enable unsupported empty text (%s)", (marker) => {
    expect(portfolioNumberRuleLabel({ marker })).toBe("Vul de vaste tekst vóór de code in.");
    expect(portfolioNumberRuleLabel({ marker })).not.toContain("“");
    expect(portfolioScannerSchema.safeParse({ marker, themeMode: "none" }).success).toBe(false);
    expect(parsePortfolioDirectory("1.1 - Stelsels", { marker })).toBeNull();
  });
});
