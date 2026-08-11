"use client";

import { useState } from "react";

import { SubmitButton } from "@/app/components/submit-button";

export function SectionPublicationForm({ id, portfolioId, visible, limited, publishFrom, publishUntil, action }: { id: string; portfolioId: string; visible: boolean; limited: boolean; publishFrom: string; publishUntil: string; action: (formData: FormData) => void | Promise<void> }) {
  const [mode, setMode] = useState<"visible" | "scheduled" | "hidden">(!visible ? "hidden" : limited ? "scheduled" : "visible");
  return <form action={action} className="section-settings-form"><input type="hidden" name="id" value={id} /><input type="hidden" name="portfolioId" value={portfolioId} /><input type="hidden" name="mode" value={mode === "hidden" ? "hidden" : "visible"} /><input type="hidden" name="publicationMode" value={mode} /><fieldset className="segmented-control"><legend>Publicatie</legend><div><button type="button" className={mode === "visible" ? "selected" : ""} onClick={() => setMode("visible")}>Zichtbaar</button><button type="button" className={mode === "scheduled" ? "selected" : ""} onClick={() => setMode("scheduled")}>Gepland</button><button type="button" className={mode === "hidden" ? "selected" : ""} onClick={() => setMode("hidden")}>Verborgen</button></div></fieldset>{mode === "scheduled" && <><label>Publiceren vanaf<input name="publishFrom" type="datetime-local" defaultValue={publishFrom} /></label><label>Verbergen na<input name="publishUntil" type="datetime-local" defaultValue={publishUntil} /></label></>}<SubmitButton className="secondary-button" pendingLabel="Opslaan...">Opslaan</SubmitButton></form>;
}
