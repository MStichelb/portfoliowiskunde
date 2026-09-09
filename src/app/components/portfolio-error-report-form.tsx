"use client";

import { Bell, ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { normalizeErrorReportExerciseCode, type ErrorReportExerciseIdentity } from "@/lib/error-report-exercise-code";
import { ERROR_REPORT_GENERIC_ERROR_MESSAGE, errorReportSubmissionErrorMessage } from "@/lib/error-report-submission-feedback";
import type { ErrorReportDocumentKind } from "@/lib/repositories";

export type PortfolioErrorReportExerciseOption = ErrorReportExerciseIdentity;

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
  const [errorMessage, setErrorMessage] = useState(ERROR_REPORT_GENERIC_ERROR_MESSAGE);
  const [documentKind, setDocumentKind] = useState<ErrorReportDocumentKind>(documents[0] ?? "assignment");
  const [exerciseCode, setExerciseCode] = useState(exercises[0]?.code ?? "");
  const contentId = useId();
  const exerciseListId = useId();
  const normalizedExerciseCode = normalizeErrorReportExerciseCode(exerciseCode);
  const selectedExercise = exercises.find((exercise) => normalizeErrorReportExerciseCode(exercise.code) === normalizedExerciseCode);
  const showVariant = shouldShowErrorReportVariant(documentKind, selectedExercise);

  if (documents.length === 0) return null;

  async function submit(formData: FormData) {
    setStatus("sending");
    try {
      const response = await fetch("/api/error-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          exerciseCode,
          documentKind,
          variant: documentKind === "final_solutions" ? formData.get("variant") : null,
          message: formData.get("message"),
          website: formData.get("website"),
        }),
      });
      if (response.ok) setStatus("sent");
      else {
        setErrorMessage(await errorReportSubmissionErrorMessage(response));
        setStatus("error");
      }
    } catch {
      setErrorMessage(ERROR_REPORT_GENERIC_ERROR_MESSAGE);
      setStatus("error");
    }
  }

  return <section className="report-disclosure">
    <h2 className="report-disclosure-heading"><button type="button" className="report-disclosure-trigger" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen((current) => !current)}><Bell size={20} aria-hidden /><span>Foutje gezien? Meld het.</span><ChevronDown className="report-disclosure-chevron" size={19} aria-hidden /></button></h2>
    {open ? <div id={contentId} className="report-disclosure-content">
      {status === "sent" ? <p className="success-message" role="status">Bedankt. Je melding is doorgestuurd.</p> : <form action={submit} className="report-form">
        <label>Document<select name="documentKind" value={documentKind} onChange={(event) => setDocumentKind(event.target.value as ErrorReportDocumentKind)}>{documents.map((document) => <option key={document} value={document}>{documentLabel(document)}</option>)}</select></label>
        <label>Oefening<input name="exerciseCode" value={exerciseCode} onChange={(event) => setExerciseCode(event.target.value)} list={exerciseListId} required maxLength={20} autoComplete="off" /></label>
        <datalist id={exerciseListId}>{exercises.map((exercise) => <option key={exercise.id} value={exercise.code}>Oefening {exercise.code}</option>)}</datalist>
        {showVariant ? <label>Uitwerking<select name="variant"><option value="standard">Uitwerking</option><option value="alternative">Alternatieve uitwerking</option></select></label> : <input type="hidden" name="variant" value={documentKind === "final_solutions" ? "standard" : ""} />}
        <label>Wat heb je opgemerkt?<textarea name="message" required minLength={3} maxLength={2000} /></label>
        <label className="honeypot">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <button className="secondary-button" disabled={status === "sending"}>{status === "sending" ? "Versturen..." : "Melding versturen"}</button>
        {status === "error" ? <p className="error-message" role="alert">{errorMessage}</p> : null}
      </form>}
    </div> : null}
  </section>;
}

function documentLabel(document: ErrorReportDocumentKind): string {
  if (document === "assignment") return "Opgaven";
  if (document === "hints") return "Hints";
  return "Eindoplossingen";
}
