import Link from "next/link";

import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { LearningSpaceCreateForm } from "@/app/components/learning-space-create-form";
import { requireAdmin } from "@/lib/auth";
import { getGoogleServiceAccountConfigurationProblem } from "@/lib/google-service-account-config";
import { getMicrosoftConfigurationProblem, hasOneDriveAuthorization } from "@/lib/onedrive";
import { getLearningSpaces, type LearningSpace } from "@/lib/repositories";

import { archiveLearningSpaceAction, createLearningSpaceAction, permanentlyDeleteLearningSpaceAction, restoreLearningSpaceAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ onedrive?: string }> }) {
  await requireAdmin();
  const [{ onedrive }, spaces, oneDriveAuthorized] = await Promise.all([searchParams, getLearningSpaces(), hasOneDriveAuthorization()]);
  const microsoftProblem = getMicrosoftConfigurationProblem();
  const googleProblem = getGoogleServiceAccountConfigurationProblem();
  const activeSpaces = spaces.filter((space) => space.isActive);
  const archivedSpaces = spaces.filter((space) => !space.isActive);

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
    <section className="settings-section" aria-labelledby="active-spaces-heading">
      <h2 id="active-spaces-heading">Actieve leeromgevingen</h2>
      {activeSpaces.length > 0 ? <SpaceList spaces={activeSpaces} /> : <p className="empty-state">Geen actieve leeromgevingen.</p>}
    </section>
    {archivedSpaces.length > 0 ? <section className="settings-section" aria-labelledby="archived-spaces-heading">
      <h2 id="archived-spaces-heading">Gearchiveerde leeromgevingen</h2>
      <p>Instellingen en metadata blijven bewaard. Gearchiveerde leeromgevingen worden niet publiek getoond of gesynchroniseerd.</p>
      <SpaceList spaces={archivedSpaces} />
    </section> : null}
    <section className="settings-section">
      <h2>Leeromgeving toevoegen</h2>
      <LearningSpaceCreateForm action={createLearningSpaceAction} />
    </section>
  </main>;
}

function SpaceList({ spaces }: { spaces: LearningSpace[] }) {
  return <div className="space-list">{spaces.map((space) => <div className="space-list-item" key={space.id}>
    <div><strong>{space.name}</strong><span>/{space.slug} - {sourceLabel(space)}</span></div>
    <div className="space-list-actions">
      <Link className="secondary-button link-button" href={`/admin/${encodeURIComponent(space.slug)}/instellingen`}>Beheren</Link>
      {space.isActive
        ? <form action={archiveLearningSpaceAction}><input type="hidden" name="id" value={space.id} /><button className="secondary-button" type="submit">Archiveren</button></form>
        : <form action={restoreLearningSpaceAction}><input type="hidden" name="id" value={space.id} /><button className="primary-button" type="submit">Herstellen</button></form>}
      <ConfirmActionButton action={permanentlyDeleteLearningSpaceAction} fields={{ id: space.id, confirmationSlug: space.slug }} className="danger-button" label="Permanent verwijderen" confirmTitle={`Leeromgeving "${space.slug}" permanent verwijderen?`} confirmText={`Alle instellingen en geïndexeerde metadata van leeromgeving "${space.slug}" worden verwijderd. Bronbestanden worden niet verwijderd.`} />
    </div>
  </div>)}</div>;
}

function sourceLabel(space: LearningSpace): string {
  if (space.sourceType === "local") return space.localSourcePath || "Bronmap nog instellen";
  if (space.sourceType === "google_drive") return space.googleDriveFolderLabel || "Google Drive";
  return "OneDrive";
}
