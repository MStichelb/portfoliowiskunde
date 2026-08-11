import Link from "next/link";
import { notFound } from "next/navigation";

import { getStudentPortfolio } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function PortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const portfolio = await getStudentPortfolio(id);
  if (!portfolio) notFound();
  return <main className="page-shell student-page"><Link href="/" className="back-link">Terug naar portfolio&apos;s</Link><header className="page-header"><p className="eyebrow">Portfolio {portfolio.code}</p><h1>{portfolio.title}</h1><div className="document-actions"><a className="secondary-button" href={`/api/portfolio-assets/${encodeURIComponent(portfolio.id)}/assignment`} target="_blank" rel="noreferrer">Opgaven</a><a className="secondary-button" href={`/api/portfolio-assets/${encodeURIComponent(portfolio.id)}/final-solutions`} target="_blank" rel="noreferrer">Eindoplossingen</a></div></header>
    {portfolio.sections.map((section) => <section className="section" key={section.id}><h2>{section.order}. {section.title}</h2><ol className="exercise-grid">{section.exercises.map((exercise) => <li key={exercise.id}>{exercise.visible ? <Link href={`/oefening/${encodeURIComponent(exercise.id)}`} className="exercise-link">Oefening {exercise.code}</Link> : <span className="exercise-hidden" title="Oplossing nog niet beschikbaar" aria-label={`Oefening ${exercise.code}: oplossing nog niet beschikbaar`}>Oefening {exercise.code}<small>Nog niet beschikbaar</small></span>}</li>)}</ol></section>)}
  </main>;
}
