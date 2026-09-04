import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { UserManagementView, type UserListSearchParams } from "@/app/components/user-management-view";
import { requireAdmin } from "@/lib/auth";
import { getLearningSpaces } from "@/lib/repositories";
import {
  listKnownClassGroups,
  listManagedMemberships,
  listManagedStorageConnections,
  listManagedUserAccess,
  listManagedUsers,
} from "@/lib/user-management";

export const dynamic = "force-dynamic";

export default async function UserManagementPage({ searchParams }: { searchParams: Promise<UserListSearchParams & { error?: string; saved?: string }> }) {
  await requireAdmin();
  const [params, users, spaces, memberships, access, storageConnections, classGroups] = await Promise.all([
    searchParams,
    listManagedUsers(),
    getLearningSpaces(),
    listManagedMemberships(),
    listManagedUserAccess(),
    listManagedStorageConnections(),
    listKnownClassGroups(),
  ]);
  return <main className="page-shell admin-page user-management-page">
    <Link className="secondary-button compact-back-button" href="/admin"><ArrowLeft size={16} aria-hidden />Terug naar beheer</Link>
    <header className="page-header"><p className="eyebrow">Globaal beheer</p><h1>Gebruikers</h1><p>Beheer lokale rollen, klas, publieke toegang en accountstatus. Smartschool kent nooit zelf applicatierollen toe.</p></header>
    {params.saved ? <p className="success-message" role="status">Wijziging opgeslagen.</p> : null}
    {params.error ? <p className="form-message" role="alert">{params.error}</p> : null}
    <UserManagementView users={users} spaces={spaces} memberships={memberships} access={access} storageConnections={storageConnections} classGroups={classGroups} params={params} />
  </main>;
}
