import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { PortfolioDocumentsWithMessage } from "@/app/components/portfolio-documents-with-message";
import { isNextPrefetchRequest, preparePublicIndex } from "@/lib/public-index";
import { requirePublicLearningSpaceAccess } from "@/lib/learning-space-access";
import { getLearningSpaceBySlug, getStudentPortfolio } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LearningSpacePortfolioPage({ params }: { params: Promise<{ spaceSlug: string; id: string }> }) {
  const { spaceSlug, id } = await params;
  const space = await getLearningSpaceBySlug(spaceSlug);
  if (!space || !space.isActive) notFound();
  await requirePublicLearningSpaceAccess(space.id, `/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(id)}`);
  await preparePublicIndex(space.id, { isPrefetch: isNextPrefetchRequest(await headers()) });
  const portfolio = await getStudentPortfolio(id, space.id);
  if (!portfolio) notFound();
  return <main className="page-shell student-page"><header className="page-header"><p className="eyebrow">{portfolio.themeName ?? "Overige portfolio's"} • Portfolio {portfolio.code}</p><h1>{portfolio.title}</h1><PortfolioDocumentsWithMessage portfolioId={portfolio.id} spaceSlug={space.slug} hasHints={Boolean(portfolio.hintsDocumentPath)} customText={portfolio.customText} customTextPosition={portfolio.customTextPosition} /></header>{portfolio.sections.map((section) => <section className="section" key={section.id}><h2>{section.order}. {section.title}</h2><ol className="exercise-grid">{section.exercises.map((exercise) => <li key={exercise.id}>{exercise.visible ? <Link href={`/${encodeURIComponent(space.slug)}/oefening/${encodeURIComponent(exercise.id)}`} className="exercise-link">Oefening {exercise.code}</Link> : <span className="exercise-hidden">Oefening {exercise.code}<small>Niet beschikbaar</small></span>}</li>)}</ol></section>)}</main>;
}
