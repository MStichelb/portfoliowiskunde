import Link from "next/link";

import { LearningSpaceCreateForm } from "@/app/components/learning-space-create-form";
import { requireAdmin } from "@/lib/auth";
import { getGoogleServiceAccountConfigurationProblem } from "@/lib/google-service-account-config";
import { getMicrosoftConfigurationProblem, hasOneDriveAuthorization } from "@/lib/onedrive";
import { getLearningSpaces, type LearningSpace } from "@/lib/repositories";

import { createLearningSpaceAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ onedrive?: string }> }) {
  await requireAdmin();
  const [{ onedrive }, spaces, oneDriveAuthorized] = await Promise.all([searchParams, getLearningSpaces(), hasOneDriveAuthorization()]);
  const microsoftProblem = getMicrosoftConfigurationProblem();
  const googleProblem = getGoogleServiceAccountConfigurationProblem();

  return <main className="page-shell narrow-page">
    <Link href="/admin" className="back-link">Terug naar beheer</Link>
    <p className="eyebrow">Globaal beheer</p>
    <h1>Leeromgevingen</h1>
    <p>Elke leeromgeving heeft een eigen bron, synchronisatie, portfolio&apos;s, thema&apos;s en foutmeldingen. Bronbestanden blijven read-only.</p>
    <section className="settings-section">
      <h2>OneDrive-verbinding</h2>
      <p>{oneDriveAuthorized ? "OneDrive is app-breed verbonden. Drive- en map-ID's blijven per leeromgeving ingesteld." : "Verbind een Microsoft-account voordat je OneDrive-bronnen synchroniseert."}</p>
      {onedrive === "connected" ? <p className="success-message" role="status">OneDrive is verbonden.</p> : null}
      {onedrive === "authorization-failed" || onedrive === "connection-failed" ? <p className="form-message" role="alert">OneDrive verbinden is niet gelukt. Controleer de Microsoft-configuratie en probeer opnieuw.</p> : null}
      {microsoftProblem ? <p className="form-message" role="alert">{microsoftProblem}</p> : <Link className="secondary-button link-button" href="/api/onedrive/connect">{oneDriveAuthorized ? "OneDrive opnieuw verbinden" : "OneDrive verbinden"}</Link>}
    </section>
    <section className="settings-section">
      <h2>Google Drive-verbinding</h2>
      {googleProblem
        ? <p className="form-message" role="alert">{googleProblem}</p>
        : <p className="success-message" role="status">De app-brede Google Drive service-accountconfiguratie is geldig.</p>}
      <p>De gekozen mirrorfolder moet per leeromgeving als Viewer met het service account gedeeld zijn.</p>
    </section>
    <div className="space-list">{spaces.map((space) => <div className="space-list-item" key={space.id}><div><strong>{space.name}</strong><span>/{space.slug} · {sourceLabel(space)}</span></div><Link className="secondary-button link-button" href={`/admin/${encodeURIComponent(space.slug)}/instellingen`}>Beheren</Link></div>)}</div>
    <section className="settings-section">
      <h2>Leeromgeving toevoegen</h2>
      <LearningSpaceCreateForm action={createLearningSpaceAction} />
    </section>
  </main>;
}

function sourceLabel(space: LearningSpace): string {
  if (space.sourceType === "local") return space.localSourcePath || "Bronmap nog instellen";
  if (space.sourceType === "google_drive") return space.googleDriveFolderLabel || "Google Drive";
  return "OneDrive";
}
