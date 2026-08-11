"use client";

import { useState } from "react";
import { Eye, EyeOff, Hourglass } from "lucide-react";

import { SubmitButton } from "@/app/components/submit-button";

export function PortfolioPublicationForm({ id, title, visible, limited, publishFrom, publishUntil, action }: { id: string; title: string; visible: boolean; limited: boolean; publishFrom: string; publishUntil: string; action: (formData: FormData) => void | Promise<void> }) {
  const [mode, setMode] = useState<"visible" | "limited" | "hidden">(!visible ? "hidden" : limited ? "limited" : "visible");
  return <form action={action} className="portfolio-settings-form"><input type="hidden" name="id" value={id} /><input type="hidden" name="mode" value={mode === "hidden" ? "hidden" : "visible"} /><input type="hidden" name="publicationMode" value={mode} /><label className="field-wide">Titel<input name="title" defaultValue={title} maxLength={180} /></label><div className="publication-row field-wide"><fieldset className="segmented-control"><legend>Publicatie</legend><div><button type="button" aria-pressed={mode === "visible"} className={`visible-choice ${mode === "visible" ? "selected" : ""}`} onClick={() => setMode("visible")}><Eye size={16} aria-hidden />Zichtbaar</button><button type="button" aria-pressed={mode === "limited"} className={`scheduled-choice ${mode === "limited" ? "selected" : ""}`} onClick={() => setMode("limited")}><Hourglass size={16} aria-hidden />Plannen</button><button type="button" aria-pressed={mode === "hidden"} className={`hidden-choice ${mode === "hidden" ? "selected" : ""}`} onClick={() => setMode("hidden")}><EyeOff size={16} aria-hidden />Verborgen</button></div></fieldset><SubmitButton pendingLabel="Opslaan...">Instellingen opslaan</SubmitButton></div>{mode === "limited" && <div className="planning-fields field-wide"><label>Vanaf<input name="publishFrom" type="datetime-local" defaultValue={publishFrom} /></label><label>Tot<input name="publishUntil" type="datetime-local" defaultValue={publishUntil} /></label></div>}</form>;
}
