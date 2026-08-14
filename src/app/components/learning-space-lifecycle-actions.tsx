import { Archive, RotateCcw, Settings, Trash2 } from "lucide-react";
import Link from "next/link";

import { archiveLearningSpaceAction, permanentlyDeleteLearningSpaceAction, restoreLearningSpaceAction } from "@/app/admin/actions";
import { canPermanentlyDeleteLearningSpace, getLearningSpaceLifecycleActions } from "@/lib/learning-space-lifecycle";
import type { LearningSpace } from "@/lib/repositories";

import { ConfirmActionButton } from "./confirm-action-button";

export function LearningSpaceLifecycleActions({ space, showManage = true }: { space: LearningSpace; showManage?: boolean }) {
  const actions = getLearningSpaceLifecycleActions(space.isActive);

  return <div className="space-list-actions">
    {showManage && actions.includes("manage") ? <Link className="secondary-button link-button" href={`/admin/${encodeURIComponent(space.slug)}/instellingen`}><Settings size={16} aria-hidden />Beheren</Link> : null}
    {actions.includes("archive") ? <form action={archiveLearningSpaceAction}>
      <input type="hidden" name="id" value={space.id} />
      <button className="secondary-button" type="submit"><Archive size={16} aria-hidden />Archiveren</button>
    </form> : null}
    {actions.includes("restore") ? <form action={restoreLearningSpaceAction}>
      <input type="hidden" name="id" value={space.id} />
      <button className="secondary-button restore-button" type="submit"><RotateCcw size={16} aria-hidden />Herstellen</button>
    </form> : null}
    {actions.includes("delete") && canPermanentlyDeleteLearningSpace(space) ? <ConfirmActionButton
      action={permanentlyDeleteLearningSpaceAction}
      fields={{ id: space.id, confirmationSlug: space.slug }}
      className="danger-button"
      label={<><Trash2 size={16} aria-hidden />Verwijderen</>}
      confirmTitle={`Leeromgeving "${space.slug}" permanent verwijderen?`}
      confirmText={`Alle instellingen en geindexeerde metadata van leeromgeving "${space.slug}" worden verwijderd. Bronbestanden worden niet verwijderd.`}
    /> : null}
  </div>;
}
