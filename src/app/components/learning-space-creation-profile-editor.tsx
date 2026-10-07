"use client";

import type { SourceProfileConfig } from "@/lib/source-profile-config";
import { SourceProfileExerciseConfigurationEditors } from "./source-profile-exercise-configuration-editors";

export function LearningSpaceCreationProfileEditor({ config, draftKey }: { config: SourceProfileConfig; draftKey: string }) {
  return <div className="creation-profile-editor">
    <SourceProfileExerciseConfigurationEditors overview={<p>Je werkt aan een eigen concept. Het wordt samen met de leeromgeving opgeslagen als je definitief aanmaakt.</p>} globalResources={config.globalResources} portfolioScanner={config.scanner.portfolio} scanner={config.scanner.exercise} resources={config.exerciseResources} levelRecognition={config.levelRecognition} ownerIdField="sourceProfileId" ownerId={draftKey} editorKey={draftKey} />
  </div>;
}
