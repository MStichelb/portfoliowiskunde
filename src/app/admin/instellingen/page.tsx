import { CheckCircle2, CircleAlert } from "lucide-react";

import { ActiveSourceBadge } from "@/app/components/active-source-badge";
import { LearningSpaceCreateForm } from "@/app/components/learning-space-create-form";
import { LearningSpaceLifecycleActions } from "@/app/components/learning-space-lifecycle-actions";
import { requireAdmin } from "@/lib/auth";
import { getGoogleServiceAccountConfigurationProblem } from "@/lib/google-service-account-config";
import { getMicrosoftConfigurationProblem, hasOneDriveAuthorization } from "@/lib/onedrive";
import { getLearningSpaces, type LearningSpace, type LearningSpaceSource } from "@/lib/repositories";

import { createLearningSpaceAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; onedrive?: string }> }) {
  await requireAdmin();
  const [{ error, onedrive }, spaces, oneDriveAuthorized] = await Promise.all([searchParams, getLearningSpaces(), hasOneDriveAuthorization()]);
  const microsoftProblem = getMicrosoftConfigurationProblem();
  const googleProblem = getGoogleServiceAccountConfigurationProblem();
  const activeSpaces = spaces.filter((space) => space.isActive);
  const archivedSpaces = spaces.filter((space) => !space.isActive);

  return <main className="page-shell admin-page learning-spaces-page">
    <header className="page-header"><p className="eyebrow">Beheer</p><h1>Leeromgevingen</h1><p>Leeromgevingen vormen een slimme laag op een OneDrive-map of een Google Drive-map waarin portfolio&apos;s worden verzameld. Bronbestanden worden enkel gelezen, niet bewerkt.</p></header>
    {error ? <p className="form-message" role="alert">{settingsErrorMessage(error)}</p> : null}
    <section className="admin-card connections-card" aria-labelledby="connections-heading">
      <div className="card-heading"><div><h2 id="connections-heading">Verbindingen</h2><p>App-brede toegang voor cloudbronnen.</p></div></div>
      <div className="connection-list">
        <div className="connection-row"><ConnectionStatus ok={oneDriveAuthorized && !microsoftProblem} label={oneDriveAuthorized ? "OneDrive geconnecteerd" : "OneDrive niet geconnecteerd"} detail={microsoftProblem} /><OneDriveConnectLink authorized={oneDriveAuthorized} /></div>
        <div className="connection-row"><ConnectionStatus ok={!googleProblem} label={googleProblem ? "Google Drive service niet geconfigureerd" : "Google Drive service geconfigureerd"} detail={googleProblem} /></div>
      </div>
      {onedrive === "connected" ? <p className="success-message" role="status">OneDrive is verbonden.</p> : null}
      {onedrive === "authorization-failed" || onedrive === "connection-failed" ? <p className="form-message" role="alert">OneDrive verbinden is niet gelukt. Controleer de Microsoft-configuratie en probeer opnieuw.</p> : null}
    </section>
    <section className="admin-card learning-spaces-section" aria-labelledby="active-spaces-heading"><h2 id="active-spaces-heading">Actieve leeromgevingen</h2>{activeSpaces.length > 0 ? <SpaceList spaces={activeSpaces} /> : <p className="empty-state">Geen actieve leeromgevingen.</p>}</section>
    {archivedSpaces.length > 0 ? <section className="admin-card learning-spaces-section" aria-labelledby="archived-spaces-heading"><h2 id="archived-spaces-heading">Gearchiveerde leeromgevingen</h2><p>Instellingen en metadata blijven bewaard. Gearchiveerde leeromgevingen worden niet publiek getoond of gesynchroniseerd.</p><SpaceList spaces={archivedSpaces} /></section> : null}
    <section className="admin-card add-learning-space-section" aria-labelledby="add-space-heading"><div className="card-heading"><div><h2 id="add-space-heading">Leeromgeving toevoegen</h2><p>Maak een aparte leeromgeving met een eigen publieke URL en bronconfiguratie.</p></div></div><LearningSpaceCreateForm action={createLearningSpaceAction} /></section>
  </main>;
}

function ConnectionStatus({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) {
  return <div className={`connection-status ${ok ? "connection-ok" : "connection-problem"}`}>{ok ? <CheckCircle2 size={19} aria-hidden /> : <CircleAlert size={19} aria-hidden />}<div><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</div></div>;
}

function OneDriveConnectLink({ authorized }: { authorized: boolean }) {
  // OAuth initiation is a browser navigation because Microsoft is an external redirect target.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <a className="secondary-button link-button" href="/api/onedrive/connect">{authorized ? "OneDrive opnieuw verbinden" : "OneDrive verbinden"}</a>;
}

function SpaceList({ spaces }: { spaces: LearningSpace[] }) {
  return <div className="space-list">{spaces.map((space) => <div className="space-list-item" key={space.id}><div className="space-list-info"><strong>{space.name}</strong><span>/{space.slug}</span><ActiveSourceBadge space={space} /><SourceLine label="Bron" source={space.primarySource} fallback={space} />{space.mirrorSource ? <SourceLine label="Mirror" source={space.mirrorSource} /> : null}</div><LearningSpaceLifecycleActions space={space} /></div>)}</div>;
}

function SourceLine({ label, source, fallback }: { label: string; source: LearningSpaceSource | null; fallback?: LearningSpace }) {
  const provider = source?.providerType ?? fallback?.sourceType;
  if (!provider) return null;
  return <span><strong>{label}</strong> • {providerLabel(provider)}{source ? ` • ${sourceLabel(source)}` : ""}</span>;
}

function sourceLabel(source: LearningSpaceSource): string {
  if (source.providerType === "local") return source.localSourcePath || "Bronmap nog instellen";
  if (source.providerType === "google_drive") return source.googleDriveFolderLabel || "Map-ID ingesteld";
  return source.oneDriveFolderPath || "Drive- en map-ID ingesteld";
}

function providerLabel(provider: LearningSpace["sourceType"]): string {
  if (provider === "onedrive") return "OneDrive";
  if (provider === "google_drive") return "Google Drive";
  return "Lokale bestanden (test)";
}

function settingsErrorMessage(error: string): string {
  if (error === "archive-before-delete") return "Archiveer de leeromgeving eerst voordat je ze permanent verwijdert.";
  if (error === "delete-failed") return "De leeromgeving kon niet worden verwijderd. Vernieuw de pagina en probeer opnieuw.";
  if (error === "duplicate") return "Deze publieke slug bestaat al. Kies een andere slug.";
  return "De leeromgeving kon niet worden toegevoegd. Controleer de ingevulde gegevens.";
}
