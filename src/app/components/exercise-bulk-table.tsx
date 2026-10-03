"use client";
import { TriangleAlert } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { bulkExercisePublicationAction } from "@/app/admin/actions";
import { ExerciseAdminControls, type ExerciseAdminControlData } from "@/app/components/exercise-admin-controls";
import { SubmitButton } from "@/app/components/submit-button";
import { bulkSelectionError } from "@/lib/admin-validation";
import { DEFAULT_EXERCISE_LABEL_PLURAL, DEFAULT_EXERCISE_LABEL_SINGULAR, formatTerminologyLabel } from "@/lib/collection-terminology";
import type { ExerciseLevelPresentation } from "@/lib/exercise-level-presentation";

export interface BulkSection { id: string; title: string; order: number; exercises: Array<ExerciseAdminControlData & { missingAssets: number; isIndexed: boolean }>; }

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

export function ExerciseBulkTable({ portfolioId, learningSpaceId, levelPresentation, spaceSlug, sections, exerciseLabelSingular = DEFAULT_EXERCISE_LABEL_SINGULAR, exerciseLabelPlural = DEFAULT_EXERCISE_LABEL_PLURAL }: { portfolioId: string; learningSpaceId: string; levelPresentation?: ExerciseLevelPresentation; spaceSlug?: string; sections: BulkSection[]; exerciseLabelSingular?: string; exerciseLabelPlural?: string }) {
  const ids = useMemo(() => sections.flatMap((section) => section.exercises.map((exercise) => exercise.id)), [sections]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, action] = useActionState(bulkExercisePublicationAction, { error: null });
  const singular = formatTerminologyLabel(exerciseLabelSingular, "standalone");
  const plural = formatTerminologyLabel(exerciseLabelPlural, "standalone");
  const pluralInline = formatTerminologyLabel(exerciseLabelPlural, "inline");
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
    <div className="admin-summary-table" role="region" aria-label={`${plural} per onderdeel`} tabIndex={0}>
      <table>
        <thead><tr><th><span className="sr-only">Selecteren</span></th><th>{singular}</th><th>Niveau</th><th>Notitie</th><th>Eigen status</th><th>Effectieve status</th><th>Alternatieve uitwerking tonen</th><th title="Uitwerking, alternatieve uitwerking">Aantal bestanden</th></tr></thead>
        <tbody>{sections.flatMap((section) => [
          <tr className="section-table-row" key={section.id}><td><SectionCheckbox section={section} selected={selected} exerciseLabelPlural={pluralInline} onChange={() => setSelected((current) => toggleSectionSelection(current, section.exercises.map((exercise) => exercise.id)))} /></td><th colSpan={7}>{section.order}. {section.title}</th></tr>,
          ...section.exercises.map((exercise) => <tr key={exercise.id} id={`exercise-${exercise.id}`}>
            <td><input aria-label={`${singular} ${exercise.code} selecteren`} type="checkbox" checked={selected.has(exercise.id)} onChange={() => flip(exercise.id)} /></td>
            <td><a href={spaceSlug ? `/admin/${encodeURIComponent(spaceSlug)}/oefening/${encodeURIComponent(exercise.id)}` : `/admin/oefening/${encodeURIComponent(exercise.id)}`}>{singular} {exercise.code}</a>{!exercise.isIndexed ? <span className="missing-source" role="status"><TriangleAlert size={15} aria-hidden />Bron ontbreekt</span> : exercise.missingAssets > 0 ? <span className="missing-source" role="status"><TriangleAlert size={15} aria-hidden />Uitwerking onvolledig</span> : null}</td>
            <ExerciseAdminControls exercise={exercise} portfolioId={portfolioId} learningSpaceId={learningSpaceId} levelPresentation={levelPresentation} exerciseLabelSingular={exerciseLabelSingular} />
          </tr>),
        ])}</tbody>
      </table>
    </div>
  </>;
}

function SectionCheckbox({ section, selected, exerciseLabelPlural, onChange }: { section: BulkSection; selected: Set<string>; exerciseLabelPlural: string; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const state = sectionSelectionState(section.exercises.map((exercise) => exercise.id), selected);
  useEffect(() => { if (input.current) input.current.indeterminate = state.indeterminate; }, [state.indeterminate]);
  return <input ref={input} type="checkbox" checked={state.checked} disabled={section.exercises.length === 0} onChange={onChange} aria-label={`Alle ${exerciseLabelPlural} van ${section.order}. ${section.title} selecteren`} />;
}
