import { Archive, RotateCcw, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { archiveLearningSpaceAction, permanentlyDeleteLearningSpaceAction, restoreLearningSpaceAction } from "@/app/admin/actions";
import { canPermanentlyDeleteLearningSpace, getLearningSpaceLifecycleActions } from "@/lib/learning-space-lifecycle";
import type { LearningSpace } from "@/lib/repositories";

import { ConfirmActionButton } from "./confirm-action-button";

interface LearningSpaceLifecycleActionsProps {
  space: LearningSpace;
  showManage?: boolean;
  showDelete?: boolean;
  embeddedInForm?: boolean;
  deleteLabel?: string;
  deleteConfirmTitle?: string;
  deleteConfirmText?: string;
}

export function LearningSpaceLifecycleActions({
  space,
  showManage = true,
  showDelete = true,
  embeddedInForm = false,
  deleteLabel = "Verwijderen",
  deleteConfirmTitle = `Leeromgeving "${space.slug}" permanent verwijderen?`,
  deleteConfirmText = `Alle instellingen en geindexeerde metadata van leeromgeving "${space.slug}" worden verwijderd. Bronbestanden worden niet verwijderd.`,
}: LearningSpaceLifecycleActionsProps) {
  const actions = getLearningSpaceLifecycleActions(space.isActive);

  return <div className="space-list-actions">
    {showManage && actions.includes("manage") ? <Link className="secondary-button link-button" href={`/admin/${encodeURIComponent(space.slug)}/instellingen`}><Settings size={16} aria-hidden />Beheren</Link> : null}
    {actions.includes("archive") ? <LifecycleSubmitButton action={archiveLearningSpaceAction} embeddedInForm={embeddedInForm} id={space.id} className="secondary-button"><Archive size={16} aria-hidden />Archiveren</LifecycleSubmitButton> : null}
    {actions.includes("restore") ? <LifecycleSubmitButton action={restoreLearningSpaceAction} embeddedInForm={embeddedInForm} id={space.id} className="secondary-button restore-button"><RotateCcw size={16} aria-hidden />Herstellen</LifecycleSubmitButton> : null}
    {showDelete && actions.includes("delete") && canPermanentlyDeleteLearningSpace(space) ? <ConfirmActionButton
      action={permanentlyDeleteLearningSpaceAction}
      fields={embeddedInForm ? { confirmationSlug: space.slug } : { id: space.id, confirmationSlug: space.slug }}
      className="danger-button"
      label={<><Trash2 size={16} aria-hidden />{deleteLabel}</>}
      confirmTitle={deleteConfirmTitle}
      confirmText={deleteConfirmText}
      submitWithinParentForm={embeddedInForm}
    /> : null}
  </div>;
}

function LifecycleSubmitButton({ action, embeddedInForm, id, className, children }: {
  action: (formData: FormData) => void | Promise<void>;
  embeddedInForm: boolean;
  id: string;
  className: string;
  children: ReactNode;
}) {
  if (embeddedInForm) return <button className={className} type="submit" formAction={action}>{children}</button>;
  return <form action={action}>
    <input type="hidden" name="id" value={id} />
    <button className={className} type="submit">{children}</button>
  </form>;
}
