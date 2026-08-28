import Link from "next/link";
import { notFound } from "next/navigation";

import { PortfolioDocumentLinks } from "@/app/components/portfolio-document-links";
import { maybeAutoSynchronize } from "@/lib/auto-sync";
import { getStudentPortfolio } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function PortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await maybeAutoSynchronize();
  const portfolio = await getStudentPortfolio(id);
  if (!portfolio) notFound();
  return <main className="page-shell student-page"><header className="page-header"><p className="eyebrow">{portfolio.themeName ?? "Overige portfolio's"} • Portfolio {portfolio.code}</p><h1>{portfolio.title}</h1><PortfolioDocumentLinks portfolioId={portfolio.id} hasHints={Boolean(portfolio.hintsDocumentPath)} /></header>
    {portfolio.sections.map((section) => <section className="section" key={section.id}><h2>{section.order}. {section.title}</h2><ol className="exercise-grid">{section.exercises.map((exercise) => <li key={exercise.id}>{exercise.visible ? <Link href={`/oefening/${encodeURIComponent(exercise.id)}`} className="exercise-link">Oefening {exercise.code}</Link> : <span className="exercise-hidden" title="Oplossing niet beschikbaar" aria-label={`Oefening ${exercise.code}: oplossing niet beschikbaar`}>Oefening {exercise.code}<small>Niet beschikbaar</small></span>}</li>)}</ol></section>)}
  </main>;
}
