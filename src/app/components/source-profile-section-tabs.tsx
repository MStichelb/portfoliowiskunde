"use client";

import { flushSync } from "react-dom";
import { useId, useState, type ReactNode, type KeyboardEvent } from "react";

export type SourceProfileSectionTab = "owned" | "editor" | "templates";

export function SourceProfileSectionTabs({ ownedSection, editorSection, templateSection, secondTabLabel = "Uit leeromgevingen", initialTab = "owned" }: {
  ownedSection: ReactNode;
  editorSection: ReactNode;
  templateSection: ReactNode;
  secondTabLabel?: string;
  initialTab?: SourceProfileSectionTab;
}) {
  return <SourceProfileTabs panels={[
    { id: "owned", label: "Mijn bronprofielen", content: ownedSection },
    { id: "editor", label: secondTabLabel, content: editorSection },
    { id: "templates", label: "Sjablonen", content: templateSection },
  ]} initialTab={initialTab} ariaLabel="Bronprofieloverzicht" />;
}

export function SourceProfileTabs({ panels, initialTab = panels[0]?.id, keepMounted = false, className = "source-profile-section-tabs", panelClassName = "source-profile-tab-panel", ariaLabel }: {
  panels: readonly { id: string; label: string; content: ReactNode }[];
  initialTab?: string;
  keepMounted?: boolean;
  className?: string;
  panelClassName?: string;
  ariaLabel: string;
}) {
  const [tab, setTab] = useState(initialTab);
  const baseId = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = event.key === "ArrowRight" ? (index + 1) % panels.length
      : event.key === "ArrowLeft" ? (index + panels.length - 1) % panels.length
      : event.key === "Home" ? 0 : event.key === "End" ? panels.length - 1 : null;
    if (target === null) return;
    event.preventDefault();
    setTab(panels[target].id);
    document.getElementById(`${baseId}-${panels[target].id}-tab`)?.focus();
  };
  return <>
    <div className={className} role="tablist" aria-label={ariaLabel}>
      {panels.map((panel, index) => <button key={panel.id} id={`${baseId}-${panel.id}-tab`} aria-controls={`${baseId}-${panel.id}-panel`} type="button" role="tab" tabIndex={tab === panel.id ? 0 : -1} aria-selected={tab === panel.id} className={tab === panel.id ? "is-active" : ""} onClick={() => setTab(panel.id)} onKeyDown={(event) => onKeyDown(event, index)}>{panel.label}</button>)}
    </div>
    {panels.filter((panel) => keepMounted || panel.id === tab).map((panel) => <div key={panel.id} className={panelClassName} id={`${baseId}-${panel.id}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${panel.id}-tab`} hidden={panel.id !== tab} onInvalidCapture={(event) => {
      const firstInvalid = event.currentTarget.closest("form")?.querySelector("input:invalid, select:invalid, textarea:invalid");
      if (panel.id !== tab && (!firstInvalid || event.currentTarget.contains(firstInvalid))) flushSync(() => setTab(panel.id));
    }}>
      {panel.content}
    </div>)}
  </>;
}
