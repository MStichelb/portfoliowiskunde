import { Link2, Users } from "lucide-react";
import Link from "next/link";

import { AdminLearningSpaceOverview } from "@/app/components/admin-learning-space-overview";
import { LearningSpaceCreateModal } from "@/app/components/learning-space-create-modal";
import { PageBanner } from "@/app/components/page-banner";
import { buildAdminLearningSpaceCards, providerLabel } from "@/lib/admin-learning-space-overview";
import { requireAdminUser } from "@/lib/auth";
import { getManageableLearningSpaceIds } from "@/lib/authorization";
import { getLearningSpaces, type LearningSpace } from "@/lib/repositories";
import { listManagedGroupMappings, listManagedMemberships } from "@/lib/user-management";

import { createLearningSpaceAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ smartschool?: string; create?: string; createError?: string; created?: string; error?: string }> }) {
  const user = await requireAdminUser();
  const [allSpaces, activeManageableIds, memberships, groupMappings, params] = await Promise.all([
    getLearningSpaces(),
    getManageableLearningSpaceIds(user),
    listManagedMemberships(),
    listManagedGroupMappings(),
    searchParams,
  ]);
  const cards = buildAdminLearningSpaceCards({ spaces: allSpaces, activeManageableIds, memberships, groupMappings, user });
  return <main className="page-shell admin-page">
    <PageBanner variant="admin" />
    <header className="admin-header">
      <div><p className="eyebrow">Beheer</p><h1>Leeromgevingen</h1><p>Kies een leeromgeving om portfolio&apos;s binnen deze leeromgeving te beheren.</p></div>
      <div className="admin-actions"><Link className="secondary-button link-button" href="/admin/verbindingen"><Link2 size={17} aria-hidden />Verbindingen</Link>{user.role === "superadmin" ? <Link className="secondary-button link-button" href="/admin/gebruikers"><Users size={17} aria-hidden />Gebruikers</Link> : null}<LearningSpaceCreateModal action={createLearningSpaceAction} initialOpen={params.create === "1"} error={createErrorMessage(params.createError)} /></div>
    </header>
    {params.smartschool === "linked" ? <p className="success-message" role="status">Smartschool-account gekoppeld.</p> : null}
    {params.smartschool && params.smartschool !== "linked" ? <p className="error-message" role="alert">De Smartschool-koppeling is niet gelukt.</p> : null}
    {params.created === "1" ? <p className="success-message" role="status">Leeromgeving toegevoegd.</p> : null}
    {adminErrorMessage(params.error) ? <p className="error-message" role="alert">{adminErrorMessage(params.error)}</p> : null}
    <AdminLearningSpaceOverview cards={cards} />
  </main>;
}

function createErrorMessage(error: string | undefined): string | null {
  if (error === "duplicate") return "Deze URL bestaat al. Kies een andere URL.";
  if (error === "invalid") return "Controleer de ingevulde gegevens.";
  return null;
}

function adminErrorMessage(error: string | undefined): string | null {
  if (error === "archive-before-delete") return "Archiveer de leeromgeving eerst voordat je ze permanent verwijdert.";
  if (error === "delete-failed") return "De leeromgeving kon niet worden verwijderd. Vernieuw de pagina en probeer opnieuw.";
  return null;
}

export function sourceSummary(space: LearningSpace): string {
  const primary = space.primarySource ? providerLabel(space.primarySource.providerType) : providerLabel(space.sourceType);
  const mirror = space.mirrorSource ? ` · Mirror • ${providerLabel(space.mirrorSource.providerType)}` : "";
  return `Bron • ${primary}${mirror}`;
}
