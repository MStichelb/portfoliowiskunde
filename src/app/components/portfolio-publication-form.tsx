"use client";

import { useState } from "react";

import { SubmitButton } from "@/app/components/submit-button";

export function PortfolioPublicationForm({ id, title, visible, limited, publishFrom, publishUntil, action }: { id: string; title: string; visible: boolean; limited: boolean; publishFrom: string; publishUntil: string; action: (formData: FormData) => void | Promise<void> }) {
  const [mode, setMode] = useState<"visible" | "limited" | "hidden">(!visible ? "hidden" : limited ? "limited" : "visible");
  return <form action={action} className="portfolio-settings-form"><input type="hidden" name="id" value={id} /><input type="hidden" name="mode" value={mode === "hidden" ? "hidden" : "visible"} /><input type="hidden" name="publicationMode" value={mode} /><label className="field-wide">Titel<input name="title" defaultValue={title} maxLength={180} /></label><fieldset className="segmented-control field-wide"><legend>Publicatie</legend><div><button type="button" className={mode === "visible" ? "selected" : ""} onClick={() => setMode("visible")}>Zichtbaar</button><button type="button" className={mode === "limited" ? "selected" : ""} onClick={() => setMode("limited")}>Beperkt zichtbaar</button><button type="button" className={mode === "hidden" ? "selected" : ""} onClick={() => setMode("hidden")}>Verborgen</button></div></fieldset>{mode === "limited" && <><label>Publiceren vanaf<input name="publishFrom" type="datetime-local" defaultValue={publishFrom} /></label><label>Verbergen na<input name="publishUntil" type="datetime-local" defaultValue={publishUntil} /></label></>}<div className="form-action-row"><SubmitButton pendingLabel="Opslaan...">Instellingen opslaan</SubmitButton></div></form>;
}
