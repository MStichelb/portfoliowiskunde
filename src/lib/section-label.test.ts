import { describe, expect, it } from "vitest";

import { formatSectionLabel } from "./section-label";

describe("formatSectionLabel", () => {
  it("preserves the existing punctuation for simple section codes", () => {
    expect(formatSectionLabel("1", "Inleiding")).toBe("1. Inleiding");
    expect(formatSectionLabel("2", "Toepassingen")).toBe("2. Toepassingen");
  });

  it("does not add an ambiguous trailing dot to hierarchical codes", () => {
    expect(formatSectionLabel("1.1", "Inleiding")).toBe("1.1 Inleiding");
    expect(formatSectionLabel("1.10", "Verdieping")).toBe("1.10 Verdieping");
  });
});
