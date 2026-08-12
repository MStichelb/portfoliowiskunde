import Link from "next/link";

import { getLearningSpaces } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  const spaces = await getLearningSpaces(true);
  return <main className="page-shell student-page"><header className="page-header"><p className="eyebrow">Wiskunde</p><h1>Portfolio&apos;s</h1><p>Kies je leeromgeving.</p></header><div className="portfolio-cards">{spaces.map((space) => <Link className="portfolio-card" key={space.id} href={`/${encodeURIComponent(space.slug)}`}><span>Leeromgeving</span><strong>{space.name}</strong><small>Portfolio&apos;s en uitwerkingen</small></Link>)}</div></main>;
}
