"use client";

import { Crown, Folder, FolderCog, GraduationCap, Home, LogOut, Settings, Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SiteNavigationSpace { slug: string; name: string; shortLabel: string; }
export interface SiteNavigationUser { firstName: string; role: "superadmin" | "teacher" | "student"; }

export function currentSpaceForPath(pathname: string, spaces: SiteNavigationSpace[]): SiteNavigationSpace | null {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const candidate = segments[0] === "admin" ? segments[1] : segments[0];
  return spaces.find((space) => space.slug === candidate) ?? null;
}

export function SiteNavigation({ spaces, user }: { spaces: SiteNavigationSpace[]; user: SiteNavigationUser | null }) {
  const pathname = usePathname();
  const adminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const current = currentSpaceForPath(pathname, spaces);
  return <nav className={`site-nav${adminRoute ? " admin-site-nav" : ""}`} aria-label="Hoofdnavigatie">
    <div className="site-nav-primary">
      <Link className="site-nav-icon" href="/" aria-label="Startpagina" title="Startpagina"><Home size={20} aria-hidden /></Link>
      {adminRoute ? <><span className="site-nav-divider" aria-hidden /><span className="admin-space-context" title="Leeromgevingen beheren"><FolderCog size={19} aria-hidden /><span className="sr-only">Leeromgevingen beheren</span></span><div className="admin-navbar-spaces" aria-label="Leeromgeving kiezen">{spaces.map((space) => <Link key={space.slug} className={space.slug === current?.slug ? "admin-navbar-space-current" : ""} href={`/admin/${encodeURIComponent(space.slug)}`}>{space.shortLabel}</Link>)}</div></> : current ? <><span className="site-nav-divider" aria-hidden /><Link className="site-nav-space" href={`/${encodeURIComponent(current.slug)}`}><Folder size={18} aria-hidden /><span>{current.name}</span></Link></> : null}
    </div>
    <div className="site-nav-account">
      {user ? <><span className="site-nav-divider" aria-hidden /><span className="site-nav-identity" aria-label={`Aangemeld als ${user.firstName}, ${roleLabel(user.role)}`}><RoleIcon role={user.role} /><span className="identity-prefix">Aangemeld als </span><span className="identity-name">{user.firstName}</span></span></> : null}
      <Link className="site-nav-icon" href="/admin" aria-label="Beheer" title="Beheer"><Settings size={20} aria-hidden /></Link>
      {user ? <form action="/api/auth/logout" method="post"><button className="site-nav-icon site-nav-logout" type="submit" aria-label="Uitloggen" title="Uitloggen"><LogOut size={19} aria-hidden /></button></form> : null}
    </div>
  </nav>;
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
