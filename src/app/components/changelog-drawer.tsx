"use client";

import { History, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { ChangelogEntry } from "@/data/changelog";
import { ChangelogEntries } from "./changelog-entries";

export function ChangelogDrawer({ entries, hasUnread }: { entries: ChangelogEntry[]; hasUnread: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [seen, setSeen] = useState(false);
  const [open, setOpen] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const unread = hasUnread && !seen;

  async function show() {
    dialog.current?.showModal();
    setOpen(true);
    setSaveFailed(false);
    try {
      const response = await fetch("/api/changelog/seen", { method: "POST" });
      if (!response.ok) throw new Error("Leesstatus opslaan mislukt");
      setSeen(true);
    } catch { setSaveFailed(true); }
  }
  function close() { dialog.current?.close(); }

  return <>
    <button ref={trigger} className="site-nav-icon changelog-trigger" type="button" onClick={show} aria-label={unread ? "Changelog, ongelezen wijzigingen" : "Changelog"} title="Changelog" aria-haspopup="dialog" aria-expanded={open}>
      <History size={20} aria-hidden />{unread ? <span className="changelog-dot" aria-hidden /> : null}
    </button>
    <dialog ref={dialog} className="changelog-drawer" aria-labelledby={titleId} onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="changelog-drawer-content">
        <header className="changelog-drawer-heading"><h2 id={titleId}>Recente wijzigingen</h2><button className="site-nav-icon" autoFocus type="button" onClick={close} aria-label="Changelog sluiten"><X size={20} aria-hidden /></button></header>
        <ChangelogEntries entries={entries} />
        {saveFailed ? <p role="status" className="changelog-save-error">Je kunt de wijzigingen lezen. De leesstatus kon niet worden opgeslagen; open de changelog later opnieuw.</p> : null}
        <Link className="changelog-full-link" href="/changelog" onClick={close}>Volledige changelog bekijken →</Link>
      </div>
    </dialog>
  </>;
}
