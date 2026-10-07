"use client";

import type { ReactNode } from "react";
import type { ManagedSourceProfile } from "@/lib/source-profiles";
import type { SourceProfilePresentationSpace } from "@/lib/source-profile-presentation";
import { SourceProfilePresentation, SourceProfileViewContext } from "./source-profile-presentation";
import { SourceProfileExerciseConfigurationEditors } from "./source-profile-exercise-configuration-editors";

export function SourceProfileReadonlyView({ profile, presentationSpaces, contextSpaceId, closeAction }: {
  profile: ManagedSourceProfile;
  presentationSpaces: SourceProfilePresentationSpace[];
  contextSpaceId?: string;
  closeAction?: ReactNode;
}) {
  return <div className="source-profile-readonly-config"><SourceProfilePresentation spaces={presentationSpaces} linkedSpaceCount={profile.usageCount} contextSpaceId={contextSpaceId}>
    <div className="source-profile-dialog-heading source-profile-dialog-heading-sticky"><h2 id="manage-source-profile-title">Bronprofiel bekijken</h2><div className="source-profile-dialog-heading-actions"><SourceProfileViewContext />{closeAction}</div></div>
    <SourceProfileExerciseConfigurationEditors overview={<div className="source-profile-central-usage"><span>Profielnaam</span><strong>{profile.name}</strong><span>{profile.isInactive ? "Inactief" : `Gebruikt in: ${profile.usages.map((usage) => usage.learningSpaceShortLabel).join(", ")}`}</span><small>Alleen bekijken{profile.ownerName ? ` · Eigenaar: ${profile.ownerName}` : ""}</small></div>} readOnly globalResources={profile.config.globalResources} portfolioScanner={profile.config.scanner.portfolio} scanner={profile.config.scanner.exercise} resources={profile.config.exerciseResources} levelRecognition={profile.config.levelRecognition} ownerIdField="sourceProfileId" ownerId={profile.id} editorKey={profile.id} />
  </SourceProfilePresentation></div>;
}
