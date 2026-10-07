"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { LearningSpaceLocalNavigation } from "./learning-space-local-navigation";

const sections = [
  { id: "general", label: "Algemeen", hash: "general-settings-heading", group: "Algemeen" },
  { id: "management", label: "Beheer", hash: "lifecycle-settings-heading", group: "Algemeen" },
  { id: "appearance", label: "Vormgeving", hash: "appearance-settings-heading", group: "Personalisatie" },
  { id: "labels", label: "Benamingen", hash: "label-settings-heading", group: "Personalisatie" },
  { id: "levels", label: "Niveaus", hash: "level-settings-heading", group: "Personalisatie" },
  { id: "rights", label: "Rechten", hash: "rights-settings-heading", group: "Rechten" },
  { id: "profile", label: "Bronprofiel", hash: "source-profile-settings", group: "Bron" },
  { id: "source", label: "Bron", hash: "source-settings-heading", group: "Bron" },
] as const;

type SettingsSection = typeof sections[number]["id"];
const SettingsContext = createContext<{ active: SettingsSection; select: (section: SettingsSection) => void } | null>(null);

export function settingsSectionFromHash(hash: string): SettingsSection {
  if (hash === "#personalization-settings-heading") return "appearance";
  return sections.find((section) => `#${section.hash}` === hash)?.id ?? "general";
}

export function LearningSpaceSettingsNavigation({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<SettingsSection>("general");
  useEffect(() => {
    const followHash = () => setActive(settingsSectionFromHash(window.location.hash));
    followHash();
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, []);

  function select(section: SettingsSection) {
    setActive(section);
    // Keep existing setup links usable without a route transition or form reset.
    const hash = sections.find((entry) => entry.id === section)!.hash;
    window.history.replaceState(window.history.state, "", `#${hash}`);
  }

  return <SettingsContext.Provider value={{ active, select }}>
    <div className="learning-space-settings-layout">
      <LearningSpaceLocalNavigation sections={sections} active={active} onSelect={select} idPrefix="settings" ariaLabel="Instellingen van deze leeromgeving" />
      <div className="learning-space-settings-content">{children}</div>
    </div>
  </SettingsContext.Provider>;
}

export function LearningSpaceSettingsPanel({ section, children, continuation = false }: { section: SettingsSection; children: ReactNode; continuation?: boolean }) {
  const navigation = useContext(SettingsContext);
  return <div id={continuation ? undefined : `settings-panel-${section}`} className="learning-space-settings-panel" role="region"
    aria-labelledby={`settings-nav-${section}`} hidden={navigation ? navigation.active !== section : false}
    onInvalidCapture={(event) => {
      const firstInvalid = event.currentTarget.closest("form")?.querySelector("input:invalid, select:invalid, textarea:invalid");
      if (navigation && navigation.active !== section && (!firstInvalid || event.currentTarget.contains(firstInvalid))) {
        flushSync(() => navigation.select(section));
      }
    }}>{children}</div>;
}
