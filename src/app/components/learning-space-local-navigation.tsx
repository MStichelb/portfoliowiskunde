"use client";

export function LearningSpaceLocalNavigation<Section extends string>({ sections, active, onSelect, idPrefix, ariaLabel }: {
  sections: readonly { id: Section; label: string; group: string }[];
  active: Section;
  onSelect: (section: Section) => void;
  idPrefix: string;
  ariaLabel: string;
}) {
  const groups = [...new Set(sections.map((section) => section.group))];
  return <nav className="learning-space-settings-navigation" aria-label={ariaLabel}>
    {groups.map((group) => <div key={group} className="learning-space-settings-nav-group" role="group" aria-label={group}>
      <span className="learning-space-settings-group-label" aria-hidden>{group}</span>
      <div className="learning-space-settings-group-items">
        {sections.filter((section) => section.group === group).map((section) => <button key={section.id} id={`${idPrefix}-nav-${section.id}`} type="button"
          aria-current={active === section.id ? "true" : undefined} aria-controls={`${idPrefix}-panel-${section.id}`}
          className={active === section.id ? "is-active" : ""} onClick={() => onSelect(section.id)}
          onKeyDown={(event) => {
            const index = sections.indexOf(section);
            const target = event.key === "ArrowDown" || event.key === "ArrowRight" ? (index + 1) % sections.length
              : event.key === "ArrowUp" || event.key === "ArrowLeft" ? (index + sections.length - 1) % sections.length
              : event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : null;
            if (target === null) return;
            event.preventDefault();
            onSelect(sections[target].id);
            document.getElementById(`${idPrefix}-nav-${sections[target].id}`)?.focus();
          }}>{section.label}</button>)}
      </div>
    </div>)}
  </nav>;
}
