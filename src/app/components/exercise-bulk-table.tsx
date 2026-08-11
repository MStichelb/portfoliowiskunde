"use client";

import { useMemo, useState } from "react";

import { bulkExercisePublicationAction } from "@/app/admin/actions";
import { SubmitButton } from "@/app/components/submit-button";

export interface BulkSection {
  id: string;
  title: string;
  order: number;
  exercises: Array<{ id: string; code: string; status: string; assets: number; hasAlternative: boolean; isIndexed: boolean }>;
}

export function ExerciseBulkTable({ portfolioId, sections }: { portfolioId: string; sections: BulkSection[] }) {
  const allIds = useMemo(() => sections.flatMap((section) => section.exercises.map((exercise) => exercise.id)), [sections]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleGroup = (ids: string[]) => setSelected((current) => {
    const next = new Set(current);
    const everySelected = ids.every((id) => next.has(id));
    ids.forEach((id) => everySelected ? next.delete(id) : next.add(id));
    return next;
  });

  return (
    <form action={bulkExercisePublicationAction} className="bulk-exercise-form">
      <input type="hidden" name="portfolioId" value={portfolioId} />
      {[...selected].map((id) => <input key={id} type="hidden" name="exerciseIds" value={id} />)}
      <div className="bulk-toolbar" aria-live="polite">
        <span>{selected.size} geselecteerd</span>
        <button type="button" className="text-button" onClick={() => setSelected(selected.size === allIds.length ? new Set() : new Set(allIds))}>{selected.size === allIds.length ? "Selectie wissen" : "Alles selecteren"}</button>
        <label>Publicatie<select name="mode" defaultValue="visible"><option value="visible">Zichtbaar</option><option value="hidden">Verborgen</option><option value="inherit">Overnemen</option></select></label>
        <label>Vanaf<input name="publishFrom" type="datetime-local" /></label>
        <label>Tot<input name="publishUntil" type="datetime-local" /></label>
        <SubmitButton pendingLabel="Bijwerken...">Toepassen</SubmitButton>
      </div>
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
                <td>Oefening {exercise.code}{!exercise.isIndexed && <small>Bron ontbreekt</small>}</td><td><span className={`status-badge ${exercise.status}`}>{exercise.status}</span></td>
                <td>{exercise.hasAlternative ? "Standaard + alternatief" : "Standaard"}</td><td>{exercise.assets}</td>
              </tr>),
            ];
          })}</tbody>
        </table>
      </div>
    </form>
  );
}
