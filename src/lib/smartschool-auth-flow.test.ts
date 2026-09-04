import { describe, expect, it } from "vitest";

import type { AppUser, LearningSpaceAccessResolution } from "./identity";
import { smartschoolPostLoginDestination } from "./smartschool-auth-flow";

const student: AppUser = { id: "student", displayName: "Leerling", firstName: null, lastName: null, email: null, role: "student", status: "active", classGroupOverrideId: null };
const spaces = [{ id: "space-5", slug: "5" }, { id: "space-6", slug: "6" }];

describe("Smartschool post-login routing", () => {
  it.each([
    [access([]), "/geen-leeromgeving"],
    [access(["space-5"]), "/5"],
    [access(["space-5", "space-6"]), "/"],
  ])("routeert studenten met nul, één en meerdere LearningSpaces", (resolved, expected) => {
    expect(smartschoolPostLoginDestination(student, resolved, spaces, null)).toBe(expected);
  });

  it("honoreert alleen een returnTo binnen een toegankelijke LearningSpace", () => {
    const resolved = access(["space-5"]);
    expect(smartschoolPostLoginDestination(student, resolved, spaces, "/5/portfolio/pf1")).toBe("/5/portfolio/pf1");
    expect(smartschoolPostLoginDestination(student, resolved, spaces, "/6/portfolio/pf1")).toBe("/5");
    expect(smartschoolPostLoginDestination(student, resolved, spaces, "/admin")).toBe("/5");
  });
});

function access(ids: string[]): LearningSpaceAccessResolution {
  return { learningSpaceIds: ids, destination: ids.length === 0 ? "none" : ids.length === 1 ? "automatic" : "selection", automaticLearningSpaceId: ids.length === 1 ? ids[0] : null };
}
