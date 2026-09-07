"use client";

import { ChevronDown, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { ConfirmActionButton } from "./confirm-action-button";

interface ResettableClass { id: string; label: string; studentCount: number; }

export function StudentResetControls({ classes, totalStudents, resetClassAction, resetAllAction, initiallyOpen = false }: {
  classes: ResettableClass[];
  totalStudents: number;
  resetClassAction: (formData: FormData) => void | Promise<void>;
  resetAllAction: () => void | Promise<void>;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id ?? "");
  const selectedClass = classes.find((item) => item.id === selectedClassId);
  const contentId = useId();
  return <section className={`student-reset-disclosure${open ? " is-open" : ""}`} aria-label="Leerlingen verwijderen">
    <button className="student-reset-disclosure-trigger" type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen((current) => !current)}>
      <span className="student-reset-disclosure-copy"><strong>Leerlingen verwijderen</strong><small>De leerling wordt bij een volgende Smartschool-login opnieuw geregistreerd.</small></span>
      <ChevronDown className="student-reset-disclosure-chevron" size={18} aria-hidden />
    </button>
    {open ? <div className="student-reset-toolbar" id={contentId}>
      <label>Te verwijderen klas<select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>{classes.length === 0 ? <option value="">Geen klassen met leerlingen</option> : null}{classes.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.studentCount})</option>)}</select></label>
      <ConfirmActionButton action={resetClassAction} fields={{ classGroupId: selectedClassId }} label={<><Trash2 size={16} aria-hidden />Klas verwijderen</>} className="secondary-button danger-outline-button" disabled={!selectedClass} confirmTitle="Leerlingen uit deze klas verwijderen?" confirmText={`${selectedClass?.studentCount ?? 0} leerlingen uit ${selectedClass?.label ?? "de geselecteerde klas"} worden intern verwijderd. Leraren en beheerders blijven onaangeraakt.`} />
      <ConfirmActionButton action={resetAllAction} label={<><Trash2 size={16} aria-hidden />Alle leerlingen verwijderen</>} className="secondary-button danger-outline-button" disabled={totalStudents === 0} confirmTitle="Alle leerlingen verwijderen?" confirmText={`${totalStudents} leerlingen worden intern verwijderd. Leraren en beheerders blijven onaangeraakt.`} />
    </div> : null}
  </section>;
}
