import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/zesde-jaar/themas",
}));

import { SiteNavigation } from "./site-navigation";

describe("SiteNavigation admin context", () => {
  it("shows the global LearningSpace selector with short labels and exact admin links", () => {
    const markup = renderToStaticMarkup(<SiteNavigation spaces={[
      { slug: "5", name: "Vijfde jaar", shortLabel: "5WIS" },
      { slug: "zesde-jaar", name: "Zesde jaar", shortLabel: "6WIS" },
    ]} />);

    expect(markup).toContain("admin-site-nav");
    expect(markup).toContain("admin-navbar-spaces");
    expect(markup).toContain('href="/admin/5"');
    expect(markup).toContain('href="/admin/zesde-jaar"');
    expect(markup).toContain(">5WIS</a>");
    expect(markup).toContain(">6WIS</a>");
    expect(markup).toContain("admin-navbar-space-current");
    expect(markup).toContain("lucide-folder-cog");
  });
});
