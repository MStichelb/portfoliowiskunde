import Link from "next/link";

import { getStudentPortfolios } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  const portfolios = await getStudentPortfolios();

  return (
    <main className="page-shell student-page">
      <header className="page-header">
        <p className="eyebrow">Wiskunde</p>
        <h1>Portfolio&apos;s</h1>
        <p>Uitwerkingen die je leerkracht heeft vrijgegeven.</p>
      </header>

      {portfolios.length === 0 ? (
        <p className="empty-state">Er zijn momenteel geen zichtbare portfolio&apos;s.</p>
      ) : (
        <div className="portfolio-list">
          {portfolios.map((portfolio) => (
            <section className="portfolio" key={portfolio.code}>
              <h2>
                Portfolio {portfolio.code}: {portfolio.title}
              </h2>
              {portfolio.sections.map((section) => (
                <section className="section" key={section.order}>
                  <h3>
                    {section.order}. {section.title}
                  </h3>
                  <ol className="exercise-grid">
                    {section.exercises.map((exercise) => (
                      <li key={exercise.id}>
                        {exercise.visible ? (
                          <Link href={`/oefening/${encodeURIComponent(exercise.id)}`} className="exercise-link">
                            Oefening {exercise.code}
                          </Link>
                        ) : (
                          <span className="exercise-hidden" aria-label={`Oefening ${exercise.code} is nog niet beschikbaar`}>
                            Oefening {exercise.code}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
