"use client";

import { useActionState, useMemo, useState } from "react";

import { bulkExercisePublicationAction } from "@/app/admin/actions";
import { SubmitButton } from "@/app/components/submit-button";
import { bulkSelectionError } from "@/lib/admin-validation";

export interface BulkSection {
  id: string;
  title: string;
  order: number;
  exercises: Array<{ id: string; code: string; status: string; statusLabel: string; assets: number; hasAlternative: boolean; isIndexed: boolean }>;
}

export function ExerciseBulkTable({ portfolioId, sections }: { portfolioId: string; sections: BulkSection[] }) {
  const allIds = useMemo(() => sections.flatMap((section) => section.exercises.map((exercise) => exercise.id)), [sections]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [serverState, formAction] = useActionState(bulkExercisePublicationAction, { error: null });
  const [clientError, setClientError] = useState<string | null>(null);
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleGroup = (ids: string[]) => setSelected((current) => {
    const next = new Set(current);
    const everySelected = ids.every((id) => next.has(id));
    ids.forEach((id) => {
      if (everySelected) next.delete(id);
      else next.add(id);
    });
    return next;
  });

  return (
    <form action={formAction} className="bulk-exercise-form" onSubmit={(event) => {
      const error = bulkSelectionError(selected.size);
      if (error) { event.preventDefault(); setClientError(error); }
      else setClientError(null);
    }}>
      <input type="hidden" name="portfolioId" value={portfolioId} />
      {[...selected].map((id) => <input key={id} type="hidden" name="exerciseIds" value={id} />)}
      <div className="bulk-toolbar" aria-live="polite">
        <div><strong>{selected.size} geselecteerd</strong><span>Pas een status toe op de geselecteerde oefeningen.</span></div>
        <button type="button" className="secondary-button" onClick={() => setSelected(selected.size === allIds.length ? new Set() : new Set(allIds))}>{selected.size === allIds.length ? "Selectie wissen" : "Alles selecteren"}</button>
        <label>Status<select name="mode" defaultValue="inherit"><option value="inherit">Overnemen van portfolio</option><option value="visible">Zichtbaar</option><option value="hidden">Verborgen</option></select></label>
        <label>Vanaf<input name="publishFrom" type="datetime-local" /></label>
        <label>Tot<input name="publishUntil" type="datetime-local" /></label>
        <SubmitButton pendingLabel="Bijwerken...">Toepassen</SubmitButton>
      </div>
      {(clientError ?? serverState.error) && <p className="form-message" role="alert">{clientError ?? serverState.error}</p>}
      <div className="admin-summary-table" role="region" aria-label="Oefeningen beheren" tabIndex={0}>
        <table>
          <thead><tr><th aria-label="Selecteer" /><th>Oefening</th><th>Status</th><th>Varianten</th><th>Assets</th></tr></thead>
          <tbody>{sections.flatMap((section) => {
            const sectionIds = section.exercises.map((exercise) => exercise.id);
            const selectedSection = sectionIds.length > 0 && sectionIds.every((id) => selected.has(id));
            return [
              <tr className="section-table-row" key={`section-${section.id}`}><td><input aria-label={`Selecteer onderdeel ${section.title}`} type="checkbox" checked={selectedSection} onChange={() => toggleGroup(sectionIds)} /></td><th colSpan={4} scope="rowgroup">{section.order}. {section.title}</th></tr>,
              ...section.exercises.map((exercise) => <tr key={exercise.id} className={!exercise.isIndexed ? "missing-row" : undefined}>
                <td><input aria-label={`Selecteer oefening ${exercise.code}`} type="checkbox" checked={selected.has(exercise.id)} onChange={() => toggle(exercise.id)} /></td>
                <td>Oefening {exercise.code}{!exercise.isIndexed && <small>Bron ontbreekt</small>}</td><td><span className={`status-badge ${exercise.status}`}>{exercise.statusLabel}</span></td>
                <td>{exercise.hasAlternative ? "Standaard + alternatief" : "Standaard"}</td><td>{exercise.assets}</td>
              </tr>),
            ];
          })}</tbody>
        </table>
      </div>
    </form>
  );
}
