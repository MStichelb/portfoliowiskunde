import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { PageBanner } from "@/app/components/page-banner";
import { isNextPrefetchRequest, preparePublicIndex } from "@/lib/public-index";
import { getLearningSpaceBySlug, getStudentPortfolios, getThemes } from "@/lib/repositories";
import { cardColorStyle, DEFAULT_PORTFOLIO_COLOR } from "@/lib/ui-colors";

export const dynamic = "force-dynamic";

export default async function LearningSpacePage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const space = await getLearningSpaceBySlug(spaceSlug);
  if (!space || !space.isActive) notFound();
  await preparePublicIndex(space.id, { isPrefetch: isNextPrefetchRequest(await headers()) });
  const [portfolios, themes] = await Promise.all([getStudentPortfolios(space.id), getThemes(space.id)]);
  const groups = [...themes.map((theme) => ({ id: theme.id, name: theme.name, portfolios: portfolios.filter((portfolio) => portfolio.themeId === theme.id) })), { id: "other", name: "Overige portfolio's", portfolios: portfolios.filter((portfolio) => !portfolio.themeId) }].filter((group) => group.portfolios.length > 0);
  return <main className="page-shell student-page"><PageBanner variant="portfolio" /><header className="page-header"><p className="eyebrow">Wiskunde</p><h1>{space.name}</h1><p>Overzicht van de oefeningenportfolio&apos;s</p></header>{groups.length === 0 ? <p className="empty-state">Er zijn momenteel geen zichtbare portfolio&apos;s.</p> : groups.map((group) => <section className="theme-group" key={group.id}><h2>{group.name}</h2><div className="portfolio-cards">{group.portfolios.map((portfolio) => <Link className="portfolio-card color-card" style={cardColorStyle(portfolio.cardColor, DEFAULT_PORTFOLIO_COLOR)} key={portfolio.id} href={`/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(portfolio.id)}`}><span>Portfolio {portfolio.code}</span><strong>{portfolio.title}</strong></Link>)}</div></section>)}</main>;
}
