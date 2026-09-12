"use client";

import { useId, useState, type ReactNode } from "react";

export type SourceProfileSectionTab = "owned" | "editor" | "templates";

export function SourceProfileSectionTabs({ ownedSection, editorSection, templateSection, secondTabLabel = "Uit leeromgevingen", initialTab = "owned" }: {
  ownedSection: ReactNode;
  editorSection: ReactNode;
  templateSection: ReactNode;
  secondTabLabel?: string;
  initialTab?: SourceProfileSectionTab;
}) {
  const [tab, setTab] = useState(initialTab);
  const baseId = useId();
  const activeTabId = `${baseId}-${tab}-tab`;
  const activePanelId = `${baseId}-${tab}-panel`;
  return <>
    <div className="source-profile-section-tabs" role="tablist" aria-label="Bronprofieloverzicht">
      <button id={`${baseId}-owned-tab`} aria-controls={`${baseId}-owned-panel`} type="button" role="tab" aria-selected={tab === "owned"} className={tab === "owned" ? "is-active" : ""} onClick={() => setTab("owned")}>Mijn bronprofielen</button>
      <button id={`${baseId}-editor-tab`} aria-controls={`${baseId}-editor-panel`} type="button" role="tab" aria-selected={tab === "editor"} className={tab === "editor" ? "is-active" : ""} onClick={() => setTab("editor")}>{secondTabLabel}</button>
      <button id={`${baseId}-templates-tab`} aria-controls={`${baseId}-templates-panel`} type="button" role="tab" aria-selected={tab === "templates"} className={tab === "templates" ? "is-active" : ""} onClick={() => setTab("templates")}>Sjablonen</button>
    </div>
    <div className="source-profile-tab-panel" id={activePanelId} role="tabpanel" aria-labelledby={activeTabId}>
      {tab === "owned" ? ownedSection : tab === "editor" ? editorSection : templateSection}
    </div>
  </>;
}
