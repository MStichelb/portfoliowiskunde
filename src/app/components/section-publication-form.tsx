"use client";

import { useState } from "react";
import { Eye, EyeOff, Hourglass } from "lucide-react";

import { SubmitButton } from "@/app/components/submit-button";

export function SectionPublicationForm({ id, portfolioId, visible, limited, publishFrom, publishUntil, action }: { id: string; portfolioId: string; visible: boolean; limited: boolean; publishFrom: string; publishUntil: string; action: (formData: FormData) => void | Promise<void> }) {
  const [mode, setMode] = useState<"visible" | "scheduled" | "hidden">(!visible ? "hidden" : limited ? "scheduled" : "visible");
  return <form action={action} className="section-settings-form"><input type="hidden" name="id" value={id} /><input type="hidden" name="portfolioId" value={portfolioId} /><input type="hidden" name="mode" value={mode === "hidden" ? "hidden" : "visible"} /><input type="hidden" name="publicationMode" value={mode} /><div className="publication-row"><fieldset className="segmented-control"><legend>Publicatie</legend><div><button type="button" aria-pressed={mode === "visible"} className={`visible-choice ${mode === "visible" ? "selected" : ""}`} onClick={() => setMode("visible")}><Eye size={16} aria-hidden />Zichtbaar</button><button type="button" aria-pressed={mode === "scheduled"} className={`scheduled-choice ${mode === "scheduled" ? "selected" : ""}`} onClick={() => setMode("scheduled")}><Hourglass size={16} aria-hidden />Plannen</button><button type="button" aria-pressed={mode === "hidden"} className={`hidden-choice ${mode === "hidden" ? "selected" : ""}`} onClick={() => setMode("hidden")}><EyeOff size={16} aria-hidden />Verborgen</button></div></fieldset><SubmitButton className="secondary-button" pendingLabel="Opslaan...">Opslaan</SubmitButton></div>{mode === "scheduled" && <div className="planning-fields"><label>Vanaf<input name="publishFrom" type="datetime-local" defaultValue={publishFrom} /></label><label>Tot<input name="publishUntil" type="datetime-local" defaultValue={publishUntil} /></label></div>}</form>;
}
