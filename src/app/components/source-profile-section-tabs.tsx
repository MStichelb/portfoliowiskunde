"use client";

import { useId, useState, type ReactNode } from "react";

export function SourceProfileSectionTabs({ profileSection, templateSection, templateLabel, initialTab = "profiles" }: {
  profileSection: ReactNode;
  templateSection: ReactNode;
  templateLabel: string;
  initialTab?: "profiles" | "templates";
}) {
  const [tab, setTab] = useState(initialTab);
  const baseId = useId();
  const activeTabId = `${baseId}-${tab}-tab`;
  const activePanelId = `${baseId}-${tab}-panel`;
  return <>
    <div className="source-profile-section-tabs" role="tablist" aria-label="Bronprofieloverzicht">
      <button id={`${baseId}-profiles-tab`} aria-controls={`${baseId}-profiles-panel`} type="button" role="tab" aria-selected={tab === "profiles"} className={tab === "profiles" ? "is-active" : ""} onClick={() => setTab("profiles")}>Mijn bronprofielen</button>
      <button id={`${baseId}-templates-tab`} aria-controls={`${baseId}-templates-panel`} type="button" role="tab" aria-selected={tab === "templates"} className={tab === "templates" ? "is-active" : ""} onClick={() => setTab("templates")}>{templateLabel}</button>
    </div>
    <div id={activePanelId} role="tabpanel" aria-labelledby={activeTabId}>{tab === "profiles" ? profileSection : templateSection}</div>
  </>;
}
