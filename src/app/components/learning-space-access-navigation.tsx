"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { LearningSpaceLocalNavigation } from "./learning-space-local-navigation";

const sections = [
  { id: "teachers", label: "Leraren", group: "Leraren" },
  { id: "groups", label: "Groepen", group: "Koppelen" },
  { id: "individual", label: "Individueel", group: "Koppelen" },
  { id: "students", label: "Leerlingen", group: "Leerlingen" },
] as const;
type AccessSection = typeof sections[number]["id"];
const AccessContext = createContext<AccessSection>("teachers");

export function LearningSpaceAccessNavigation({ children, initialSection = "teachers" }: { children: ReactNode; initialSection?: AccessSection }) {
  const [active, setActive] = useState<AccessSection>(initialSection);
  return <AccessContext.Provider value={active}>
    <div className="learning-space-settings-layout">
      <LearningSpaceLocalNavigation sections={sections} active={active} onSelect={setActive} idPrefix="access" ariaLabel="Toegang tot deze leeromgeving" />
      <div className="learning-space-settings-content">{children}</div>
    </div>
  </AccessContext.Provider>;
}

export function LearningSpaceAccessPanel({ section, children }: { section: AccessSection; children: ReactNode }) {
  const active = useContext(AccessContext);
  return <div id={`access-panel-${section}`} className="learning-space-settings-panel" role="region"
    aria-labelledby={`access-nav-${section}`} hidden={active !== section}>{children}</div>;
}
