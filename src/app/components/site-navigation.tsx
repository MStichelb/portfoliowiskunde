"use client";

import { Crown, Folder, FolderCog, GraduationCap, Home, LogOut, Settings, Star } from "lucide-react";
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

export function SiteNavigation({ spaces, user, emergencyAccess = false }: { spaces: SiteNavigationSpace[]; user: SiteNavigationUser | null; emergencyAccess?: boolean }) {
  const pathname = usePathname();
  if (pathname === "/aanmelden" || pathname === "/admin/login" || pathname === "/breakglass") return null;
  const adminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const current = currentSpaceForPath(pathname, spaces);
  const homeHref = homeHrefForUser(user?.role ?? null, spaces);
  const canOpenAdmin = user?.role === "teacher" || user?.role === "superadmin";
  const hideStudentSingleSpace = user?.role === "student" && spaces.length === 1;
  const showSpaceNavigation = spaces.length > 0 && !hideStudentSingleSpace && (adminRoute || spaces.length > 1 || Boolean(current));
  return <><nav className={`site-nav${adminRoute ? " admin-site-nav" : ""}`} aria-label="Hoofdnavigatie">
    <div className="site-nav-primary">
      <Link className="site-nav-icon" href={homeHref} aria-label="Startpagina" title="Startpagina"><Home size={20} aria-hidden /></Link>
      {showSpaceNavigation ? <><span className="site-nav-divider site-nav-space-divider" aria-hidden /><SpaceNavigation spaces={spaces} current={current} adminRoute={adminRoute} /></> : null}
    </div>
    <div className="site-nav-account">
      {user ? <><span className="site-nav-divider" aria-hidden /><span className="site-nav-identity" aria-label={`Aangemeld als ${user.firstName}, ${roleLabel(user.role)}`}><RoleIcon role={user.role} /><span className="identity-name">{user.firstName}</span></span></> : null}
      {canOpenAdmin ? <Link className="site-nav-icon" href="/admin" aria-label="Beheer" title="Beheer"><Settings size={20} aria-hidden /></Link> : null}
      {user ? <form action="/api/auth/logout" method="post"><button className="site-nav-icon site-nav-logout" type="submit" aria-label="Uitloggen" title="Uitloggen"><LogOut size={19} aria-hidden /></button></form> : null}
    </div>
  </nav>{adminRoute && canOpenAdmin && emergencyAccess ? <div className="emergency-access-banner" role="status">Publieke noodtoegang is actief</div> : null}</>;
}

function SpaceNavigation({ spaces, current, adminRoute }: { spaces: SiteNavigationSpace[]; current: SiteNavigationSpace | null; adminRoute: boolean }) {
  const href = (space: SiteNavigationSpace) => `${adminRoute ? "/admin" : ""}/${encodeURIComponent(space.slug)}`;
  const label = current?.shortLabel ?? "Leeromgevingen";
  return <>
    <span className="site-nav-space-context" title={adminRoute ? "Leeromgevingen beheren" : "Leeromgeving kiezen"}>{adminRoute ? <FolderCog size={19} aria-hidden /> : <Folder size={18} aria-hidden />}<span className="sr-only">{adminRoute ? "Leeromgevingen beheren" : "Leeromgeving kiezen"}</span></span>
    <div className="site-nav-desktop-spaces" aria-label="Leeromgeving kiezen">{spaces.map((space) => <Link key={space.slug} className={space.slug === current?.slug ? "site-nav-space-current" : ""} href={href(space)}>{space.shortLabel}</Link>)}</div>
    <details className="site-nav-mobile-spaces"><summary aria-label={`Leeromgeving kiezen, huidig: ${label}`}>{label}</summary><div>{spaces.map((space) => <Link key={space.slug} className={space.slug === current?.slug ? "site-nav-space-current" : ""} href={href(space)}>{space.name}</Link>)}</div></details>
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
