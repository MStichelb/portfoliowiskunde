"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { ConfiguredResourceIcon } from "@/app/components/configured-resource-icon";
import { globalResourceSelectableIcons, type GlobalResourceIcon } from "@/lib/source-profile-config";

export function SourceProfileIconPicker({ value, onChange }: { value: GlobalResourceIcon; onChange: (icon: GlobalResourceIcon) => void }) {
  const [open, setOpen] = useState(false);

  return <div className="source-profile-icon-picker-field">
    <span>Icoon</span>
    <div className="source-profile-icon-picker">
      <button
        className="source-profile-icon-picker-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Icoon kiezen"
      >
        <ConfiguredResourceIcon icon={value} size={18} />
        <ChevronDown size={15} aria-hidden />
      </button>
      {open ? <div className="source-profile-icon-picker-menu" role="listbox" aria-label="Beschikbare iconen">
        {globalResourceSelectableIcons.map((icon) => {
          const label = sourceProfileIconLabel(icon);
          return <button
            key={icon}
            className={icon === value ? "is-selected" : ""}
            type="button"
            onClick={() => { onChange(icon); setOpen(false); }}
            role="option"
            aria-selected={icon === value}
            title={label}
          >
            <ConfiguredResourceIcon icon={icon} size={19} />
            <span>{label}</span>
          </button>;
        })}
      </div> : null}
    </div>
  </div>;
}

export function sourceProfileIconLabel(icon: GlobalResourceIcon): string {
  const labels: Record<GlobalResourceIcon, string> = {
    "file-text": "Document",
    lightbulb: "Idee",
    "circle-check-big": "Controle",
    "book-open": "Boek",
    link: "Link",
    "external-link": "Externe link",
    youtube: "Video (oud)",
    calculator: "Rekenmachine",
    astroid: "Stervorm",
    "land-plot": "Terrein",
    "drafting-compass": "Passer",
    brain: "Brein",
    "flask-conical": "Proef",
    "key-round": "Sleutel",
    star: "Ster",
    shapes: "Vormen",
    "notebook-pen": "Notities",
    pencil: "Potlood",
    paperclip: "Paperclip",
    "scroll-text": "Tekstrol",
    map: "Kaart",
    "book-search": "Boek zoeken",
    sparkles: "Extra",
    clapperboard: "Film",
    "monitor-play": "Video",
    puzzle: "Puzzel",
    "file-clock": "Planning",
    "map-pinned": "Locatiekaart",
  };
  return labels[icon];
}
