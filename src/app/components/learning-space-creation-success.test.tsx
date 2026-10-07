import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MISSING_PROFILE_MESSAGE, MISSING_SOURCE_MESSAGE } from "@/lib/learning-space-creation-wizard";
import { LearningSpaceCreationSuccess } from "./learning-space-creation-success";
import { LearningSpaceSetupNotice } from "./learning-space-setup-notice";

describe("creation success and setup links", () => {
  it.each([[true, true], [true, false], [false, true], [false, false]])("shows only missing profile=%s/source=%s", (missingProfile, missingSource) => {
    const warnings = [...(missingProfile ? [MISSING_PROFILE_MESSAGE] : []), ...(missingSource ? [MISSING_SOURCE_MESSAGE] : [])];
    const markup = renderToStaticMarkup(<LearningSpaceCreationSuccess result={{ error: null, spaceId: "space", slug: "5-wis", summary: "Leeromgeving aangemaakt.", warnings }} />);
    expect(markup.match(/Leeromgeving aangemaakt/g)).toHaveLength(1);
    expect(markup.includes("Voor synchronisatie ontbreken")).toBe(missingProfile || missingSource);
    expect(markup.includes("Bronprofiel ontbreekt")).toBe(missingProfile);
    expect(markup.includes("Bron ontbreekt")).toBe(missingSource);
    expect(markup.includes('href="/admin/5-wis/instellingen#source-profile-settings"')).toBe(missingProfile);
    expect(markup.includes('href="/admin/5-wis/instellingen#source-settings-heading"')).toBe(missingSource);
    expect(markup).toContain('href="/admin/5-wis"');
    expect(markup).not.toContain(MISSING_PROFILE_MESSAGE);
    expect(markup).not.toContain(MISSING_SOURCE_MESSAGE);
  });

  it("preserves meaningful sync results and other warnings", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreationSuccess result={{ error: null, spaceId: "space", slug: "5", summary: "3 bundels geladen.", warnings: ["De synchronisatie is niet gelukt."] }} />);
    expect(markup).toContain("3 bundels geladen.");
    expect(markup).toContain("De synchronisatie is niet gelukt.");
  });

  it("limits configuration links to users with configuration rights", () => {
    const markup = renderToStaticMarkup(<LearningSpaceSetupNotice setup={{ missingProfile: true, missingSource: true }} slug="5" canConfigure={false} />);
    expect(markup).toContain("Maak de configuratie af");
    expect(markup).not.toContain("href=");
  });
});
