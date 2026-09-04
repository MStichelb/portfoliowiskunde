import { notFound } from "next/navigation";
import { KeyRound, Trash2, UserCog } from "lucide-react";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { LearningSpaceLifecycleActions } from "@/app/components/learning-space-lifecycle-actions";
import { LearningSpaceSettingsForm } from "@/app/components/learning-space-settings-form";
import { SourceSwitchPanel } from "@/app/components/source-switch-panel";
import { requireAdminUser } from "@/lib/auth";
import { canConfigureLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug } from "@/lib/repositories";
import { listManagedMemberships, listManagedUsers } from "@/lib/user-management";

import { saveLearningSpaceAction } from "../../actions";
import { addLearningSpaceEditorAction, removeLearningSpaceEditorAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LearningSpaceSettingsPage({ params, searchParams }: { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ saved?: string; memberSaved?: string; memberError?: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const [query, space] = await Promise.all([searchParams, getAdminLearningSpaceBySlug(spaceSlug)]);
  if (!space || !await canConfigureLearningSpace(user, space.id)) notFound();
  const [users, memberships] = await Promise.all([listManagedUsers(), listManagedMemberships()]);
  const activeTeachers = users.filter((candidate) => candidate.role === "teacher" && candidate.status === "active");
  const members = memberships.filter((membership) => membership.learningSpaceId === space.id);
  const editors = members.filter((membership) => membership.role === "editor");
  const owners = members.filter((membership) => membership.role === "owner");
  const availableEditors = activeTeachers.filter((teacher) => !members.some((member) => member.userId === teacher.id));
  return <main className="page-shell admin-page admin-space-page learning-space-settings-page">
    <AdminSpaceHeader current={space} section="settings" user={user} />
    {!space.isActive ? <p className="archived-message" role="status">Gearchiveerd. Deze leeromgeving is niet publiek zichtbaar en wordt niet gesynchroniseerd.</p> : null}
    {query.saved === "1" ? <p className="success-message save-feedback" role="status">Instellingen opgeslagen.</p> : null}
    {query.memberSaved === "1" ? <p className="success-message save-feedback" role="status">Beheerrechten bijgewerkt.</p> : null}
    {query.memberError ? <p className="form-message" role="alert">{query.memberError}</p> : null}
    <LearningSpaceSettingsForm space={space} action={saveLearningSpaceAction} />
    <section className="settings-section learning-space-managers" aria-labelledby="space-managers-heading"><div className="card-heading"><div><h2 id="space-managers-heading" className="heading-with-icon"><UserCog size={20} aria-hidden />Beheerders van deze leeromgeving</h2><p>Eigenaars en hoofdbeheerders kunnen bestaande leraren als editor toevoegen. Publieke toegang staat hier los van.</p></div></div>
      <div className="manager-role-groups"><div><h3>Eigenaars</h3>{owners.length ? <ul>{owners.map((owner) => <li key={owner.userId}><KeyRound size={15} aria-hidden />{owner.displayName}</li>)}</ul> : <p className="muted-value">Alleen de hoofdbeheerder.</p>}</div><div><h3>Editors</h3>{editors.length ? <ul>{editors.map((editor) => <li key={editor.userId}><span>{editor.displayName}</span><ConfirmActionButton action={removeLearningSpaceEditorAction} fields={{ learningSpaceId: space.id, userId: editor.userId }} label={<Trash2 size={16} aria-hidden />} confirmTitle="Editor verwijderen?" confirmText={`${editor.displayName} kan ${space.name} daarna niet langer beheren.`} /></li>)}</ul> : <p className="muted-value">Nog geen editors.</p>}</div></div>
      <form action={addLearningSpaceEditorAction} className="management-add-form"><input type="hidden" name="learningSpaceId" value={space.id} /><label>Leraar<select name="userId" defaultValue="" required disabled={availableEditors.length === 0}><option value="" disabled>{availableEditors.length ? "Kies een leraar" : "Geen beschikbare leraren"}</option>{availableEditors.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>)}</select></label><button className="secondary-button" type="submit" disabled={availableEditors.length === 0}>Als editor toevoegen</button></form>
    </section>
    {space.isActive ? <SourceSwitchPanel space={space} /> : null}
    {user.role === "superadmin" ? <section className="settings-section" aria-labelledby="lifecycle-heading"><h2 id="lifecycle-heading">Status leeromgeving</h2><p>{space.isActive ? "Archiveer deze leeromgeving om alle instellingen te bewaren zonder ze publiek te tonen of te synchroniseren." : "Herstel deze leeromgeving om ze opnieuw publiek beschikbaar en synchroniseerbaar te maken. Permanent verwijderen wist alleen de databasegegevens; bronbestanden blijven onaangeraakt."}</p><LearningSpaceLifecycleActions space={space} showManage={false} /></section> : null}
  </main>;
}
