import { Link2, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import type { AvailableSourceProfile } from "@/lib/source-profiles";
import { sourceProfileUsageLabel } from "@/lib/source-profile-usage";
import { MISSING_PROFILE_MESSAGE } from "@/lib/learning-space-creation-wizard";
import type { SourceProfileTemplateSummary } from "@/lib/source-profile-templates";
import { copyManagedSourceProfileTemplateAction } from "@/app/admin/bronprofielen/actions";

export function SourceProfileCard({ profile, canConfigure, learningSpaceId, templates = [] }: {
  profile: AvailableSourceProfile | null;
  canConfigure: boolean;
  learningSpaceId?: string;
  templates?: SourceProfileTemplateSummary[];
}) {
  if (!profile) return <section id="source-profile-settings" className="settings-card source-profile-card"><h2>Bronprofiel</h2><p className="archived-message">{MISSING_PROFILE_MESSAGE}</p>{canConfigure && learningSpaceId ? <form action={copyManagedSourceProfileTemplateAction} className="settings-grid"><input type="hidden" name="managementLearningSpaceId" value={learningSpaceId} /><label>Sjabloon<select name="templateId" required defaultValue={templates.find((template) => template.isDefault)?.id ?? templates[0]?.id}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><button type="submit" className="primary-button">Eigen bronprofiel instellen</button></form> : null}</section>;
  const isShared = profile.usageCount > 1;
  return <section id="source-profile-settings" className="settings-card source-profile-card" aria-labelledby="source-profile-heading">
    <div className="source-profile-heading">
      <div>
        <h2 id="source-profile-heading">Bronprofiel</h2>
        <p>Het bronprofiel bepaalt hoe bestanden en mappen in de bron worden geïnterpreteerd.</p>
      </div>
      <Link className="secondary-button link-button source-profile-management-link" href={learningSpaceId ? `/admin/bronprofielen?profile=${encodeURIComponent(profile.id)}&space=${encodeURIComponent(learningSpaceId)}` : "/admin/bronprofielen"}>
        <SlidersHorizontal size={16} aria-hidden />Bronprofielen {canConfigure ? "beheren" : "bekijken"}
      </Link>
    </div>
    <div className="source-profile-summary">
      <span>Actief profiel</span>
      <strong>{profile.name}</strong>
      {profile.ownerName ? <small>Eigenaar: {profile.ownerName}</small> : null}
      {isShared ? <>
        <span className="source-profile-shared-status"><Link2 size={15} aria-hidden />Gekoppeld aan {profile.usageCount} leeromgevingen</span>
        <p className="source-profile-shared-usage">Gebruikt in: <strong>{sourceProfileUsageLabel(profile.usages)}</strong></p>
      </> : null}
      {profile.description ? <p>{displayProfileDescription(profile.description)}</p> : null}
    </div>
  </section>;
}

export function displayProfileDescription(description: string): string {
  return description === "Appbreed standaardsjabloon voor de huidige portfolio- en bestandsconventies."
    ? "Gebaseerd op het appbrede standaardsjabloon."
    : description;
}
