"use client";

import { Check, Crown, Eye, Pencil } from "lucide-react";
import { useId, useRef, useState } from "react";

import { positionPopover } from "@/app/components/exercise-level-inline-editor";
import type { LearningSpaceTeacher } from "@/lib/user-management";

export function TeacherRoleBadge({ role }: { role: LearningSpaceTeacher["role"] }) {
  return <span className={`teacher-role-badge teacher-role-badge-${role}`}>
    {role === "owner" ? <Crown size={14} aria-hidden /> : role === "editor" ? <Pencil size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
    {role === "owner" ? "Eigenaar" : role === "editor" ? "Bewerker" : "Kijker"}
  </span>;
}

export function TeacherRoleInlineEditor({ learningSpaceId, userId, name, role, action }: {
  learningSpaceId: string;
  userId: string;
  name: string;
  role: "viewer" | "editor";
  action: (formData: FormData) => void | Promise<void>;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = `teacher-role-${useId().replaceAll(":", "")}`;
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const popover = popoverRef.current;
    if (!popover) return;
    if (popover.matches(":popover-open")) {
      popover.hidePopover();
      triggerRef.current?.focus();
      return;
    }
    popover.showPopover();
    requestAnimationFrame(() => {
      positionPopover(triggerRef.current, popover);
      const maxTop = Math.max(12, window.innerHeight - popover.getBoundingClientRect().height - 12);
      popover.style.top = `${Math.min(Math.max(12, Number.parseFloat(popover.style.top)), maxTop)}px`;
      popover.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    });
  };

  return <div className="exercise-level-inline-editor">
    <button ref={triggerRef} className="exercise-level-inline-trigger teacher-role-trigger" type="button"
      onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-controls={popoverId}
      aria-label={`Rol van ${name} wijzigen`}>
      <TeacherRoleBadge role={role} />
    </button>
    <div ref={popoverRef} id={popoverId} className="exercise-level-popover teacher-role-popover" popover="auto"
      role="menu" aria-label="Rol" onToggle={(event) => setOpen(event.currentTarget.matches(":popover-open"))}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.hidePopover();
          triggerRef.current?.focus();
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const choices = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
          const current = choices.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1
            : (current + (event.key === "ArrowUp" ? -1 : 1) + choices.length) % choices.length;
          choices[next]?.focus();
        }
      }}>
      <strong className="teacher-role-popover-label">Rol</strong>
      <form action={async (formData) => {
        await action(formData);
        popoverRef.current?.hidePopover();
        triggerRef.current?.focus();
      }}>
        <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
        <input type="hidden" name="userId" value={userId} />
        {(["viewer", "editor"] as const).map((choice) => <button key={choice}
          className={`exercise-level-choice${choice === role ? " is-selected" : ""}`} type="submit" name="role" value={choice}
          role="menuitemradio" aria-checked={choice === role}>
          <span className="exercise-level-choice-icon">{choice === "viewer" ? <Eye size={16} aria-hidden /> : <Pencil size={16} aria-hidden />}</span>
          <span className="exercise-level-choice-label"><strong>{choice === "viewer" ? "Kijker" : "Bewerker"}</strong></span>
          {choice === role ? <Check size={17} aria-hidden /> : null}
        </button>)}
      </form>
    </div>
  </div>;
}
