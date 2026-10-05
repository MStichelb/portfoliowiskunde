import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/changelog" }));
import { SiteNavigation } from "./site-navigation";
import { ChangelogHistory } from "./changelog-history";
import { getChangelogForRole } from "@/lib/changelog";
import type { ChangelogEntry, ChangelogAudience } from "@/data/changelog";

describe("changelog navigation", () => {
  it.each(["student", "teacher", "superadmin"] as const)("places the button between divider and identity for %s", (role: ChangelogAudience) => {
    const markup = renderToStaticMarkup(<SiteNavigation spaces={[]} user={{ firstName: "Test", role }} />);
    const divider = markup.indexOf('class="site-nav-divider"');
    const trigger = markup.indexOf('class="site-nav-icon changelog-trigger"');
    expect(trigger).toBeGreaterThan(divider);
    expect(markup.indexOf('class="site-nav-identity"')).toBeGreaterThan(trigger);
    expect(markup).not.toContain('class="changelog-dot"');
  });
  it("shows the dot only when unread and hides navigation for guests", () => {
    expect(renderToStaticMarkup(<SiteNavigation spaces={[]} user={{ firstName: "Test", role: "student" }} hasUnreadChangelog />)).toContain('class="changelog-dot"');
    expect(renderToStaticMarkup(<SiteNavigation spaces={[]} user={null} hasUnreadChangelog />)).toBe("");
  });
  it("renders only authorized history and offers filters only for staff", () => {
    const entries: ChangelogEntry[] = [
      { id: "public", date: "2026-10-05", category: "new", title: "Publiek nieuws", description: "Test", audiences: ["student"], notify: true },
      { id: "secret", date: "2026-10-05", category: "new", title: "Geheim nieuws", description: "Test", audiences: ["superadmin"], notify: true },
    ];
    const markup = renderToStaticMarkup(<ChangelogHistory entries={getChangelogForRole("teacher", entries)} canFilter />);
    expect(markup).toContain("Publiek nieuws");
    expect(markup).not.toContain("Geheim nieuws");
    expect(markup).toContain("Beheer");
    expect(renderToStaticMarkup(<ChangelogHistory entries={[]} canFilter={false} />)).not.toContain("Wijzigingen filteren");
  });
});
