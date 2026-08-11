"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export function ConfirmActionButton({ action, fields, label, confirmTitle, confirmText, className = "icon-button" }: { action: (formData: FormData) => void | Promise<void>; fields?: Record<string, string>; label: ReactNode; confirmTitle: string; confirmText: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={className} onClick={() => setOpen(true)} aria-label={confirmTitle} title={confirmTitle}>{label}</button>{open && <div className="confirm-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">{confirmTitle}</h2><p>{confirmText}</p><div><button className="secondary-button" type="button" onClick={() => setOpen(false)}>Annuleren</button><form action={action}>{Object.entries(fields ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}<button className="danger-button" type="submit">Verwijderen</button></form></div></div></div>}</>;
}
