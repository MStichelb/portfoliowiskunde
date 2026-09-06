import { LearningSpaceSourceSummary } from "@/app/components/active-source-badge";
import { LearningSpaceCreateForm } from "@/app/components/learning-space-create-form";
import { LearningSpaceLifecycleActions } from "@/app/components/learning-space-lifecycle-actions";
import { requireAdmin } from "@/lib/auth";
import { getLearningSpaces, type LearningSpace } from "@/lib/repositories";

import { createLearningSpaceAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const [{ error }, spaces] = await Promise.all([searchParams, getLearningSpaces()]);
  const activeSpaces = spaces.filter((space) => space.isActive);
  const archivedSpaces = spaces.filter((space) => !space.isActive);

  return <main className="page-shell admin-page learning-spaces-page">
    <header className="page-header"><p className="eyebrow">Beheer</p><h1>Leeromgevingen</h1><p>Leeromgevingen vormen een slimme laag op een OneDrive-map of een Google Drive-map waarin portfolio&apos;s worden verzameld. Bronbestanden worden enkel gelezen, niet bewerkt.</p></header>
    {error ? <p className="form-message" role="alert">{settingsErrorMessage(error)}</p> : null}
    <section className="admin-card learning-spaces-section" aria-labelledby="active-spaces-heading"><h2 id="active-spaces-heading">Actieve leeromgevingen</h2>{activeSpaces.length > 0 ? <SpaceList spaces={activeSpaces} /> : <p className="empty-state">Geen actieve leeromgevingen.</p>}</section>
    {archivedSpaces.length > 0 ? <section className="admin-card learning-spaces-section" aria-labelledby="archived-spaces-heading"><h2 id="archived-spaces-heading">Gearchiveerde leeromgevingen</h2><p>Instellingen en metadata blijven bewaard. Gearchiveerde leeromgevingen worden niet publiek getoond of gesynchroniseerd.</p><SpaceList spaces={archivedSpaces} /></section> : null}
    <section className="admin-card add-learning-space-section" aria-labelledby="add-space-heading"><div className="card-heading"><div><h2 id="add-space-heading">Leeromgeving toevoegen</h2><p>Maak een aparte leeromgeving met een eigen webadres en bronconfiguratie.</p></div></div><LearningSpaceCreateForm action={createLearningSpaceAction} /></section>
  </main>;
}

function SpaceList({ spaces }: { spaces: LearningSpace[] }) {
  return <div className="space-list">{spaces.map((space) => <div className="space-list-item" key={space.id}><div className="space-list-info"><strong>{space.name}</strong><span>/{space.slug}</span><LearningSpaceSourceSummary space={space} /></div><LearningSpaceLifecycleActions space={space} /></div>)}</div>;
}

function settingsErrorMessage(error: string): string {
  if (error === "archive-before-delete") return "Archiveer de leeromgeving eerst voordat je ze permanent verwijdert.";
  if (error === "delete-failed") return "De leeromgeving kon niet worden verwijderd. Vernieuw de pagina en probeer opnieuw.";
  if (error === "duplicate") return "Deze URL bestaat al. Kies een andere URL.";
  return "De leeromgeving kon niet worden toegevoegd. Controleer de ingevulde gegevens.";
}
