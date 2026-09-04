import { ArrowLeft, KeyRound, Link2, ShieldCheck, Trash2, UserCog, Users } from "lucide-react";
import Link from "next/link";

import { AutoSubmitSelect } from "@/app/components/auto-submit-select";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { requireAdmin } from "@/lib/auth";
import { getConfiguredTeacherGroupId } from "@/lib/identity";
import { getLearningSpaces } from "@/lib/repositories";
import {
  listKnownExternalGroups,
  listManagedGroupMappings,
  listManagedGroupUsers,
  listManagedMemberships,
  listManagedSourceOwners,
  listManagedUsers,
} from "@/lib/user-management";

import {
  createGroupMappingAction,
  removeGroupMappingAction,
  removeMembershipAction,
  saveMembershipAction,
  updateTeacherGroupAction,
} from "../gebruikers/actions";

export const dynamic = "force-dynamic";

export default async function AccessManagementPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; group?: string }> }) {
  await requireAdmin();
  const [params, users, spaces, memberships, mappings, groups, groupUsers, sourceOwners, teacherGroupId] = await Promise.all([
    searchParams,
    listManagedUsers(),
    getLearningSpaces(),
    listManagedMemberships(),
    listManagedGroupMappings(),
    listKnownExternalGroups(),
    listManagedGroupUsers(),
    listManagedSourceOwners(),
    getConfiguredTeacherGroupId(),
  ]);
  const teachers = users.filter((user) => user.role === "teacher" && user.status === "active");
  const smartschoolGroups = groups.filter((group) => group.provider === "smartschool");
  const selectedGroup = smartschoolGroups.find((group) => group.externalGroupId === params.group) ?? null;
  const selectedUsers = selectedGroup ? groupUsers.filter((item) => item.provider === selectedGroup.provider && item.externalGroupId === selectedGroup.externalGroupId) : [];

  return <main className="page-shell admin-page access-management-page">
    <Link className="secondary-button compact-back-button" href="/admin"><ArrowLeft size={16} aria-hidden />Terug naar beheer</Link>
    <header className="page-header"><p className="eyebrow">Globaal beheer</p><h1>Toegang</h1><p>Beheer automatische Smartschooltoegang, individuele uitzonderingen en gedeeld beheer als afzonderlijke rechten.</p></header>
    {params.saved ? <p className="success-message" role="status">Wijziging opgeslagen.</p> : null}
    {params.error ? <p className="form-message" role="alert">{params.error}</p> : null}

    <section className="admin-card" aria-labelledby="teacher-detection-heading">
      <div className="card-heading"><div><h2 id="teacher-detection-heading" className="heading-with-icon"><ShieldCheck size={20} aria-hidden />Automatische lerarenherkenning</h2><p>Deze groupID bepaalt alleen de startrol wanneer een nieuwe Smartschoolidentiteit voor het eerst wordt geregistreerd. Bestaande rollen veranderen nooit automatisch.</p></div></div>
      <AutoSubmitSelect action={updateTeacherGroupAction} fields={{}} name="groupId" value={teacherGroupId ?? ""} ariaLabel="Groep voor automatische lerarenherkenning" className="teacher-group-setting" options={[{ value: "", label: "Geen automatische lerarenherkenning" }, ...smartschoolGroups.map((group) => ({ value: group.externalGroupId, label: group.externalGroupName ?? group.externalGroupId }))]} />
    </section>

    <section className="admin-card" aria-labelledby="mappings-heading">
      <div className="card-heading"><div><h2 id="mappings-heading" className="heading-with-icon"><Link2 size={20} aria-hidden />Smartschoolgroepen koppelen</h2><p>Een koppeling geeft leerlingen en leraren automatisch publieke toegang. Individuele extra toegang beheer je bij de gebruiker; owner/editor-rechten staan onder Gedeeld beheer.</p></div></div>
      <form action={createGroupMappingAction} className="group-mapping-form"><input type="hidden" name="provider" value="smartschool" /><label>Smartschoolgroep<select name="externalGroupId" required defaultValue=""><option value="" disabled>Kies bekende groep</option>{smartschoolGroups.map((group) => <option key={group.externalGroupId} value={group.externalGroupId}>{group.externalGroupName ?? group.externalGroupId}</option>)}</select></label><span aria-hidden>→</span><label>Leeromgeving<select name="learningSpaceId" required defaultValue=""><option value="" disabled>Kies leeromgeving</option>{spaces.filter((space) => space.isActive).map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label><button className="primary-button" type="submit" disabled={smartschoolGroups.length === 0}>Groep koppelen</button></form>
      {mappings.length ? <ul className="group-mapping-list">{mappings.map((mapping) => <li key={mapping.id}><span><strong>{mapping.externalGroupName ?? mapping.externalGroupId}</strong><small>{mapping.externalGroupId}</small></span><span aria-hidden>→</span><strong>{spaces.find((space) => space.id === mapping.learningSpaceId)?.name ?? "Onbekende leeromgeving"}</strong><ConfirmActionButton action={removeGroupMappingAction} fields={{ id: mapping.id }} label={<Trash2 size={16} aria-hidden />} confirmTitle="Groepskoppeling verwijderen?" confirmText="De automatische publieke toegang via deze Smartschoolgroep valt weg. Individuele en managementtoegang blijven behouden." /></li>)}</ul> : <p className="empty-state compact-empty">Nog geen groepen gekoppeld.</p>}
    </section>

    <section className="admin-card" aria-labelledby="group-users-heading">
      <div className="card-heading"><div><h2 id="group-users-heading" className="heading-with-icon"><Users size={20} aria-hidden />Automatische toegang controleren</h2><p>Hier verschijnen alleen gebruikers met een opgeslagen Smartschoolgroepssnapshot.</p></div></div>
      <form className="group-user-filter" method="get"><label>Smartschoolgroep<select name="group" defaultValue={selectedGroup?.externalGroupId ?? ""} required><option value="" disabled>Kies een Smartschoolgroep</option>{smartschoolGroups.map((group) => <option key={group.externalGroupId} value={group.externalGroupId}>{group.externalGroupName ?? group.externalGroupId}</option>)}</select></label><button className="secondary-button" type="submit">Tonen</button></form>
      {selectedGroup ? <div className="admin-summary-table" role="region" aria-label={`Gebruikers in ${selectedGroup.externalGroupName ?? selectedGroup.externalGroupId}`} tabIndex={0}><table><thead><tr><th>Naam</th><th>Lokale rol</th><th>Status</th><th>Leeromgevingen via groep</th></tr></thead><tbody>{selectedUsers.map((groupUser) => <tr key={groupUser.userId}><td><strong>{groupUser.displayName}</strong></td><td>{roleLabel(groupUser.role)}</td><td>{groupUser.status === "active" ? "Actief" : "Uitgeschakeld"}</td><td>{mappedSpaceNames(selectedGroup.externalGroupId, mappings, spaces) || "Geen koppeling"}</td></tr>)}</tbody></table>{selectedUsers.length === 0 ? <p className="empty-state compact-empty">Nog geen aangemelde gebruikers in deze groep.</p> : null}</div> : null}
    </section>

    <section className="admin-card" aria-labelledby="memberships-heading">
      <div className="card-heading"><div><h2 id="memberships-heading" className="heading-with-icon"><UserCog size={20} aria-hidden />Gedeeld beheer</h2><p>Eigenaars beheren ook bronnen. Editors beheren dagelijkse inhoud, publicatie en synchronisatie. Dit staat los van publieke kijktoegang.</p></div></div>
      <div className="management-space-grid">{spaces.map((space) => {
        const members = memberships.filter((membership) => membership.learningSpaceId === space.id);
        const sources = sourceOwners.filter((source) => source.learningSpaceId === space.id);
        return <article className="management-space-card" key={space.id}><h3>{space.name}</h3><div className="source-owner-summary">{sources.map((source) => <p key={source.sourceRole}><strong>{source.sourceRole === "primary" ? "Primaire bron" : "Mirror"}</strong><span className={`provider-badge provider-${source.provider}`}>{providerLabel(source.provider)}</span>{source.ownerName ? <span>{source.ownerName} · {source.connectionName}</span> : <span>Geen persoonlijke verbinding</span>}</p>)}</div>{members.length ? <ul className="management-list">{members.map((member) => <li key={member.userId}><span><KeyRound size={15} aria-hidden />{member.displayName} · {member.role === "owner" ? "Eigenaar" : "Editor"}</span><ConfirmActionButton action={removeMembershipAction} fields={{ learningSpaceId: space.id, userId: member.userId }} label={<Trash2 size={16} aria-hidden />} confirmTitle="Beheerrecht verwijderen?" confirmText={`${member.displayName} verliest het ${member.role === "owner" ? "eigenaarschap" : "editorrecht"} voor ${space.name}.`} /></li>)}</ul> : <p className="empty-state compact-empty">Nog geen leraar-memberships.</p>}<form action={saveMembershipAction} className="management-add-form"><input type="hidden" name="learningSpaceId" value={space.id} /><label>Leraar<select name="userId" required defaultValue=""><option value="" disabled>Kies leraar</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>)}</select></label><label>Beheerrol<select name="role" defaultValue="editor"><option value="editor">Editor</option><option value="owner">Eigenaar</option></select></label><button className="secondary-button" type="submit" disabled={teachers.length === 0}>Toevoegen of wijzigen</button></form></article>;
      })}</div>
    </section>
  </main>;
}

function roleLabel(role: "superadmin" | "teacher" | "student"): string {
  if (role === "superadmin") return "Hoofdbeheerder";
  if (role === "teacher") return "Leraar";
  return "Leerling";
}

function mappedSpaceNames(groupId: string, mappings: Awaited<ReturnType<typeof listManagedGroupMappings>>, spaces: Awaited<ReturnType<typeof getLearningSpaces>>): string {
  return mappings.filter((mapping) => mapping.provider === "smartschool" && mapping.externalGroupId === groupId)
    .map((mapping) => spaces.find((space) => space.id === mapping.learningSpaceId)?.name).filter(Boolean).join(", ");
}

function providerLabel(provider: string): string {
  if (provider === "onedrive") return "OneDrive";
  if (provider === "google_drive") return "Google Drive";
  return "Lokale testbron";
}
