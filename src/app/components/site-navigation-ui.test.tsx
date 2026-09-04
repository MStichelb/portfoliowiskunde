import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/admin/zesde-jaar/themas" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

import { SiteNavigation } from "./site-navigation";

describe("SiteNavigation admin context", () => {
  beforeEach(() => { navigation.pathname = "/admin/zesde-jaar/themas"; });

  it("shows the global LearningSpace selector with short labels and exact admin links", () => {
    const markup = renderToStaticMarkup(<SiteNavigation user={{ firstName: "Beheer", role: "superadmin" }} spaces={[
      { slug: "5", name: "Vijfde jaar", shortLabel: "5WIS" },
      { slug: "zesde-jaar", name: "Zesde jaar", shortLabel: "6WIS" },
    ]} />);

    expect(markup).toContain("admin-site-nav");
    expect(markup).toContain("site-nav-desktop-spaces");
    expect(markup).toContain("site-nav-mobile-spaces");
    expect(markup).toContain('href="/admin/5"');
    expect(markup).toContain('href="/admin/zesde-jaar"');
    expect(markup).toContain(">5WIS</a>");
    expect(markup).toContain(">6WIS</a>");
    expect(markup).toContain("site-nav-space-current");
    expect(markup).toContain("lucide-folder-cog");
    expect(markup).toMatch(/<a[^>]*aria-label="Startpagina"[^>]*href="\/"/);
    expect(markup).toMatch(/<a[^>]*aria-label="Beheer"[^>]*href="\/admin"/);
    expect(markup).not.toContain("Beheerhome");
    expect(markup).not.toContain("Globale beheerinstellingen");
  });

  it.each([
    ["superadmin", "lucide-crown", "hoofdbeheerder"],
    ["teacher", "lucide-star", "leraar"],
    ["student", "lucide-graduation-cap", "leerling"],
  ] as const)("renders the local %s identity with the correct role icon", (role, icon, label) => {
    const markup = renderToStaticMarkup(<SiteNavigation spaces={[]} user={{ firstName: "Mathias", role }} />);
    expect(markup).toContain(icon);
    expect(markup).toContain("identity-name");
    expect(markup).toContain("Mathias");
    expect(markup).toContain(`Aangemeld als Mathias, ${label}`);
    expect(markup).toContain('action="/api/auth/logout"');
  });

  it("never renders Settings for an unauthenticated visitor or student", () => {
    const anonymous = renderToStaticMarkup(<SiteNavigation spaces={[]} user={null} />);
    const student = renderToStaticMarkup(<SiteNavigation spaces={[]} user={{ firstName: "Leerling", role: "student" }} />);
    expect(anonymous).not.toContain('aria-label="Beheer"');
    expect(student).not.toContain('aria-label="Beheer"');
  });

  it.each(["teacher", "superadmin"] as const)("renders Settings for a %s", (role) => {
    const markup = renderToStaticMarkup(<SiteNavigation spaces={[]} user={{ firstName: "Leraar", role }} />);
    expect(markup).toContain('aria-label="Beheer"');
  });

  it("houdt publieke kijktoegang en beheercontext voor een leraar gescheiden", () => {
    navigation.pathname = "/admin/6";
    const markup = renderToStaticMarkup(<SiteNavigation
      spaces={[
        { slug: "5", name: "Vijfde jaar", shortLabel: "5WIS" },
        { slug: "6", name: "Zesde jaar", shortLabel: "6WIS" },
      ]}
      adminSpaces={[{ slug: "6", name: "Zesde jaar", shortLabel: "6WIS" }]}
      user={{ firstName: "Leraar", role: "teacher" }}
    />);
    expect(markup).toContain('href="/admin/6"');
    expect(markup).not.toContain('href="/admin/5"');
    expect(markup).toContain("Welkom, ");
    expect(markup).toContain("lucide-star");
  });

  it("hides the LearningSpace selector for a student with one space and routes Home there", () => {
    navigation.pathname = "/5";
    const markup = renderToStaticMarkup(<SiteNavigation spaces={[{ slug: "5", name: "Vijfde jaar", shortLabel: "5WIS" }]} user={{ firstName: "Leerling", role: "student" }} />);
    expect(markup).not.toContain("site-nav-mobile-spaces");
    expect(markup).not.toContain("site-nav-desktop-spaces");
    expect(markup).toMatch(/<a[^>]*aria-label="Startpagina"[^>]*href="\/5"/);
  });

  it("shows the desktop and mobile selector for a student with multiple spaces and routes Home to the chooser", () => {
    navigation.pathname = "/5";
    const markup = renderToStaticMarkup(<SiteNavigation spaces={[{ slug: "5", name: "Vijfde jaar", shortLabel: "5WIS" }, { slug: "6", name: "Zesde jaar", shortLabel: "6WIS" }]} user={{ firstName: "Leerling", role: "student" }} />);
    expect(markup).toContain("site-nav-desktop-spaces");
    expect(markup).toContain("site-nav-mobile-spaces");
    expect(markup).toMatch(/<a[^>]*aria-label="Startpagina"[^>]*href="\/"/);
  });

  it("renders no ordinary navigation on the login and break-glass pages", () => {
    navigation.pathname = "/aanmelden";
    expect(renderToStaticMarkup(<SiteNavigation spaces={[]} user={null} />)).toBe("");
    navigation.pathname = "/breakglass";
    expect(renderToStaticMarkup(<SiteNavigation spaces={[]} user={null} />)).toBe("");
  });

  it("shows the emergency status only inside authenticated admin navigation", () => {
    const markup = renderToStaticMarkup(<SiteNavigation emergencyAccess spaces={[]} user={{ firstName: "Beheer", role: "superadmin" }} />);
    expect(markup).toContain("Publieke noodtoegang is actief");
  });
});
