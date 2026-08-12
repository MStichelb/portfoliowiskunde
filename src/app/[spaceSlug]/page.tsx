import Link from "next/link";
import { notFound } from "next/navigation";

import { maybeAutoSynchronize } from "@/lib/auto-sync";
import { getLearningSpaceBySlug, getStudentPortfolios, getThemes } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LearningSpacePage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const space = await getLearningSpaceBySlug(spaceSlug);
  if (!space || !space.isActive) notFound();
  await maybeAutoSynchronize(space.id);
  const [portfolios, themes] = await Promise.all([getStudentPortfolios(space.id), getThemes(space.id)]);
  const groups = [...themes.map((theme) => ({ id: theme.id, name: theme.name, portfolios: portfolios.filter((portfolio) => portfolio.themeId === theme.id) })), { id: "other", name: "Overige portfolio's", portfolios: portfolios.filter((portfolio) => !portfolio.themeId) }].filter((group) => group.portfolios.length > 0);
  return <main className="page-shell student-page"><header className="page-header"><p className="eyebrow">Wiskunde</p><h1>{space.name}</h1><p>Uitwerkingen die je leerkracht heeft vrijgegeven.</p></header>{groups.length === 0 ? <p className="empty-state">Er zijn momenteel geen zichtbare portfolio&apos;s.</p> : groups.map((group) => <section className="theme-group" key={group.id}><h2>{group.name}</h2><div className="portfolio-cards">{group.portfolios.map((portfolio) => <Link className="portfolio-card" key={portfolio.id} href={`/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(portfolio.id)}`}><span>Portfolio {portfolio.code}</span><strong>{portfolio.title}</strong><small>{portfolio.sections.length} onderdelen</small></Link>)}</div></section>)}</main>;
}
