"use client";

import { ShieldAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { PublicEmergencyAccessState } from "@/lib/public-access";

export function EmergencyAccessControl({ state, action }: { state: PublicEmergencyAccessState; action: (formData: FormData) => void | Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const close = () => {
    setConfirming(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  useEffect(() => {
    if (!confirming) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming]);

  return <div className={`emergency-access-control${state.enabled ? " emergency-access-active" : ""}`}>
    <div><strong><ShieldAlert size={18} aria-hidden />Publieke noodtoegang</strong><p>Gebruik dit alleen tijdelijk wanneer aanmelden via Smartschool niet beschikbaar is.</p>{state.enabledAt ? <small>Actief sinds {formatEnabledAt(state.enabledAt)}</small> : null}</div>
    {state.enabled ? <form action={action}><input type="hidden" name="enabled" value="false" /><button className="secondary-button emergency-switch" type="submit" role="switch" aria-checked="true"><span aria-hidden />Uitschakelen</button></form> : <button ref={triggerRef} className="secondary-button emergency-switch" type="button" role="switch" aria-checked="false" onClick={() => setConfirming(true)}><span aria-hidden />Inschakelen</button>}
    {confirming ? <div className="confirm-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}><h2 id={titleId}>Publieke noodtoegang inschakelen?</h2><p>Alle publiek zichtbare leeromgevingen en uitwerkingen zijn dan tijdelijk zonder Smartschoolaanmelding bereikbaar. Beheerpagina&apos;s blijven beveiligd.</p><div><button ref={cancelRef} className="secondary-button" type="button" onClick={close}>Annuleren</button><form action={action}><input type="hidden" name="enabled" value="true" /><button className="primary-button" type="submit">Noodtoegang inschakelen</button></form></div></div></div> : null}
  </div>;
}

function formatEnabledAt(value: string): string {
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(value));
}
