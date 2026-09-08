"use client";

import { Bell, ChevronDown } from "lucide-react";
import { useId, useState } from "react";

export const SOLUTION_ERROR_REPORT_DOCUMENT_KIND = "exercise_solution" as const;

export function ErrorReportForm({ exerciseId, variants, initiallyOpen = false }: { exerciseId: string; variants: Array<"standard" | "alternative">; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const contentId = useId();

  async function submit(formData: FormData) {
    setStatus("sending");
    const response = await fetch("/api/error-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId, documentKind: SOLUTION_ERROR_REPORT_DOCUMENT_KIND, variant: formData.get("variant"), message: formData.get("message"), website: formData.get("website") }),
    });
    setStatus(response.ok ? "sent" : "error");
  }

  return <section className="report-disclosure">
    <h2 className="report-disclosure-heading"><button type="button" className="report-disclosure-trigger" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen((current) => !current)}><Bell size={20} aria-hidden /><span>Foutje gezien? Meld het.</span><ChevronDown className="report-disclosure-chevron" size={19} aria-hidden /></button></h2>
    {open ? <div id={contentId} className="report-disclosure-content">
      {status === "sent" ? <p className="success-message" role="status">Bedankt. Je melding is doorgestuurd.</p> : <form action={submit} className="report-form">
        <label>Wat heb je opgemerkt?<textarea name="message" required minLength={3} maxLength={2000} /></label>
        <label className="honeypot">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        {variants.length > 1 ? <label>Uitwerking<select name="variant">{variants.map((variant) => <option key={variant} value={variant}>{variant === "standard" ? "Uitwerking" : "Alternatieve uitwerking"}</option>)}</select></label> : <input type="hidden" name="variant" value="standard" />}
        <button className="secondary-button" disabled={status === "sending"}>{status === "sending" ? "Versturen..." : "Melding versturen"}</button>
        {status === "error" ? <p className="error-message" role="alert">De melding kon niet worden verstuurd. Probeer later opnieuw.</p> : null}
      </form>}
    </div> : null}
  </section>;
}
