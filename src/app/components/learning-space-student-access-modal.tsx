"use client";

import { Ban, Plus, Search, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { LearningSpaceIndividualStudent } from "@/lib/user-management";

interface StudentAccessModalProps {
  learningSpaceId: string;
  candidates: LearningSpaceIndividualStudent[];
  action: (formData: FormData) => void | Promise<void>;
  initialOpen?: boolean;
}

export function LearningSpaceStudentAccessModal({
  learningSpaceId,
  candidates,
  action,
  initialOpen = false,
}: StudentAccessModalProps) {
  const [open, setOpen] = useState(initialOpen);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const matchingCandidates = useMemo(() => filterStudentAccessCandidates(candidates, query), [candidates, query]);
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close, open]);

  return <>
    <button ref={triggerRef} className="secondary-button student-access-trigger" type="button" onClick={() => setOpen(true)}>
      <UserPlus size={17} aria-hidden />
      <span>Leerling toevoegen</span>
    </button>
    {open ? <div className="confirm-backdrop" role="presentation">
      <div className="student-access-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="student-access-dialog-heading">
          <h2 id={titleId}>Leerling toevoegen</h2>
          <button ref={closeRef} className="icon-button" type="button" onClick={close} aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></button>
        </div>
        <label className="student-access-search">
          <span className="sr-only">Zoeken op naam, voornaam of klas</span>
          <Search size={17} aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek op naam, voornaam of klas" autoComplete="off" />
        </label>
        <div className="student-access-candidates">
          <div className="student-access-candidate student-access-candidate-header" aria-hidden="true">
            <span></span><span>Naam</span><span>Voornaam</span><span>Klas</span>
          </div>
          {matchingCandidates.length ? matchingCandidates.map((student) => <div className="student-access-candidate" key={student.userId}>
            <form action={action}>
              <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
              <input type="hidden" name="userId" value={student.userId} />
              <button className="icon-button student-access-candidate-action" type="submit" disabled={student.status !== "active"} aria-label={student.status === "active" ? `${student.displayName} toevoegen` : `${student.displayName}: gebruiker uitgeschakeld`} title={student.status === "active" ? "Leerling toevoegen" : "Gebruiker uitgeschakeld"}>
                {student.status === "active" ? <Plus size={17} aria-hidden /> : <Ban size={17} aria-hidden />}
              </button>
            </form>
            <span>{student.lastName ?? student.displayName}</span>
            <span>{student.firstName ?? "-"}</span>
            <span>{student.className ?? "-"}</span>
          </div>) : <p className="empty-state compact-empty">Geen leerlingen gevonden.</p>}
        </div>
      </div>
    </div> : null}
  </>;
}

export function filterStudentAccessCandidates(
  candidates: LearningSpaceIndividualStudent[],
  query: string,
): LearningSpaceIndividualStudent[] {
  const needle = normalized(query);
  if (!needle) return candidates;
  return candidates.filter((student) => normalized([
    student.displayName,
    student.firstName,
    student.lastName,
    student.className,
  ].filter(Boolean).join(" ")).includes(needle));
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("nl");
}
