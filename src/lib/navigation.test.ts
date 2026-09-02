import { describe, expect, it } from "vitest";

import { homeHrefForUser } from "./navigation";

describe("role-aware Home destination", () => {
  it("routes a student with one LearningSpace directly to that space", () => {
    expect(homeHrefForUser("student", [{ slug: "5 wis" }])).toBe("/5%20wis");
  });

  it("routes a student with multiple LearningSpaces to the chooser", () => {
    expect(homeHrefForUser("student", [{ slug: "5" }, { slug: "6" }])).toBe("/");
  });

  it("keeps teacher and superadmin Home on the normal start page", () => {
    expect(homeHrefForUser("teacher", [{ slug: "5" }])).toBe("/");
    expect(homeHrefForUser("superadmin", [{ slug: "5" }])).toBe("/");
  });
});
