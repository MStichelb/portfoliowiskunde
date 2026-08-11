"use client";

import { Eye, EyeOff, Hourglass, Link2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { bulkExercisePublicationAction, toggleExerciseVisibilityAction } from "@/app/admin/actions";
import { SubmitButton } from "@/app/components/submit-button";
import { bulkSelectionError } from "@/lib/admin-validation";
import type { EffectivePublicationReason, EffectivePublicationState } from "@/lib/publication";

export interface BulkSection {
  id: string;
  title: string;
  order: number;
  exercises: Array<{ id: string; code: string; configuredVisible: boolean; effectiveState: EffectivePublicationState; effectiveReason: EffectivePublicationReason; assets: number; hasAlternative: boolean; isIndexed: boolean }>;
}

export function ExerciseBulkTable({ portfolioId, sections }: { portfolioId: string; sections: BulkSection[] }) {
  const allIds = useMemo(() => sections.flatMap((section) => section.exercises.map((exercise) => exercise.id)), [sections]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [serverState, formAction] = useActionState(bulkExercisePublicationAction, { error: null });
  const [clientError, setClientError] = useState<string | null>(null);
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleGroup = (ids: string[]) => setSelected((current) => { const next = new Set(current); const everySelected = ids.every((id) => next.has(id)); ids.forEach((id) => everySelected ? next.delete(id) : next.add(id)); return next; });

  return <>
    <form id="bulk-exercise-actions" action={formAction} className="bulk-exercise-form" onSubmit={(event) => { const error = bulkSelectionError(selected.size); if (error) { event.preventDefault(); setClientError(error); } else setClientError(null); }}>
      <input type="hidden" name="portfolioId" value={portfolioId} />
      {[...selected].map((id) => <input key={id} type="hidden" name="exerciseIds" value={id} />)}
      <div className="bulk-toolbar" aria-live="polite"><div><strong>{selected.size} geselecteerd</strong><span>Pas een status toe op de geselecteerde oefeningen.</span></div><button type="button" className="secondary-button" onClick={() => setSelected(selected.size === allIds.length ? new Set() : new Set(allIds))}>{selected.size === allIds.length ? "Selectie wissen" : "Alles selecteren"}</button><label>Status<select name="mode" defaultValue="visible"><option value="visible">Zichtbaar</option><option value="hidden">Verborgen</option></select></label><SubmitButton pendingLabel="Bijwerken...">Toepassen</SubmitButton></div>
      {(clientError ?? serverState.error) && <p className="form-message" role="alert">{clientError ?? serverState.error}</p>}
    </form>
    <div className="admin-summary-table" role="region" aria-label="Oefeningen beheren" tabIndex={0}><table><thead><tr><th aria-label="Selecteer" /><th>Oefening</th><th>Eigen status</th><th>Effectieve status</th><th>Varianten</th><th>Assets</th></tr></thead><tbody>{sections.flatMap((section) => {
      const sectionIds = section.exercises.map((exercise) => exercise.id);
      const selectedSection = sectionIds.length > 0 && sectionIds.every((id) => selected.has(id));
      return [<tr className="section-table-row" key={`section-${section.id}`}><td><input aria-label={`Selecteer onderdeel ${section.title}`} type="checkbox" checked={selectedSection} onChange={() => toggleGroup(sectionIds)} /></td><th colSpan={5} scope="rowgroup">{section.order}. {section.title}</th></tr>, ...section.exercises.map((exercise) => <tr id={`exercise-${exercise.id}`} key={exercise.id} className={!exercise.isIndexed ? "missing-row" : undefined}><td><input aria-label={`Selecteer oefening ${exercise.code}`} type="checkbox" checked={selected.has(exercise.id)} onChange={() => toggle(exercise.id)} /></td><td><a className="exercise-admin-link" href={`/oefening/${encodeURIComponent(exercise.id)}`}>Oefening {exercise.code}</a>{!exercise.isIndexed && <small>Bron ontbreekt</small>}</td><td><form action={toggleExerciseVisibilityAction}><input type="hidden" name="id" value={exercise.id} /><input type="hidden" name="portfolioId" value={portfolioId} /><input type="hidden" name="visible" value={String(!exercise.configuredVisible)} /><button className="visibility-toggle" title={exercise.configuredVisible ? "Oefening verbergen" : "Oefening zichtbaar maken"} aria-label={exercise.configuredVisible ? "Oefening verbergen" : "Oefening zichtbaar maken"}>{exercise.configuredVisible ? <Eye size={16} aria-hidden /> : <EyeOff size={16} aria-hidden />}{exercise.configuredVisible ? "Zichtbaar" : "Verborgen"}</button></form></td><td><EffectiveStatus state={exercise.effectiveState} reason={exercise.effectiveReason} /></td><td>{exercise.hasAlternative ? "Standaard + alternatief" : "Standaard"}</td><td>{exercise.assets}</td></tr>)];
    })}</tbody></table></div>
  </>;
}

function EffectiveStatus({ state, reason }: { state: EffectivePublicationState; reason: EffectivePublicationReason }) {
  if (state === "visible") return <span className="status-badge published"><Eye size={15} aria-hidden />Zichtbaar</span>;
  if (state === "hidden") return <span className="status-badge hidden" title={reason === "expired" ? "Publicatieperiode is afgelopen" : "Expliciet verborgen"}><EyeOff size={15} aria-hidden />Verborgen</span>;
  return <span className="status-badge pending" title={reason === "scheduled" ? "Wacht op publicatietijdstip" : "Wacht op bovenliggend niveau"}>{reason === "scheduled" ? <Hourglass size={15} aria-hidden /> : <Link2 size={15} aria-hidden />}Wordt zichtbaar</span>;
}
