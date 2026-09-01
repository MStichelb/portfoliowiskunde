import { ArrowLeft, Link2, ShieldCheck, Trash2, UserCog, Users } from "lucide-react";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { getLearningSpaces } from "@/lib/repositories";
import {
  listKnownExternalGroups,
  listManagedGroupMappings,
  listManagedMemberships,
  listManagedSourceOwners,
  listManagedUsers,
} from "@/lib/user-management";

import {
  createGroupMappingAction,
  removeGroupMappingAction,
  removeMembershipAction,
  saveMembershipAction,
  updateUserRoleAction,
  updateUserStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function UserManagementPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireAdmin();
  const [params, users, spaces, memberships, mappings, groups, sourceOwners] = await Promise.all([
    searchParams, listManagedUsers(), getLearningSpaces(), listManagedMemberships(), listManagedGroupMappings(), listKnownExternalGroups(), listManagedSourceOwners(),
  ]);
  const teachers = users.filter((user) => user.role === "teacher" && user.status === "active");
  const smartschoolGroups = groups.filter((group) => group.provider === "smartschool");
  return <main className="page-shell admin-page user-management-page">
    <Link className="secondary-button compact-back-button" href="/admin"><ArrowLeft size={16} aria-hidden />Terug naar beheer</Link>
    <header className="page-header"><p className="eyebrow">Globaal beheer</p><h1>Gebruikers en toegang</h1><p>Beheer lokale rollen, gedeeld beheer en expliciete Smartschoolgroep-koppelingen. Smartschool kent nooit zelf beheerrollen toe.</p></header>
    {params.saved ? <p className="success-message" role="status">Wijziging opgeslagen.</p> : null}
    {params.error ? <p className="form-message" role="alert">{params.error}</p> : null}
    <section className="admin-card" aria-labelledby="users-heading"><div className="card-heading"><div><h2 id="users-heading" className="heading-with-icon"><Users size={20} aria-hidden />Gebruikers</h2><p>Rollen en status worden lokaal bepaald.</p></div></div>
      <div className="admin-summary-table" role="region" aria-label="Gebruikers" tabIndex={0}><table><thead><tr><th>Naam</th><th>Rol</th><th>Status</th><th>Smartschool</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.displayName}</strong>{user.email ? <small>{user.email}</small> : null}</td><td>{user.role === "superadmin" ? "Hoofdbeheerder" : <form action={updateUserRoleAction} className="inline-management-form"><input type="hidden" name="userId" value={user.id} /><select name="role" defaultValue={user.role} aria-label={`Rol van ${user.displayName}`}><option value="student">Leerling</option><option value="teacher">Leraar</option></select><button className="secondary-button" type="submit">Opslaan</button></form>}</td><td><form action={updateUserStatusAction} className="inline-management-form"><input type="hidden" name="userId" value={user.id} /><select name="status" defaultValue={user.status} aria-label={`Status van ${user.displayName}`}><option value="active">Actief</option><option value="disabled">Uitgeschakeld</option></select><button className="secondary-button" type="submit">Opslaan</button></form></td><td>{user.hasSmartschoolIdentity ? <span className="status-inline"><ShieldCheck size={16} aria-hidden />Gekoppeld</span> : "Niet gekoppeld"}</td></tr>)}</tbody></table></div>
    </section>
    <section className="admin-card" aria-labelledby="memberships-heading"><div className="card-heading"><div><h2 id="memberships-heading" className="heading-with-icon"><UserCog size={20} aria-hidden />Gedeeld beheer</h2><p>Eigenaars beheren ook bronnen. Editors beheren dagelijkse inhoud, publicatie en synchronisatie.</p></div></div><div className="management-space-grid">{spaces.map((space) => {
        const members = memberships.filter((membership) => membership.learningSpaceId === space.id);
        const owners = sourceOwners.filter((source) => source.learningSpaceId === space.id);
        return <article className="management-space-card" key={space.id}><h3>{space.name}</h3><div className="source-owner-summary">{owners.map((source) => <p key={source.sourceRole}><strong>{source.sourceRole === "primary" ? "Primaire bron" : "Mirror"}:</strong> {source.ownerName ? `${source.ownerName} (${source.connectionName})` : `${providerLabel(source.provider)} zonder persoonlijke verbinding`}{source.isActive ? " · actief" : ""}</p>)}</div>{members.length ? <ul className="management-list">{members.map((member) => <li key={member.userId}><span>{member.displayName} · {member.role === "owner" ? "Eigenaar" : "Editor"}</span><form action={removeMembershipAction}><input type="hidden" name="learningSpaceId" value={space.id} /><input type="hidden" name="userId" value={member.userId} /><button className="icon-button" type="submit" aria-label={`${member.displayName} verwijderen uit ${space.name}`} title="Membership verwijderen"><Trash2 size={16} aria-hidden /></button></form></li>)}</ul> : <p className="empty-state compact-empty">Nog geen leraar-memberships.</p>}<form action={saveMembershipAction} className="management-add-form"><input type="hidden" name="learningSpaceId" value={space.id} /><label>Leraar<select name="userId" required defaultValue=""><option value="" disabled>Kies leraar</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>)}</select></label><label>Beheerrol<select name="role" defaultValue="editor"><option value="editor">Editor</option><option value="owner">Eigenaar</option></select></label><button className="secondary-button" type="submit" disabled={teachers.length === 0}>Toevoegen of wijzigen</button></form></article>;
      })}</div></section>
    <section className="admin-card" aria-labelledby="mappings-heading"><div className="card-heading"><div><h2 id="mappings-heading" className="heading-with-icon"><Link2 size={20} aria-hidden />Smartschoolgroepen</h2><p>Toegang volgt uitsluitend uit een expliciete groupID-koppeling, nooit uit de groepsnaam.</p></div></div><div className="management-space-grid">{spaces.map((space) => {
        const spaceMappings = mappings.filter((mapping) => mapping.learningSpaceId === space.id);
        return <article className="management-space-card" key={space.id}><h3>{space.name}</h3>{spaceMappings.length ? <ul className="management-list">{spaceMappings.map((mapping) => <li key={mapping.id}><span>{mapping.externalGroupName ?? mapping.externalGroupId}<small>{mapping.externalGroupId}</small></span><form action={removeGroupMappingAction}><input type="hidden" name="id" value={mapping.id} /><button className="icon-button" type="submit" aria-label={`Koppeling ${mapping.externalGroupName ?? mapping.externalGroupId} verwijderen`}><Trash2 size={16} aria-hidden /></button></form></li>)}</ul> : <p className="empty-state compact-empty">Nog geen groep gekoppeld.</p>}<form action={createGroupMappingAction} className="management-add-form"><input type="hidden" name="learningSpaceId" value={space.id} /><input type="hidden" name="provider" value="smartschool" /><label>Smartschoolgroep<select name="externalGroupId" required defaultValue=""><option value="" disabled>Kies bekende groep</option>{smartschoolGroups.map((group) => <option key={group.externalGroupId} value={group.externalGroupId}>{group.externalGroupName ?? group.externalGroupId}</option>)}</select></label><button className="secondary-button" type="submit" disabled={smartschoolGroups.length === 0}>Koppelen</button></form></article>;
      })}</div></section>
  </main>;
}

function providerLabel(provider: string): string {
  if (provider === "onedrive") return "OneDrive";
  if (provider === "google_drive") return "Google Drive";
  return "Lokale bron";
}
