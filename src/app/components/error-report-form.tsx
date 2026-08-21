"use client";

import { Bell } from "lucide-react";
import { useState } from "react";

export function ErrorReportForm({ exerciseId, variants }: { exerciseId: string; variants: Array<"standard" | "alternative"> }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(formData: FormData) {
    setStatus("sending");
    const response = await fetch("/api/error-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId, variant: formData.get("variant"), message: formData.get("message"), website: formData.get("website") }),
    });
    setStatus(response.ok ? "sent" : "error");
  }

  if (status === "sent") return <p className="success-message" role="status">Bedankt. Je melding is doorgestuurd.</p>;
  return <form action={submit} className="report-form">
    <h2 className="heading-with-icon"><Bell size={20} aria-hidden />Foutje gezien? Meld het.</h2>
    <label>Wat heb je opgemerkt?<textarea name="message" required minLength={3} maxLength={2000} /></label>
    <label className="honeypot">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
    {variants.length > 1 ? <label>Uitwerking<select name="variant">{variants.map((variant) => <option key={variant} value={variant}>{variant === "standard" ? "Uitwerking" : "Alternatieve uitwerking"}</option>)}</select></label> : <input type="hidden" name="variant" value="standard" />}
    <button className="secondary-button" disabled={status === "sending"}>{status === "sending" ? "Versturen..." : "Melding versturen"}</button>
    {status === "error" ? <p className="error-message" role="alert">De melding kon niet worden verstuurd. Probeer later opnieuw.</p> : null}
  </form>;
}
