import Link from "next/link";

import { PageBanner } from "@/app/components/page-banner";
import { getLearningSpaces } from "@/lib/repositories";
import { cardColorStyle, DEFAULT_LEARNING_SPACE_COLOR } from "@/lib/ui-colors";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  const spaces = await getLearningSpaces(true);
  return <main className="page-shell student-page"><PageBanner variant="main" /><header className="page-header public-home-heading"><h1>Kies je leeromgeving</h1></header><div className="portfolio-cards learning-space-cards">{spaces.map((space) => <Link className="portfolio-card color-card" style={cardColorStyle(space.cardColor, DEFAULT_LEARNING_SPACE_COLOR)} key={space.id} href={`/${encodeURIComponent(space.slug)}`}><strong>{space.name}</strong><small>{space.description}</small></Link>)}</div></main>;
}
