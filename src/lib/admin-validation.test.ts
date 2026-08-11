import { describe, expect, it } from "vitest";

import { bulkSelectionError } from "./admin-validation";

describe("bulk selection validation", () => {
  it("keeps an empty bulk selection non-destructive", () => {
    expect(bulkSelectionError(0)).toBe("Selecteer eerst minstens één oefening.");
    expect(bulkSelectionError(1)).toBeNull();
  });
});
