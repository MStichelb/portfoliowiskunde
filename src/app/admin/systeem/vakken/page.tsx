import { ArrowLeft, CheckCircle2, CircleOff, Plus } from "lucide-react";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { listSubjectsForManagement } from "@/lib/subjects";

import { createSubjectAction, renameSubjectAction, setSubjectActiveAction, updateSubjectSortOrderAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireAdmin();
  const [subjects, params] = await Promise.all([listSubjectsForManagement(user), searchParams]);
  return <main className="page-shell admin-page subjects-page">
    <Link className="secondary-button compact-back-button" href="/admin/systeem"><ArrowLeft size={16} aria-hidden />Terug naar Systeem</Link>
    <header className="page-header"><p className="eyebrow">Systeem</p><h1>Vakken</h1><p>Beheer de appbrede vakken en hun volgorde. Inactieve vakken blijven bewaard maar zijn niet beschikbaar voor nieuwe keuzes.</p></header>
    {savedMessage(params.saved) ? <p className="success-message" role="status">{savedMessage(params.saved)}</p> : null}
    {params.error ? <p className="form-message" role="alert">{params.error}</p> : null}

    <section className="admin-card subject-create-card" aria-labelledby="subject-create-heading">
      <div className="card-heading"><div><h2 id="subject-create-heading">Vak toevoegen</h2><p>De interne identiteit wordt automatisch aangemaakt en blijft stabiel.</p></div></div>
      <form action={createSubjectAction} className="subject-create-form">
        <label>Naam<input name="name" required maxLength={80} /></label>
        <label>Sortering<input name="sortOrder" type="number" min={0} step={1} defaultValue={nextSortOrder(subjects.map((subject) => subject.sortOrder))} required /></label>
        <button className="primary-button" type="submit"><Plus size={17} aria-hidden />Vak toevoegen</button>
      </form>
    </section>

    <section aria-labelledby="subject-list-heading">
      <div className="card-heading subject-list-heading"><div><h2 id="subject-list-heading">Alle vakken</h2><p>Actieve en inactieve vakken blijven zichtbaar voor hoofdbeheerders.</p></div></div>
      <ul className="subject-list">
        {subjects.map((subject) => <li className={`admin-card subject-card${subject.isActive ? "" : " is-inactive"}`} key={subject.id}>
          <div className="subject-card-heading">
            <strong>{subject.name}</strong>
            <span className={`status-badge ${subject.isActive ? "published" : "hidden"}`}>{subject.isActive ? <CheckCircle2 size={15} aria-hidden /> : <CircleOff size={15} aria-hidden />}{subject.isActive ? "Actief" : "Inactief"}</span>
          </div>
          <div className="subject-card-actions">
            <form action={renameSubjectAction} className="subject-inline-form">
              <input name="subjectId" type="hidden" value={subject.id} />
              <label>Naam<input name="name" defaultValue={subject.name} required maxLength={80} /></label>
              <button className="secondary-button" type="submit">Naam opslaan</button>
            </form>
            <form action={updateSubjectSortOrderAction} className="subject-inline-form subject-order-form">
              <input name="subjectId" type="hidden" value={subject.id} />
              <label>Sortering<input name="sortOrder" type="number" min={0} step={1} defaultValue={subject.sortOrder} required /></label>
              <button className="secondary-button" type="submit">Volgorde opslaan</button>
            </form>
            <form action={setSubjectActiveAction}>
              <input name="subjectId" type="hidden" value={subject.id} />
              <input name="active" type="hidden" value={subject.isActive ? "false" : "true"} />
              <button className="secondary-button" type="submit">{subject.isActive ? "Deactiveren" : "Activeren"}</button>
            </form>
          </div>
        </li>)}
      </ul>
    </section>
  </main>;
}

function nextSortOrder(values: number[]): number {
  return values.length === 0 ? 10 : Math.max(...values) + 10;
}

function savedMessage(value: string | undefined): string | null {
  if (value === "created") return "Vak toegevoegd.";
  if (value === "renamed") return "Vaknaam opgeslagen.";
  if (value === "sorted") return "Sortering opgeslagen.";
  if (value === "activated") return "Vak geactiveerd.";
  if (value === "deactivated") return "Vak gedeactiveerd.";
  return null;
}
