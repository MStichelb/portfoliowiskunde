"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import { ConfirmActionButton } from "./confirm-action-button";

interface ResettableClass { id: string; label: string; studentCount: number; }

export function StudentResetControls({ classes, totalStudents, resetClassAction, resetAllAction }: {
  classes: ResettableClass[];
  totalStudents: number;
  resetClassAction: (formData: FormData) => void | Promise<void>;
  resetAllAction: () => void | Promise<void>;
}) {
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id ?? "");
  const selectedClass = classes.find((item) => item.id === selectedClassId);
  return <div className="student-reset-toolbar" aria-label="Leerlingen verwijderen">
    <div><strong>Leerlingen verwijderen</strong><small>De leerling wordt bij een volgende Smartschool-login opnieuw geregistreerd.</small></div>
    <label>Klas<select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>{classes.length === 0 ? <option value="">Geen klassen met leerlingen</option> : null}{classes.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.studentCount})</option>)}</select></label>
    <ConfirmActionButton action={resetClassAction} fields={{ classGroupId: selectedClassId }} label={<><Trash2 size={16} aria-hidden />Klas verwijderen</>} className="secondary-button danger-outline-button" disabled={!selectedClass} confirmTitle="Leerlingen uit deze klas verwijderen?" confirmText={`${selectedClass?.studentCount ?? 0} leerlingen uit ${selectedClass?.label ?? "de geselecteerde klas"} worden intern verwijderd. Leraren en beheerders blijven onaangeraakt.`} />
    <ConfirmActionButton action={resetAllAction} label={<><Trash2 size={16} aria-hidden />Alle leerlingen verwijderen</>} className="secondary-button danger-outline-button" disabled={totalStudents === 0} confirmTitle="Alle leerlingen verwijderen?" confirmText={`${totalStudents} leerlingen worden intern verwijderd. Leraren en beheerders blijven onaangeraakt.`} />
  </div>;
}
