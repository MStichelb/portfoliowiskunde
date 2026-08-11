import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { getLocalStorageSettings } from "@/lib/repositories";

import { resetSourcePathAction, saveSourcePathAction } from "./actions";

export const dynamic = "force-dynamic";

const origins = {
  database: "ingesteld via beheer",
  environment: "ingesteld via PORTFOLIO_SOURCE_PATH",
  default: "standaardtestmap",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; reset?: string }> }) {
  await requireAdmin();
  const [settings, params] = await Promise.all([getLocalStorageSettings(), searchParams]);

  return (
    <main className="page-shell narrow-page">
      <Link href="/admin" className="back-link">Terug naar beheer</Link>
      <p className="eyebrow">Beheer</p>
      <h1>Instellingen</h1>
      <p>De bronmap wordt uitsluitend gelezen. Wijzigingen hier verplaatsen, verwijderen of bewerken geen bronbestanden.</p>
      {params.saved ? <p className="success-message">Bronmap opgeslagen. Synchroniseer opnieuw om de nieuwe map te indexeren.</p> : null}
      {params.reset ? <p className="success-message">De aangepaste bronmap is verwijderd; de standaardinstelling is weer actief.</p> : null}
      {params.error === "empty" ? <p className="error-message">Vul een bronmap in.</p> : null}
      {params.error === "invalid-path" ? <p className="error-message">Deze map bestaat niet of is niet toegankelijk.</p> : null}
      <section className="settings-section">
        <h2>Lokale bronmap</h2>
        <p className="file-reference">Actief via: {origins[settings.sourcePathOrigin]}</p>
        <form action={saveSourcePathAction} className="settings-form">
          <label htmlFor="sourcePath">Pad</label>
          <input id="sourcePath" name="sourcePath" type="text" defaultValue={settings.sourcePath} required />
          <button className="primary-button" type="submit">Bronmap opslaan</button>
        </form>
        {settings.sourcePathOrigin === "database" ? <form action={resetSourcePathAction}><button className="secondary-button" type="submit">Aangepaste bronmap wissen</button></form> : null}
      </section>
    </main>
  );
}
