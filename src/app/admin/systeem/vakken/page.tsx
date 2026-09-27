import { Archive, ArrowLeft, CheckCircle2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import Link from "next/link";

import { ArchiveVisibilityToggle } from "@/app/components/archive-visibility-toggle";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { OrderControls } from "@/app/components/order-controls";
import { requireAdmin } from "@/lib/auth";
import { listSubjectsForManagement } from "@/lib/subjects";

import { archiveSubjectAction, createSubjectAction, moveSubjectAction, permanentlyDeleteSubjectAction, renameSubjectAction, restoreSubjectAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ archive?: string; saved?: string; error?: string }> }) {
  const user = await requireAdmin();
  const [subjects, params] = await Promise.all([listSubjectsForManagement(user), searchParams]);
  const activeSubjects = subjects.filter((subject) => subject.isActive);
  const archivedSubjects = subjects.filter((subject) => !subject.isActive);
  const showArchive = params.archive === "1";
  const visibleSubjects = showArchive ? archivedSubjects : activeSubjects;
  return <main className="page-shell admin-page subjects-page">
    <Link className="secondary-button compact-back-button" href="/admin/systeem"><ArrowLeft size={16} aria-hidden />Terug naar Systeem</Link>
    <header className="page-header"><p className="eyebrow">Systeem</p><h1>Vakken</h1><p>Beheer de appbrede vakken en hun volgorde. Gearchiveerde vakken blijven gekoppeld aan bestaande leeromgevingen.</p></header>
    {savedMessage(params.saved) ? <p className="success-message" role="status">{savedMessage(params.saved)}</p> : null}
    {params.error ? <p className="form-message" role="alert">{params.error}</p> : null}

    <section className="admin-card subject-create-card" aria-labelledby="subject-create-heading">
      <div className="card-heading"><div><h2 id="subject-create-heading">Vak toevoegen</h2><p>De interne identiteit wordt automatisch aangemaakt en blijft stabiel.</p></div></div>
      <form action={createSubjectAction} className="subject-create-form">
        <label>Naam<input name="name" required maxLength={80} /></label>
        <button className="primary-button" type="submit"><Plus size={17} aria-hidden />Vak toevoegen</button>
      </form>
    </section>

    <section aria-labelledby="subject-list-heading">
      <div className="card-heading subject-list-heading"><div><h2 id="subject-list-heading">Vakken</h2><p>Pas namen en de volgorde van actieve vakken aan.</p></div><ArchiveVisibilityToggle checked={showArchive} href={showArchive ? "/admin/systeem/vakken" : "/admin/systeem/vakken?archive=1"} /></div>
      <ul className="subject-list">
        {visibleSubjects.map((subject) => {
          const activeIndex = activeSubjects.findIndex((activeSubject) => activeSubject.id === subject.id);
          const usageMessage = subjectUsageMessage(subject.usageCount);
          return <li className={`admin-card subject-card${subject.isActive ? "" : " is-inactive"}`} key={subject.id}>
          <div className="subject-card-heading">
            <strong>{subject.name}</strong>
            <span className={`status-badge ${subject.isActive ? "published" : "hidden"}`}>{subject.isActive ? <CheckCircle2 size={15} aria-hidden /> : <Archive size={15} aria-hidden />}{subject.isActive ? "Actief" : "Gearchiveerd"}</span>
          </div>
          <div className="subject-card-actions">
            <form action={renameSubjectAction} className="subject-inline-form">
              <input name="subjectId" type="hidden" value={subject.id} />
              <label className="sr-only" htmlFor={`subject-name-${subject.id}`}>Naam van vak</label><input id={`subject-name-${subject.id}`} name="name" defaultValue={subject.name} required maxLength={80} />
              <button className="icon-button" type="submit" aria-label="Vaknaam opslaan" title="Vaknaam opslaan"><Save size={16} aria-hidden /></button>
            </form>
            {subject.isActive ? <><OrderControls action={moveSubjectAction} fields={{ subjectId: subject.id }} canMoveUp={activeIndex > 0} canMoveDown={activeIndex < activeSubjects.length - 1} itemLabel="Vak" /><form action={archiveSubjectAction}><input name="subjectId" type="hidden" value={subject.id} /><button className="icon-button" type="submit" aria-label="Vak archiveren" title="Vak archiveren"><Archive size={16} aria-hidden /></button></form></> : <><form action={restoreSubjectAction}><input name="subjectId" type="hidden" value={subject.id} /><button className="secondary-button restore-button" type="submit"><RotateCcw size={16} aria-hidden />Herstellen</button></form><ConfirmActionButton action={permanentlyDeleteSubjectAction} fields={{ subjectId: subject.id }} className="icon-button danger-icon-button" label={<Trash2 size={16} aria-hidden />} confirmTitle="Vak definitief verwijderen?" confirmText="Dit vak wordt definitief verwijderd. Deze actie kan niet ongedaan worden gemaakt." confirmLabel="Definitief verwijderen" disabled={subject.usageCount > 0} /></>}
          </div>
          {!subject.isActive && usageMessage ? <p className="subject-usage-reason">{usageMessage}</p> : null}
        </li>;
        })}
      </ul>
      {visibleSubjects.length === 0 ? <p className="empty-state">{showArchive ? "Er zijn geen gearchiveerde vakken." : "Er zijn momenteel geen actieve vakken."}</p> : null}
    </section>
  </main>;
}

function subjectUsageMessage(count: number): string | null {
  if (count === 0) return null;
  return `Dit vak wordt nog gebruikt door ${count} ${count === 1 ? "leeromgeving" : "leeromgevingen"}.`;
}

function savedMessage(value: string | undefined): string | null {
  if (value === "created") return "Vak toegevoegd.";
  if (value === "renamed") return "Vaknaam opgeslagen.";
  if (value === "moved") return "Volgorde aangepast.";
  if (value === "archived") return "Vak gearchiveerd.";
  if (value === "restored") return "Vak hersteld.";
  if (value === "deleted") return "Vak definitief verwijderd.";
  return null;
}
