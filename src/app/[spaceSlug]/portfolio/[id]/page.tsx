import Link from "next/link";
import { notFound } from "next/navigation";

import { maybeAutoSynchronize } from "@/lib/auto-sync";
import { getLearningSpaceBySlug, getStudentPortfolio } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LearningSpacePortfolioPage({ params }: { params: Promise<{ spaceSlug: string; id: string }> }) {
  const { spaceSlug, id } = await params;
  const space = await getLearningSpaceBySlug(spaceSlug);
  if (!space || !space.isActive) notFound();
  await maybeAutoSynchronize(space.id);
  const portfolio = await getStudentPortfolio(id, space.id);
  if (!portfolio) notFound();
  return <main className="page-shell student-page"><Link href={`/${encodeURIComponent(space.slug)}`} className="back-link">Terug naar portfolio&apos;s</Link><header className="page-header"><p className="eyebrow">Portfolio {portfolio.code}</p><h1>{portfolio.title}</h1><div className="document-actions"><a className="secondary-button" href={`/api/portfolio-assets/${encodeURIComponent(portfolio.id)}/assignment?space=${encodeURIComponent(space.slug)}`} target="_blank" rel="noreferrer">Opgaven</a><a className="secondary-button" href={`/api/portfolio-assets/${encodeURIComponent(portfolio.id)}/final-solutions?space=${encodeURIComponent(space.slug)}`} target="_blank" rel="noreferrer">Eindoplossingen</a></div></header>{portfolio.sections.map((section) => <section className="section" key={section.id}><h2>{section.order}. {section.title}</h2><ol className="exercise-grid">{section.exercises.map((exercise) => <li key={exercise.id}>{exercise.visible ? <Link href={`/${encodeURIComponent(space.slug)}/oefening/${encodeURIComponent(exercise.id)}`} className="exercise-link">Oefening {exercise.code}</Link> : <span className="exercise-hidden">Oefening {exercise.code}<small>Nog niet beschikbaar</small></span>}</li>)}</ol></section>)}</main>;
}
