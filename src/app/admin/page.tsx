import { getAdminPortfolios, getLatestWarnings } from "@/lib/repositories";

import { exerciseVisibilityAction, portfolioVisibilityAction, syncAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [portfolios, warnings] = await Promise.all([getAdminPortfolios(), getLatestWarnings()]);

  return (
    <main className="page-shell admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Beheer</p>
          <h1>Portfolio-index</h1>
          <p>Bronbestanden worden alleen gelezen. Nieuwe portfolio&apos;s en oefeningen starten verborgen.</p>
        </div>
        <form action={syncAction}>
          <button className="primary-button" type="submit">Opnieuw synchroniseren</button>
        </form>
      </header>

      {portfolios.length === 0 ? (
        <p className="empty-state">Nog geen inhoud geïndexeerd. Kies “Opnieuw synchroniseren”.</p>
      ) : (
        <div className="admin-portfolios">
          {portfolios.map((portfolio) => (
            <section className="admin-portfolio" key={portfolio.id}>
              <div className="admin-row">
                <div>
                  <h2>Portfolio {portfolio.code}: {portfolio.title}</h2>
                  <p className="file-reference">Opgaven: {portfolio.assignmentPdfPath ?? "niet herkend"}</p>
                  <p className="file-reference">Eindoplossingen: {portfolio.finalSolutionsPdfPath ?? "niet herkend"}</p>
                </div>
                <VisibilityForm action={portfolioVisibilityAction} id={portfolio.id} visible={portfolio.visible} label="Portfolio" />
              </div>
              {portfolio.sections.map((section) => (
                <section className="admin-section" key={section.id}>
                  <h3>{section.order}. {section.title}</h3>
                  <ul className="admin-exercises">
                    {section.exercises.map((exercise) => (
                      <li key={exercise.id} className="admin-exercise">
                        <div>
                          <strong>Oefening {exercise.code}</strong>
                          <p className="asset-list">
                            {exercise.assets.map((asset) => `${asset.variant === "alternative" ? "alternatief" : "standaard"}, stap ${asset.step}: ${asset.fileName}`).join(" | ")}
                          </p>
                        </div>
                        <VisibilityForm action={exerciseVisibilityAction} id={exercise.id} visible={exercise.visible} label="Oplossing" />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </section>
          ))}
        </div>
      )}

      <section className="warnings" aria-labelledby="warnings-title">
        <h2 id="warnings-title">Waarschuwingen ({warnings.length})</h2>
        {warnings.length === 0 ? <p>Geen waarschuwingen in de laatste synchronisatie.</p> : (
          <ul>
            {warnings.map((warning, index) => (
              <li key={`${warning.relativePath}-${index}`}>
                <strong>{warning.severity === "warning" ? "Waarschuwing" : "Info"}:</strong> {warning.message}
                <span className="file-reference">{warning.relativePath}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function VisibilityForm({
  action,
  id,
  visible,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  visible: boolean;
  label: string;
}) {
  return (
    <form action={action} className="visibility-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="visible" value={String(!visible)} />
      <button type="submit" className={visible ? "visibility visible" : "visibility hidden"}>
        {label}: {visible ? "zichtbaar" : "verborgen"}
      </button>
    </form>
  );
}
