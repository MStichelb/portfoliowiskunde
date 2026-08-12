import Link from "next/link";

import type { LearningSpace } from "@/lib/repositories";

export function LearningSpaceNav({ spaces, current, section }: { spaces: LearningSpace[]; current: LearningSpace; section: "portfolios" | "themes" | "reports" | "settings" }) {
  return <nav className="space-nav" aria-label="Leeromgeving beheren">
    <div className="space-switcher">{spaces.map((space) => <Link key={space.id} className={space.id === current.id ? "space-current" : ""} href={`/admin/${encodeURIComponent(space.slug)}`}>{space.name}</Link>)}</div>
    <div className="space-links"><Link className={section === "portfolios" ? "space-link-current" : ""} href={`/admin/${encodeURIComponent(current.slug)}`}>Portfolio&apos;s</Link><Link className={section === "themes" ? "space-link-current" : ""} href={`/admin/${encodeURIComponent(current.slug)}/themas`}>Thema&apos;s</Link><Link className={section === "reports" ? "space-link-current" : ""} href={`/admin/${encodeURIComponent(current.slug)}/foutmeldingen`}>Foutmeldingen</Link><Link className={section === "settings" ? "space-link-current" : ""} href={`/admin/${encodeURIComponent(current.slug)}/instellingen`}>Instellingen</Link><Link href={`/${encodeURIComponent(current.slug)}`}>Publieke pagina</Link></div>
  </nav>;
}
