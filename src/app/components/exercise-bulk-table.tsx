"use client";
import { Eye, EyeOff, TriangleAlert } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { bulkExercisePublicationAction, toggleExerciseAlternativeVisibilityAction, toggleExerciseVisibilityAction } from "@/app/admin/actions";
import { SubmitButton } from "@/app/components/submit-button";
import { PublicationStatus } from "@/app/components/publication-status";
import { ExerciseNoteButton } from "@/app/components/exercise-note-button";
import { bulkSelectionError } from "@/lib/admin-validation";
import type { ExerciseNotePosition } from "@/lib/exercise-note";
import type { EffectivePublication } from "@/lib/publication";

export interface BulkSection { id: string; title: string; order: number; exercises: Array<{ id: string; code: string; configuredVisible: boolean; status: EffectivePublication; standardAssets: number; alternativeAssets: number; missingAssets: number; showAlternativeToStudents: boolean; isIndexed: boolean; customNote: string | null; notePosition: ExerciseNotePosition }>; }

export function sectionSelectionState(ids: string[], selected: Set<string>): { checked: boolean; indeterminate: boolean } {
  const selectedCount = ids.filter((id) => selected.has(id)).length;
  return { checked: ids.length > 0 && selectedCount === ids.length, indeterminate: selectedCount > 0 && selectedCount < ids.length };
}

export function toggleSectionSelection(selected: Set<string>, ids: string[]): Set<string> {
  const next = new Set(selected);
  const { checked } = sectionSelectionState(ids, selected);
  for (const id of ids) {
    if (checked) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function ExerciseBulkTable({ portfolioId, spaceSlug, sections }: { portfolioId: string; spaceSlug?: string; sections: BulkSection[] }) {
  const ids = useMemo(() => sections.flatMap((section) => section.exercises.map((exercise) => exercise.id)), [sections]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, action] = useActionState(bulkExercisePublicationAction, { error: null });
  const flip = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return <>
    <form action={action} onSubmit={(event) => { if (bulkSelectionError(selected.size)) event.preventDefault(); }} className="bulk-exercise-form">
      <input type="hidden" name="portfolioId" value={portfolioId} />
      {[...selected].map((id) => <input key={id} type="hidden" name="exerciseIds" value={id} />)}
      <div className="bulk-toolbar">
        <div><strong>{selected.size} geselecteerd</strong></div>
        <button className="secondary-button" type="button" onClick={() => setSelected(selected.size === ids.length ? new Set() : new Set(ids))}>Alles selecteren</button>
        <label>Status<select name="mode" defaultValue="visible"><option value="visible">Zichtbaar</option><option value="hidden">Verborgen</option></select></label>
        <SubmitButton>Toepassen</SubmitButton>
      </div>
      {state.error && <p className="form-message" role="alert">{state.error}</p>}
    </form>
    <div className="admin-summary-table" role="region" aria-label="Oefeningen per onderdeel" tabIndex={0}>
      <table>
        <thead><tr><th><span className="sr-only">Selecteren</span></th><th>Oefening</th><th>Eigen status</th><th>Notitie</th><th>Effectieve status</th><th>Alternatieve uitwerking tonen</th><th title="Uitwerking, alternatieve uitwerking">Aantal bestanden</th></tr></thead>
        <tbody>{sections.flatMap((section) => [
          <tr className="section-table-row" key={section.id}><td><SectionCheckbox section={section} selected={selected} onChange={() => setSelected((current) => toggleSectionSelection(current, section.exercises.map((exercise) => exercise.id)))} /></td><th colSpan={6}>{section.order}. {section.title}</th></tr>,
          ...section.exercises.map((exercise) => <tr key={exercise.id} id={`exercise-${exercise.id}`}>
            <td><input aria-label={`Oefening ${exercise.code} selecteren`} type="checkbox" checked={selected.has(exercise.id)} onChange={() => flip(exercise.id)} /></td>
            <td><a href={spaceSlug ? `/admin/${encodeURIComponent(spaceSlug)}/oefening/${encodeURIComponent(exercise.id)}` : `/admin/oefening/${encodeURIComponent(exercise.id)}`}>Oefening {exercise.code}</a>{!exercise.isIndexed ? <span className="missing-source" role="status"><TriangleAlert size={15} aria-hidden />Bron ontbreekt</span> : exercise.missingAssets > 0 ? <span className="missing-source" role="status"><TriangleAlert size={15} aria-hidden />Uitwerking onvolledig</span> : null}</td>
            <td><form action={toggleExerciseVisibilityAction}><input type="hidden" name="id" value={exercise.id} /><input type="hidden" name="portfolioId" value={portfolioId} /><input type="hidden" name="visible" value={String(!exercise.configuredVisible)} /><button className="visibility-toggle">{exercise.configuredVisible ? <Eye size={16} /> : <EyeOff size={16} />}{exercise.configuredVisible ? "Zichtbaar" : "Verborgen"}</button></form></td>
            <td><ExerciseNoteButton exerciseId={exercise.id} exerciseCode={exercise.code} customNote={exercise.customNote} notePosition={exercise.notePosition} /></td>
            <td><PublicationStatus status={exercise.status} /></td>
            <td>{exercise.alternativeAssets > 0 ? <form action={toggleExerciseAlternativeVisibilityAction} className="alternative-toggle"><input type="hidden" name="id" value={exercise.id} /><input type="hidden" name="portfolioId" value={portfolioId} /><input type="hidden" name="visible" value={String(!exercise.showAlternativeToStudents)} /><input aria-label={`Alternatieve uitwerking voor oefening ${exercise.code} tonen`} title="Alternatieve uitwerking voor leerlingen tonen" type="checkbox" checked={exercise.showAlternativeToStudents} onChange={(event) => event.currentTarget.form?.requestSubmit()} /></form> : "-"}</td>
            <td>{exercise.alternativeAssets > 0 ? `${exercise.standardAssets}, ${exercise.alternativeAssets}` : exercise.standardAssets}</td>
          </tr>),
        ])}</tbody>
      </table>
    </div>
  </>;
}

function SectionCheckbox({ section, selected, onChange }: { section: BulkSection; selected: Set<string>; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const state = sectionSelectionState(section.exercises.map((exercise) => exercise.id), selected);
  useEffect(() => { if (input.current) input.current.indeterminate = state.indeterminate; }, [state.indeterminate]);
  return <input ref={input} type="checkbox" checked={state.checked} disabled={section.exercises.length === 0} onChange={onChange} aria-label={`Alle oefeningen van ${section.order}. ${section.title} selecteren`} />;
}
