import { describe, expect, it } from "vitest";

import { currentSpaceForPath } from "./site-navigation";

const spaces = [{ slug: "5", name: "5de jaar", shortLabel: "5WIS" }, { slug: "zesde-jaar", name: "6de jaar", shortLabel: "6WIS" }];

describe("site navigation context", () => {
  it("detects a LearningSpace in public and admin routes", () => {
    expect(currentSpaceForPath("/zesde-jaar/portfolio/pf-1", spaces)?.name).toBe("6de jaar");
    expect(currentSpaceForPath("/admin/zesde-jaar/instellingen", spaces)?.name).toBe("6de jaar");
  });

  it("does not show a LearningSpace context on global pages", () => {
    expect(currentSpaceForPath("/", spaces)).toBeNull();
    expect(currentSpaceForPath("/admin/instellingen", spaces)).toBeNull();
  });
});
