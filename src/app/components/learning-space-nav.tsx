import Link from "next/link";
import { ExternalLink, KeyRound, List, Settings, Tags } from "lucide-react";

import type { LearningSpace } from "@/lib/repositories";

export type AdminSpaceSection = "portfolios" | "themes" | "reports" | "settings" | "access";

export function LearningSpaceNav({ current, section, showSettings = true }: { current: LearningSpace; section: AdminSpaceSection; showSettings?: boolean }) {
  return <nav className="space-nav" aria-label="Leeromgeving beheren">
    <div className="space-links"><Link className={section === "portfolios" ? "space-link-current" : ""} href={`/admin/${encodeURIComponent(current.slug)}`}><List size={16} aria-hidden />Portfolio&apos;s</Link><Link className={section === "themes" ? "space-link-current" : ""} href={`/admin/${encodeURIComponent(current.slug)}/themas`}><Tags size={16} aria-hidden />Thema&apos;s</Link>{showSettings ? <Link className={section === "settings" ? "space-link-current" : ""} href={`/admin/${encodeURIComponent(current.slug)}/instellingen`}><Settings size={16} aria-hidden />Instellingen</Link> : null}<Link className={section === "access" ? "space-link-current" : ""} href={`/admin/${encodeURIComponent(current.slug)}/toegang`}><KeyRound size={16} aria-hidden />Toegang</Link>{current.isActive ? <Link href={`/${encodeURIComponent(current.slug)}`} target="_blank"><ExternalLink size={16} aria-hidden />Publieke pagina</Link> : <span className="archived-nav-status">Gearchiveerd</span>}</div>
  </nav>;
}
