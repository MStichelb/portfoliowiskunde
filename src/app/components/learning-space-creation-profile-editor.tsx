"use client";

import type { SourceProfileConfig } from "@/lib/source-profile-config";
import { SourceProfileExerciseConfigurationEditors } from "./source-profile-exercise-configuration-editors";
import { SourceProfileGlobalResourcesEditor } from "./source-profile-global-resources-editor";

export function LearningSpaceCreationProfileEditor({ config, draftKey }: { config: SourceProfileConfig; draftKey: string }) {
  return <div className="creation-profile-editor">
    <h4>Je eigen bronprofiel aanpassen</h4>
    <p>Je werkt aan een eigen concept. Het wordt samen met de leeromgeving opgeslagen als je definitief aanmaakt.</p>
    <SourceProfileGlobalResourcesEditor resources={config.globalResources} ownerIdField="sourceProfileId" ownerId={draftKey} embedded />
    <SourceProfileExerciseConfigurationEditors portfolioScanner={config.scanner.portfolio} scanner={config.scanner.exercise} resources={config.exerciseResources} levelRecognition={config.levelRecognition} ownerIdField="sourceProfileId" ownerId={draftKey} editorKey={draftKey} />
  </div>;
}
