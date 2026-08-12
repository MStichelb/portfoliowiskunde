"use client";

import { useEffect } from "react";

export default function ApplicationError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unexpected application error.", { digest: error.digest });
  }, [error]);

  return <main className="page-shell narrow-page">
    <p className="eyebrow">Portfolio Wiskunde</p>
    <h1>Er ging iets mis</h1>
    <p>De pagina kon niet worden geladen. Probeer het opnieuw; bestaande portfolio-inhoud en instellingen blijven bewaard.</p>
    <button className="primary-button" type="button" onClick={reset}>Opnieuw proberen</button>
  </main>;
}
