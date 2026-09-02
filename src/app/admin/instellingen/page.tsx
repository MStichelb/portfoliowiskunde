import { CheckCircle2, CircleAlert, CircleHelp } from "lucide-react";
import Link from "next/link";

import { EmergencyAccessControl } from "@/app/components/emergency-access-control";
import { LearningSpaceSourceSummary } from "@/app/components/active-source-badge";
import { LearningSpaceCreateForm } from "@/app/components/learning-space-create-form";
import { LearningSpaceLifecycleActions } from "@/app/components/learning-space-lifecycle-actions";
import { OneDriveConnectLink } from "@/app/components/onedrive-connect-link";
import { requireAdmin } from "@/lib/auth";
import { getGoogleServiceAccountConfigurationProblem } from "@/lib/google-service-account-config";
import { getMicrosoftConfigurationProblem, hasOneDriveAuthorization } from "@/lib/onedrive";
import { getPublicEmergencyAccess } from "@/lib/public-access";
import { getLearningSpaces, type LearningSpace } from "@/lib/repositories";

import { createLearningSpaceAction } from "../actions";
import { setPublicEmergencyAccessAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; onedrive?: string; emergency?: string }> }) {
  await requireAdmin();
  const [{ error, onedrive, emergency }, spaces, oneDriveAuthorized, emergencyAccess] = await Promise.all([searchParams, getLearningSpaces(), hasOneDriveAuthorization(), getPublicEmergencyAccess()]);
  const microsoftProblem = getMicrosoftConfigurationProblem();
  const googleProblem = getGoogleServiceAccountConfigurationProblem();
  const activeSpaces = spaces.filter((space) => space.isActive);
  const archivedSpaces = spaces.filter((space) => !space.isActive);

  return <main className="page-shell admin-page learning-spaces-page">
    <header className="page-header"><p className="eyebrow">Beheer</p><h1>Leeromgevingen</h1><p>Leeromgevingen vormen een slimme laag op een OneDrive-map of een Google Drive-map waarin portfolio&apos;s worden verzameld. Bronbestanden worden enkel gelezen, niet bewerkt.</p></header>
    {error ? <p className="form-message" role="alert">{settingsErrorMessage(error)}</p> : null}
    {emergency ? <p className="success-message" role="status">Publieke noodtoegang is {emergency === "enabled" ? "ingeschakeld" : "uitgeschakeld"}.</p> : null}
    <section className="admin-card" aria-labelledby="emergency-access-heading"><div className="card-heading"><div><h2 id="emergency-access-heading">Toegang bij Smartschoolstoring</h2><p>Deze uitzondering geldt alleen voor publieke leerlinginhoud. Beheer blijft altijd aangemeld.</p></div></div><EmergencyAccessControl state={emergencyAccess} action={setPublicEmergencyAccessAction} /></section>
    <section className="admin-card connections-card" aria-labelledby="connections-heading">
      <div className="card-heading"><div><h2 id="connections-heading">Verbindingen</h2><p>App-brede toegang voor cloudbronnen.</p></div><Link className="secondary-button link-button connection-action" href="/admin/help/bronnen"><CircleHelp size={17} aria-hidden />Hulp bij bronnen</Link></div>
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

function SpaceList({ spaces }: { spaces: LearningSpace[] }) {
  return <div className="space-list">{spaces.map((space) => <div className="space-list-item" key={space.id}><div className="space-list-info"><strong>{space.name}</strong><span>/{space.slug}</span><LearningSpaceSourceSummary space={space} /></div><LearningSpaceLifecycleActions space={space} /></div>)}</div>;
}

function settingsErrorMessage(error: string): string {
  if (error === "archive-before-delete") return "Archiveer de leeromgeving eerst voordat je ze permanent verwijdert.";
  if (error === "delete-failed") return "De leeromgeving kon niet worden verwijderd. Vernieuw de pagina en probeer opnieuw.";
  if (error === "duplicate") return "Deze publieke slug bestaat al. Kies een andere slug.";
  return "De leeromgeving kon niet worden toegevoegd. Controleer de ingevulde gegevens.";
}
