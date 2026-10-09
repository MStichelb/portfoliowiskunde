"use client";

import { MutationFeedbackForm } from "./mutation-feedback-form";

import { Check, Info, Minus, Pencil, Sparkles } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { ExerciseLevelBadge } from "@/app/components/exercise-level-badge";
import type { ExerciseNoteReturnContext } from "@/lib/admin-routes";
import { EXERCISE_LEVELS, type ExerciseLevel, type ExerciseLevelOverrideMode } from "@/lib/exercise-level";
import {
  DEFAULT_EXERCISE_LEVEL_PRESENTATION,
  exerciseLevelLabel,
  type ExerciseLevelPresentation,
} from "@/lib/exercise-level-presentation";

export function ExerciseLevelInlineEditor({
  exerciseId,
  learningSpaceId,
  levelSource,
  levelOverrideMode,
  levelOverride,
  effectiveLevel,
  presentation = DEFAULT_EXERCISE_LEVEL_PRESENTATION,
  returnContext = "portfolio",
  action,
}: {
  exerciseId: string;
  learningSpaceId: string;
  levelSource: ExerciseLevel | null;
  levelOverrideMode: ExerciseLevelOverrideMode;
  levelOverride: ExerciseLevel | null;
  effectiveLevel: ExerciseLevel | null;
  presentation?: ExerciseLevelPresentation;
  returnContext?: ExerciseNoteReturnContext;
  action: (formData: FormData) => unknown | Promise<unknown>;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = `exercise-level-${useId().replaceAll(":", "")}`;
  const [open, setOpen] = useState(false);
  const selected = levelOverrideMode === "level" && levelOverride ? `level:${levelOverride}` : levelOverrideMode;
  const isManual = levelOverrideMode === "level" || levelOverrideMode === "none";

  const toggle = () => {
    const popover = popoverRef.current;
    if (!popover) return;
    if (popover.matches(":popover-open")) {
      popover.hidePopover();
      return;
    }
    popover.showPopover();
    requestAnimationFrame(() => positionPopover(triggerRef.current, popover));
  };

  return <div className="exercise-level-inline-editor">
    <button
      ref={triggerRef}
      className="exercise-level-inline-trigger"
      type="button"
      onClick={toggle}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={popoverId}
      aria-label={`Niveau wijzigen: ${exerciseLevelLabel(effectiveLevel, presentation)}${isManual ? ", handmatig ingesteld" : ""}`}
    >
      <ExerciseLevelBadge level={effectiveLevel} presentation={presentation} />
      {isManual ? <Pencil className="exercise-level-manual-indicator" size={14} aria-label="Handmatig ingesteld" /> : null}
    </button>
    <div
      ref={popoverRef}
      id={popoverId}
      className="exercise-level-popover"
      popover="auto"
      role="menu"
      aria-label="Niveau kiezen"
      onToggle={(event) => setOpen(event.currentTarget.matches(":popover-open"))}
    >
      <MutationFeedbackForm action={action} errorMessage="De wijziging kon niet worden opgeslagen. Probeer opnieuw.">
        <input type="hidden" name="id" value={exerciseId} />
        <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
        <input type="hidden" name="returnContext" value={returnContext} />
        <LevelChoice value="inherit" selected={selected === "inherit"} label="Automatisch" icon={<Sparkles size={16} aria-hidden />} description={levelSource ? `Bronniveau: ${exerciseLevelLabel(levelSource, presentation)}` : "Nog geen niveau herkend"} />
        <LevelChoice value="none" selected={selected === "none"} label="Geen niveau" icon={<span className="exercise-level-choice-neutral"><Minus size={16} aria-hidden /></span>} />
        {EXERCISE_LEVELS.map((level) => <LevelChoice
          key={level}
          value={`level:${level}`}
          selected={selected === `level:${level}`}
          label={presentation[level].displayName}
          icon={<ExerciseLevelBadge level={level} presentation={presentation} />}
        />)}
      </MutationFeedbackForm>
      <div className="exercise-level-popover-context">
        <Info size={16} aria-hidden />
        <div>
          {levelSource ? <strong>Bronniveau: {exerciseLevelLabel(levelSource, presentation)}</strong> : <strong>Nog geen niveau herkend</strong>}
          {isManual ? <small>Handmatig ingesteld voor deze oefening.</small> : <small>Automatisch overgenomen van de bron.</small>}
        </div>
      </div>
    </div>
  </div>;
}

function LevelChoice({ value, selected, label, icon, description }: { value: string; selected: boolean; label: string; icon: ReactNode; description?: string }) {
  return <button className={`exercise-level-choice${selected ? " is-selected" : ""}`} type="submit" name="levelChoice" value={value} role="menuitemradio" aria-checked={selected}>
    <span className="exercise-level-choice-icon">{icon}</span>
    <span className="exercise-level-choice-label"><strong>{label}</strong>{description ? <small>{description}</small> : null}</span>
    {selected ? <Check size={17} aria-hidden /> : null}
  </button>;
}

export function positionPopover(trigger: HTMLButtonElement | null, popover: HTMLDivElement): void {
  if (!trigger) return;
  const gap = 6;
  const edge = 12;
  const triggerRect = trigger.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const left = Math.min(Math.max(edge, triggerRect.left), Math.max(edge, window.innerWidth - popoverRect.width - edge));
  const below = triggerRect.bottom + gap;
  const above = triggerRect.top - popoverRect.height - gap;
  popover.style.left = `${left}px`;
  popover.style.top = `${below + popoverRect.height <= window.innerHeight - edge || above < edge ? below : above}px`;
}
