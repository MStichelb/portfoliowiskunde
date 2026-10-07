"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

const sections = [
  { id: "general", label: "Algemeen", hash: "general-settings-heading", group: "Algemeen" },
  { id: "appearance", label: "Vormgeving", hash: "appearance-settings-heading", group: "Personalisatie" },
  { id: "labels", label: "Benamingen", hash: "label-settings-heading", group: "Personalisatie" },
  { id: "levels", label: "Niveaus", hash: "level-settings-heading", group: "Personalisatie" },
  { id: "profile", label: "Bronprofiel", hash: "source-profile-settings", group: "Bron" },
  { id: "source", label: "Bron", hash: "source-settings-heading", group: "Bron" },
  { id: "status", label: "Status", hash: "lifecycle-settings-heading", group: "Beheer" },
] as const;
const groups = ["Algemeen", "Personalisatie", "Bron", "Beheer"] as const;

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
      <nav className="learning-space-settings-navigation" aria-label="Instellingen van deze leeromgeving">
        {groups.map((group) => <div key={group} className="learning-space-settings-nav-group" role="group" aria-label={group}>
          <span className="learning-space-settings-group-label" aria-hidden>{group}</span>
          <div className="learning-space-settings-group-items">
            {sections.filter((section) => section.group === group).map((section) => <button key={section.id} id={`settings-nav-${section.id}`} type="button"
              aria-current={active === section.id ? "true" : undefined} aria-controls={`settings-panel-${section.id}`}
              className={active === section.id ? "is-active" : ""} onClick={() => select(section.id)}
              onKeyDown={(event) => {
                const index = sections.indexOf(section);
                const target = event.key === "ArrowDown" || event.key === "ArrowRight" ? (index + 1) % sections.length
                  : event.key === "ArrowUp" || event.key === "ArrowLeft" ? (index + sections.length - 1) % sections.length
                  : event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : null;
                if (target === null) return;
                event.preventDefault();
                select(sections[target].id);
                document.getElementById(`settings-nav-${sections[target].id}`)?.focus();
              }}>{section.label}</button>)}
          </div>
        </div>)}
      </nav>
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
