"use client";

import { Folder, FolderCog, Home, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SiteNavigationSpace { slug: string; name: string; shortLabel: string; }

export function currentSpaceForPath(pathname: string, spaces: SiteNavigationSpace[]): SiteNavigationSpace | null {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const candidate = segments[0] === "admin" ? segments[1] : segments[0];
  return spaces.find((space) => space.slug === candidate) ?? null;
}

export function SiteNavigation({ spaces }: { spaces: SiteNavigationSpace[] }) {
  const pathname = usePathname();
  const adminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const current = currentSpaceForPath(pathname, spaces);
  return <nav className={`site-nav${adminRoute ? " admin-site-nav" : ""}`} aria-label="Hoofdnavigatie">
    <div className="site-nav-primary">
      <Link className="site-nav-icon" href="/" aria-label="Startpagina" title="Startpagina"><Home size={20} aria-hidden /></Link>
      {adminRoute ? <><span className="site-nav-divider" aria-hidden /><span className="admin-space-context" title="Leeromgevingen beheren"><FolderCog size={19} aria-hidden /><span className="sr-only">Leeromgevingen beheren</span></span><div className="admin-navbar-spaces" aria-label="Leeromgeving kiezen">{spaces.map((space) => <Link key={space.slug} className={space.slug === current?.slug ? "admin-navbar-space-current" : ""} href={`/admin/${encodeURIComponent(space.slug)}`}>{space.shortLabel}</Link>)}</div></> : current ? <><span className="site-nav-divider" aria-hidden /><Link className="site-nav-space" href={`/${encodeURIComponent(current.slug)}`}><Folder size={18} aria-hidden /><span>{current.name}</span></Link></> : null}
    </div>
    <Link className="site-nav-icon" href="/admin" aria-label="Beheer" title="Beheer"><Settings size={20} aria-hidden /></Link>
  </nav>;
}
