import Link from "next/link";
import { ExternalLink, List, Palette, Settings } from "lucide-react";

import type { LearningSpace } from "@/lib/repositories";

export type AdminSpaceSection = "portfolios" | "themes" | "reports" | "settings";

export function LearningSpaceNav({ spaces, current, section }: { spaces: LearningSpace[]; current: LearningSpace; section: AdminSpaceSection }) {
  return <nav className="space-nav" aria-label="Leeromgeving beheren">
    <div className="space-switcher">{spaces.map((space) => <Link key={space.id} className={space.id === current.id ? "space-current" : ""} href={`/admin/${encodeURIComponent(space.slug)}`}>{space.shortLabel}</Link>)}</div>
    <div className="space-links"><Link className={section === "portfolios" ? "space-link-current" : ""} href={`/admin/${encodeURIComponent(current.slug)}`}><List size={16} aria-hidden />Portfolio&apos;s</Link><Link className={section === "themes" ? "space-link-current" : ""} href={`/admin/${encodeURIComponent(current.slug)}/themas`}><Palette size={16} aria-hidden />Thema&apos;s</Link><Link className={section === "settings" ? "space-link-current" : ""} href={`/admin/${encodeURIComponent(current.slug)}/instellingen`}><Settings size={16} aria-hidden />Instellingen</Link>{current.isActive ? <Link href={`/${encodeURIComponent(current.slug)}`} target="_blank"><ExternalLink size={16} aria-hidden />Publieke pagina</Link> : <span className="archived-nav-status">Gearchiveerd</span>}</div>
  </nav>;
}
