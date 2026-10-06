"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Check, ChevronDown, Eye } from "lucide-react";
import type { LearningSpaceTerminologyInput } from "@/lib/collection-terminology";
import { sourceProfileLabels, type SourceProfilePresentationSpace } from "@/lib/source-profile-presentation";

const TerminologyContext = createContext<LearningSpaceTerminologyInput>({});
export const SourceProfileTerminologyProvider = TerminologyContext.Provider;
export function useSourceProfileLabels() { return sourceProfileLabels(useContext(TerminologyContext)); }
export function useSourceProfileTerminology() { return useContext(TerminologyContext); }

const ViewContext = createContext<{
  spaces: SourceProfilePresentationSpace[];
  selected?: SourceProfilePresentationSpace;
  canChoose: boolean;
  select: (id: string) => void;
}>({ spaces: [], canChoose: false, select: () => undefined });

export function SourceProfilePresentation({ spaces = [], linkedSpaceCount = spaces.length, contextSpaceId, children }: {
  spaces?: SourceProfilePresentationSpace[];
  linkedSpaceCount?: number;
  contextSpaceId?: string;
  children: ReactNode;
}) {
  const fixed = spaces.find((space) => space.id === contextSpaceId);
  const [selectedId, setSelectedId] = useState(fixed?.id ?? spaces[0]?.id ?? "");
  const selected = fixed ?? spaces.find((space) => space.id === selectedId) ?? spaces[0];
  return <ViewContext.Provider value={{ spaces, selected, canChoose: !fixed && linkedSpaceCount > 1 && spaces.length > 0, select: setSelectedId }}>
    <SourceProfileTerminologyProvider value={selected ?? {}}>{children}</SourceProfileTerminologyProvider>
  </ViewContext.Provider>;
}

export function SourceProfileViewContext() {
  const context = useContext(ViewContext);
  const caption = context.selected?.shortLabel ?? "Standaardtermen";
  if (!context.canChoose) return <span className="source-profile-view-context" title="Benamingen weergeven als"><Eye size={16} aria-hidden /><span>{caption}</span></span>;
  return <details className="source-profile-view-choice" onKeyDown={(event) => {
    if (event.key === "Escape" && event.currentTarget.open) { event.stopPropagation(); event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
  }}>
    <summary className="source-profile-view-context" aria-label={`Benamingen weergeven als: ${caption}`}><Eye size={16} aria-hidden /><span>{caption}</span><ChevronDown size={13} aria-hidden /></summary>
    <div className="source-profile-view-options" role="group" aria-label="Benamingen weergeven als">
      <small>Benamingen weergeven als</small>
      {context.spaces.map((space) => <button key={space.id} type="button" aria-pressed={space.id === context.selected?.id} onClick={(event) => {
        context.select(space.id);
        const details = event.currentTarget.closest("details");
        if (details) { details.open = false; details.querySelector("summary")?.focus(); }
      }}><span className="source-profile-view-check">{space.id === context.selected?.id ? <Check size={14} aria-hidden /> : null}</span><span>{space.shortLabel} — {space.name}</span></button>)}
    </div>
  </details>;
}
