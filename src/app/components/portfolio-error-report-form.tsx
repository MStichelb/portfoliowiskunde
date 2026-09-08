"use client";

import { Bell, ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import type { ErrorReportDocumentKind } from "@/lib/repositories";

export interface PortfolioErrorReportExerciseOption {
  id: string;
  code: string;
  hasAlternativeSolution: boolean;
}

export function shouldShowErrorReportVariant(documentKind: ErrorReportDocumentKind, exercise: PortfolioErrorReportExerciseOption | undefined): boolean {
  return documentKind === "final_solutions" && Boolean(exercise?.hasAlternativeSolution);
}

export function PortfolioErrorReportForm({
  portfolioId,
  documents,
  exercises,
  initiallyOpen = false,
}: {
  portfolioId: string;
  documents: ErrorReportDocumentKind[];
  exercises: PortfolioErrorReportExerciseOption[];
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [documentKind, setDocumentKind] = useState<ErrorReportDocumentKind>(documents[0] ?? "assignment");
  const [exerciseId, setExerciseId] = useState(exercises[0]?.id ?? "");
  const contentId = useId();
  const selectedExercise = exercises.find((exercise) => exercise.id === exerciseId);
  const showVariant = shouldShowErrorReportVariant(documentKind, selectedExercise);

  if (documents.length === 0 || exercises.length === 0) return null;

  async function submit(formData: FormData) {
    setStatus("sending");
    try {
      const response = await fetch("/api/error-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          exerciseId,
          documentKind,
          variant: documentKind === "final_solutions" ? formData.get("variant") : null,
          message: formData.get("message"),
          website: formData.get("website"),
        }),
      });
      setStatus(response.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return <section className="report-disclosure">
    <h2 className="report-disclosure-heading"><button type="button" className="report-disclosure-trigger" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen((current) => !current)}><Bell size={20} aria-hidden /><span>Foutje gezien? Meld het.</span><ChevronDown className="report-disclosure-chevron" size={19} aria-hidden /></button></h2>
    {open ? <div id={contentId} className="report-disclosure-content">
      {status === "sent" ? <p className="success-message" role="status">Bedankt. Je melding is doorgestuurd.</p> : <form action={submit} className="report-form">
        <label>Document<select name="documentKind" value={documentKind} onChange={(event) => setDocumentKind(event.target.value as ErrorReportDocumentKind)}>{documents.map((document) => <option key={document} value={document}>{documentLabel(document)}</option>)}</select></label>
        <label>Oefening<select name="exerciseId" value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>Oefening {exercise.code}</option>)}</select></label>
        {showVariant ? <label>Uitwerking<select name="variant"><option value="standard">Uitwerking</option><option value="alternative">Alternatieve uitwerking</option></select></label> : <input type="hidden" name="variant" value={documentKind === "final_solutions" ? "standard" : ""} />}
        <label>Wat heb je opgemerkt?<textarea name="message" required minLength={3} maxLength={2000} /></label>
        <label className="honeypot">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <button className="secondary-button" disabled={status === "sending"}>{status === "sending" ? "Versturen..." : "Melding versturen"}</button>
        {status === "error" ? <p className="error-message" role="alert">De melding kon niet worden verstuurd. Probeer later opnieuw.</p> : null}
      </form>}
    </div> : null}
  </section>;
}

function documentLabel(document: ErrorReportDocumentKind): string {
  if (document === "assignment") return "Opgaven";
  if (document === "hints") return "Hints";
  return "Eindoplossingen";
}
