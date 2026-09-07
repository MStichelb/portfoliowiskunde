import { describe, expect, it } from "vitest";

import { PORTFOLIO_CUSTOM_TEXT_MAX_LENGTH, portfolioCustomMessageSchema } from "./portfolio-custom-message";

describe("portfolio custom message validation", () => {
  it("normaliseert lege tekst en bewaart multiline plain text", () => {
    expect(portfolioCustomMessageSchema.parse({ customText: "   ", customTextPosition: "above_documents" }))
      .toEqual({ customText: null, customTextPosition: "above_documents" });
    expect(portfolioCustomMessageSchema.parse({ customText: "  Eerste regel\nTweede regel  ", customTextPosition: "below_documents" }))
      .toEqual({ customText: "Eerste regel\nTweede regel", customTextPosition: "below_documents" });
  });

  it("accepteert alleen de twee ondersteunde posities en een begrensde tekst", () => {
    expect(portfolioCustomMessageSchema.safeParse({ customText: "Bericht", customTextPosition: "above_documents" }).success).toBe(true);
    expect(portfolioCustomMessageSchema.safeParse({ customText: "Bericht", customTextPosition: "below_documents" }).success).toBe(true);
    expect(portfolioCustomMessageSchema.safeParse({ customText: "Bericht", customTextPosition: "between_documents" }).success).toBe(false);
    expect(portfolioCustomMessageSchema.safeParse({ customText: "A".repeat(PORTFOLIO_CUSTOM_TEXT_MAX_LENGTH + 1), customTextPosition: "above_documents" }).success).toBe(false);
  });
});
