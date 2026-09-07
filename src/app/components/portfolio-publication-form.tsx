"use client";

import { Eye, EyeOff, Hourglass } from "lucide-react";
import { useState } from "react";

import { SubmitButton } from "@/app/components/submit-button";
import { PORTFOLIO_CUSTOM_TEXT_MAX_LENGTH, type PortfolioCustomTextPosition } from "@/lib/portfolio-custom-message";

interface PortfolioPublicationFormProps {
  id: string;
  title: string;
  cardColor: string;
  visible: boolean;
  limited: boolean;
  publishFrom: string;
  publishUntil: string;
  customText: string | null;
  customTextPosition: PortfolioCustomTextPosition;
  action: (formData: FormData) => void | Promise<void>;
}

export function PortfolioPublicationForm({ id, title, cardColor, visible, limited, publishFrom, publishUntil, customText, customTextPosition, action }: PortfolioPublicationFormProps) {
  const [mode, setMode] = useState<"visible" | "limited" | "hidden">(!visible ? "hidden" : limited ? "limited" : "visible");
  const [color, setColor] = useState(cardColor);
  return <form action={action} className="portfolio-settings-form">
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="mode" value={mode === "hidden" ? "hidden" : "visible"} />
    <input type="hidden" name="publicationMode" value={mode} />
    <label className="field-wide">Titel<input name="title" defaultValue={title} maxLength={180} /></label>
    <label className="color-field">Kleur<span><input name="cardColor" type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} /><code>{color.toUpperCase()}</code></span><small>Accentkleur van het kaartje op de publieke pagina.</small></label>
    <div className="publication-row field-wide">
      <fieldset className="segmented-control"><legend>Publicatie</legend><div>
        <button type="button" aria-pressed={mode === "visible"} className={`visible-choice ${mode === "visible" ? "selected" : ""}`} onClick={() => setMode("visible")}><Eye size={16} aria-hidden />Zichtbaar</button>
        <button type="button" aria-pressed={mode === "limited"} className={`scheduled-choice ${mode === "limited" ? "selected" : ""}`} onClick={() => setMode("limited")}><Hourglass size={16} aria-hidden />Plannen</button>
        <button type="button" aria-pressed={mode === "hidden"} className={`hidden-choice ${mode === "hidden" ? "selected" : ""}`} onClick={() => setMode("hidden")}><EyeOff size={16} aria-hidden />Verborgen</button>
      </div></fieldset>
    </div>
    {mode === "limited" ? <div className="planning-fields field-wide"><label>Vanaf<input name="publishFrom" type="datetime-local" defaultValue={publishFrom} /></label><label>Tot<input name="publishUntil" type="datetime-local" defaultValue={publishUntil} /></label></div> : null}
    <label className="field-wide">Bericht voor leerlingen<textarea name="customText" defaultValue={customText ?? ""} maxLength={PORTFOLIO_CUSTOM_TEXT_MAX_LENGTH} rows={4} /><small>Optionele tekst die op de portfoliopagina bij de documentknoppen wordt getoond.</small></label>
    <label className="field-wide">Positie van bericht<select name="customTextPosition" defaultValue={customTextPosition}><option value="above_documents">Boven de documentknoppen</option><option value="below_documents">Onder de documentknoppen</option></select></label>
    <div className="portfolio-settings-actions field-wide"><SubmitButton pendingLabel="Opslaan...">Instellingen opslaan</SubmitButton></div>
  </form>;
}
