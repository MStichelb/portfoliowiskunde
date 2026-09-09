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
    expect(markup.indexOf('aria-label="Startpagina"')).toBeLessThan(markup.indexOf('aria-label="Beheer"'));
    expect(markup.indexOf('aria-label="Beheer"')).toBeLessThan(markup.indexOf("site-nav-space-divider"));
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

  it("shows Mijn meldingen only in authenticated student navigation", () => {
    navigation.pathname = "/";
    const student = renderToStaticMarkup(<SiteNavigation spaces={[]} user={{ firstName: "Leerling", role: "student" }} />);
    const teacher = renderToStaticMarkup(<SiteNavigation spaces={[]} user={{ firstName: "Leraar", role: "teacher" }} />);
    const superadmin = renderToStaticMarkup(<SiteNavigation spaces={[]} user={{ firstName: "Beheer", role: "superadmin" }} />);

    expect(student).toMatch(/<a[^>]*aria-label="Mijn meldingen"[^>]*href="\/mijn-meldingen"/);
    expect(student).toContain("lucide-message-square-text");
    expect(teacher).not.toContain("/mijn-meldingen");
    expect(superadmin).not.toContain("/mijn-meldingen");
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
    expect(markup).toContain('aria-label="Leeromgevingen met kijktoegang"');
    expect(markup).toContain('href="/5"');
    expect(markup).toContain("lucide-eye");
    expect(markup).toContain("lucide-star");
  });

  it("toont owner- en editorspaces direct en view-only spaces uitsluitend achter Eye", () => {
    const spaces = [
      { slug: "5", name: "Vijfde jaar", shortLabel: "5WIS" },
      { slug: "6", name: "Zesde jaar", shortLabel: "6WIS" },
      { slug: "extra", name: "Extra oefeningen", shortLabel: "EXTRA" },
    ];
    const markup = renderToStaticMarkup(<SiteNavigation
      spaces={spaces}
      adminSpaces={spaces.slice(0, 2)}
      directSpaces={spaces.slice(0, 2)}
      user={{ firstName: "Leraar", role: "teacher" }}
    />);

    expect(markup).toContain('href="/admin/5"');
    expect(markup).toContain('href="/admin/6"');
    expect(markup).toContain('href="/extra"');
    expect(markup).not.toContain('href="/admin/extra"');
    expect((markup.match(/>EXTRA<\/a>/g) ?? [])).toHaveLength(1);
  });

  it("toont voor een hoofdbeheerder owner- en editorspaces direct en overige ruimtes achter plus", () => {
    const markup = renderToStaticMarkup(<SiteNavigation
      spaces={[
        { slug: "5", name: "Volledige naam vijf", shortLabel: "5WIS" },
        { slug: "6", name: "Volledige naam zes", shortLabel: "6WIS" },
        { slug: "extra", name: "Volledige naam extra", shortLabel: "EXTRA" },
      ]}
      adminSpaces={[
        { slug: "5", name: "Volledige naam vijf", shortLabel: "5WIS" },
        { slug: "6", name: "Volledige naam zes", shortLabel: "6WIS" },
        { slug: "extra", name: "Volledige naam extra", shortLabel: "EXTRA" },
      ]}
      directSpaces={[
        { slug: "5", name: "Volledige naam vijf", shortLabel: "5WIS" },
        { slug: "6", name: "Volledige naam zes", shortLabel: "6WIS" },
      ]}
      user={{ firstName: "Beheer", role: "superadmin" }}
    />);

    expect(markup).toContain("site-nav-direct-spaces");
    expect(markup).toContain("lucide-plus");
    expect(markup).toContain('aria-label="Overige leeromgevingen"');
    expect(markup).toContain(">5WIS</a>");
    expect(markup).toContain(">6WIS</a>");
    const plusMenu = markup.match(/<details class="site-nav-extra-spaces"[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(plusMenu).toContain('href="/admin/extra"');
    expect(plusMenu).toContain(">EXTRA</a>");
    expect(plusMenu).not.toContain(">5WIS</a>");
    expect(plusMenu).not.toContain(">6WIS</a>");
    expect(markup).not.toContain("Volledige naam");
  });

  it("toont publieke kijktoegang van een leraar achter Eye met publieke routes", () => {
    navigation.pathname = "/5";
    const markup = renderToStaticMarkup(<SiteNavigation
      spaces={[
        { slug: "5", name: "Eigen ruimte", shortLabel: "5WIS" },
        { slug: "6", name: "Kijkruimte", shortLabel: "6WIS" },
      ]}
      adminSpaces={[{ slug: "5", name: "Eigen ruimte", shortLabel: "5WIS" }]}
      directSpaces={[{ slug: "5", name: "Eigen ruimte", shortLabel: "5WIS" }]}
      user={{ firstName: "Leraar", role: "teacher" }}
    />);

    expect(markup).toContain("lucide-eye");
    expect(markup).toContain('aria-label="Leeromgevingen met kijktoegang"');
    expect(markup).toContain('href="/6"');
    expect(markup).not.toContain('href="/admin/6"');
    expect(markup).not.toContain("Eigen ruimte");
    expect(markup).not.toContain("Kijkruimte");
  });

  it("verbergt Plus en Eye wanneer er geen overige ruimtes zijn", () => {
    const space = { slug: "5", name: "Vijfde jaar", shortLabel: "5WIS" };
    const markup = renderToStaticMarkup(<SiteNavigation spaces={[space]} adminSpaces={[space]} directSpaces={[space]} user={{ firstName: "Leraar", role: "teacher" }} />);
    expect(markup).not.toContain("lucide-plus");
    expect(markup).not.toContain("lucide-eye");
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
    expect(markup).toContain(">5WIS</a>");
    expect(markup).toContain(">6WIS</a>");
    expect(markup).not.toContain("Vijfde jaar");
    expect(markup).not.toContain("Zesde jaar");
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
