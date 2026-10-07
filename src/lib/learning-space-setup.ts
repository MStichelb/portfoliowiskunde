export interface LearningSpaceSetup {
  missingProfile: boolean;
  missingSource: boolean;
}

export function setupSyncDisabledReason(setup: LearningSpaceSetup): string | null {
  if (setup.missingProfile && setup.missingSource) return "Stel eerst een bronprofiel en bron in.";
  if (setup.missingProfile) return "Stel eerst een bronprofiel in.";
  if (setup.missingSource) return "Stel eerst een bron in.";
  return null;
}

export function learningSpaceEmptyState(setup: LearningSpaceSetup, hasSuccessfulSync: boolean, collectionPlural: string): string {
  if (setup.missingProfile && setup.missingSource) return "Je inhoud verschijnt zodra de instellingen zijn aangevuld.";
  if (setup.missingSource) return "Koppel eerst een bron om inhoud te kunnen synchroniseren.";
  if (setup.missingProfile) return "Stel eerst in hoe bestanden en mappen herkend moeten worden.";
  if (!hasSuccessfulSync) return "Synchroniseer om de eerste inhoud te laden.";
  return `Nog geen ${collectionPlural.toLocaleLowerCase("nl-BE")} in deze leeromgeving.`;
}
