"use client";

import { Crown, Eye, Folder, FolderCog, GraduationCap, Home, LogOut, MessageSquareText, Plus, Settings, Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { homeHrefForUser } from "@/lib/navigation";

export interface SiteNavigationSpace { slug: string; name: string; shortLabel: string; }
export interface SiteNavigationUser { firstName: string; role: "superadmin" | "teacher" | "student"; }

export function currentSpaceForPath(pathname: string, spaces: SiteNavigationSpace[]): SiteNavigationSpace | null {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const candidate = segments[0] === "admin" ? segments[1] : segments[0];
  return spaces.find((space) => space.slug === candidate) ?? null;
}

export function SiteNavigation({ spaces, adminSpaces = spaces, directSpaces = adminSpaces, user, emergencyAccess = false }: { spaces: SiteNavigationSpace[]; adminSpaces?: SiteNavigationSpace[]; directSpaces?: SiteNavigationSpace[]; user: SiteNavigationUser | null; emergencyAccess?: boolean }) {
  const pathname = usePathname();
  if (!user || pathname === "/aanmelden" || pathname === "/admin/login" || pathname === "/breakglass") return null;
  const adminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const contextSpaces = adminRoute ? adminSpaces : spaces;
  const current = currentSpaceForPath(pathname, contextSpaces);
  const homeHref = homeHrefForUser(user.role, spaces);
  const canOpenAdmin = user.role === "teacher" || user.role === "superadmin";
  const hideStudentSingleSpace = user.role === "student" && spaces.length === 1;
  const directSlugs = new Set(directSpaces.map((space) => space.slug));
  const directContextSpaces = canOpenAdmin ? contextSpaces.filter((space) => directSlugs.has(space.slug)) : contextSpaces;
  const extraContextSpaces = user.role === "teacher"
    ? spaces.filter((space) => !directSlugs.has(space.slug))
    : user.role === "superadmin"
      ? adminSpaces.filter((space) => !directSlugs.has(space.slug))
      : [];
  const showSpaceNavigation = !hideStudentSingleSpace && (directContextSpaces.length > 0 || extraContextSpaces.length > 0 || (!canOpenAdmin && (contextSpaces.length > 1 || Boolean(current))));
  const firstName = user.firstName.trim() || "Gebruiker";
  return <><nav className={`site-nav${adminRoute ? " admin-site-nav" : ""}`} aria-label="Hoofdnavigatie">
    <div className="site-nav-primary">
      <Link className="site-nav-icon" href={homeHref} aria-label="Startpagina" title="Startpagina"><Home size={20} aria-hidden /></Link>
      {user.role === "student" ? <Link className="site-nav-icon" href="/mijn-meldingen" aria-label="Mijn meldingen" title="Mijn meldingen"><MessageSquareText size={19} aria-hidden /></Link> : null}
      {canOpenAdmin ? <Link className="site-nav-icon" href="/admin" aria-label="Beheer" title="Beheer"><Settings size={20} aria-hidden /></Link> : null}
      {showSpaceNavigation ? <><span className="site-nav-divider site-nav-space-divider" aria-hidden /><div className="site-nav-space-zone"><SpaceNavigation spaces={contextSpaces} directSpaces={directContextSpaces} extraSpaces={extraContextSpaces} current={current} adminRoute={adminRoute} role={user.role} /></div></> : null}
    </div>
    <div className="site-nav-account">
      <span className="site-nav-divider" aria-hidden /><span className="site-nav-identity" aria-label={`Aangemeld als ${firstName}, ${roleLabel(user.role)}`}><RoleIcon role={user.role} /><span className="identity-name">{firstName}</span></span>
      <form action="/api/auth/logout" method="post"><button className="site-nav-icon site-nav-logout" type="submit" aria-label="Uitloggen" title="Uitloggen"><LogOut size={19} aria-hidden /></button></form>
    </div>
  </nav>{adminRoute && canOpenAdmin && emergencyAccess ? <div className="emergency-access-banner" role="status">Publieke noodtoegang is actief</div> : null}</>;
}

function SpaceNavigation({ spaces, directSpaces, extraSpaces, current, adminRoute, role }: { spaces: SiteNavigationSpace[]; directSpaces: SiteNavigationSpace[]; extraSpaces: SiteNavigationSpace[]; current: SiteNavigationSpace | null; adminRoute: boolean; role: SiteNavigationUser["role"] }) {
  const directHref = (space: SiteNavigationSpace) => `${adminRoute ? "/admin" : ""}/${encodeURIComponent(space.slug)}`;
  const extraHref = (space: SiteNavigationSpace) => `${role === "superadmin" ? "/admin" : ""}/${encodeURIComponent(space.slug)}`;
  const label = current?.shortLabel ?? "Leeromg.";
  return <>
    <span className="site-nav-space-context" title={adminRoute ? "Leeromgevingen beheren" : "Leeromgeving kiezen"}>{adminRoute ? <FolderCog size={19} aria-hidden /> : <Folder size={18} aria-hidden />}<span className="sr-only">{adminRoute ? "Leeromgevingen beheren" : "Leeromgeving kiezen"}</span></span>
    <div className="site-nav-desktop-spaces" aria-label="Leeromgeving kiezen"><div className="site-nav-direct-spaces">{directSpaces.map((space) => <Link key={space.slug} className={space.slug === current?.slug ? "site-nav-space-current" : ""} href={directHref(space)}>{space.shortLabel}</Link>)}</div>{extraSpaces.length ? <details className="site-nav-extra-spaces"><summary aria-label={role === "superadmin" ? "Overige leeromgevingen" : "Leeromgevingen met kijktoegang"} title={role === "superadmin" ? "Overige leeromgevingen" : "Leeromgevingen met kijktoegang"}>{role === "superadmin" ? <Plus size={17} aria-hidden /> : <Eye size={17} aria-hidden />}</summary><div>{extraSpaces.map((space) => <Link key={space.slug} className={space.slug === current?.slug ? "site-nav-space-current" : ""} href={extraHref(space)}>{space.shortLabel}</Link>)}</div></details> : null}</div>
    <details className="site-nav-mobile-spaces"><summary aria-label={`Leeromgeving kiezen, huidig: ${label}`}>{label}</summary><div>{spaces.map((space) => <Link key={space.slug} className={space.slug === current?.slug ? "site-nav-space-current" : ""} href={directHref(space)}>{space.shortLabel}</Link>)}</div></details>
  </>;
}

function RoleIcon({ role }: { role: SiteNavigationUser["role"] }) {
  if (role === "superadmin") return <Crown size={18} aria-hidden />;
  if (role === "teacher") return <Star size={18} aria-hidden />;
  return <GraduationCap size={18} aria-hidden />;
}

function roleLabel(role: SiteNavigationUser["role"]): string {
  if (role === "superadmin") return "hoofdbeheerder";
  if (role === "teacher") return "leraar";
  return "leerling";
}
