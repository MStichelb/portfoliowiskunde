import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { DEFAULT_EXERCISE_LEVEL_PRESENTATION } from "./exercise-level-presentation";
import { getLearningSpace, updateLearningSpace, type LearningSpace } from "./repositories";

let temporaryDirectory: string | undefined;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-level-presentation-repository-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await getDatabase();
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("learning space level presentation repository", () => {
  it("stores a custom presentation without changing another LearningSpace", async () => {
    const spaceFive = (await getLearningSpace("space-5"))!;
    const spaceSixBefore = (await getLearningSpace("space-6"))!;
    expect(spaceFive.levelPresentation).toMatchObject({
      opwarmer: { symbolId: "star", count: 1 }, basis: { symbolId: "star", count: 2 },
      uitdaging: { symbolId: "star", count: 3 }, verdieping: { symbolId: "diamond", count: 1 },
    });

    const custom = {
      opwarmer: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.opwarmer, displayName: "Start", symbolId: "circle" as const, color: "#DDEEDD" },
      basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, displayName: "Kern", symbolId: "circle" as const, color: "#FFFFCC", showPublicBackground: true },
      uitdaging: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.uitdaging, displayName: "Challenge", symbolId: "circle" as const, color: "#FFDDDD" },
      verdieping: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.verdieping, displayName: "Extra", symbolId: "circle" as const, color: "#DDEEFF" },
    };
    await updateLearningSpace(spaceFive.id, inputFor(spaceFive, custom));

    expect((await getLearningSpace("space-5"))?.levelPresentation).toEqual(custom);
    expect((await getLearningSpace("space-6"))?.levelPresentation).toEqual(spaceSixBefore.levelPresentation);
    expect((await getLearningSpace("space-5"))?.levelPresentation?.basis.showPublicBackground).toBe(true);
    expect((await getLearningSpace("space-5"))?.levelPresentation?.opwarmer.showPublicBackground).toBe(false);
  });
});

function inputFor(space: LearningSpace, levelPresentation: NonNullable<LearningSpace["levelPresentation"]>) {
  return {
    subjectId: space.subjectId, collectionLabelSingular: space.collectionLabelSingular, collectionLabelPlural: space.collectionLabelPlural,
    exerciseLabelSingular: space.exerciseLabelSingular, exerciseLabelPlural: space.exerciseLabelPlural,
    name: space.name, slug: space.slug, shortLabel: space.shortLabel, description: space.description, cardColor: space.cardColor,
    sortOrder: space.sortOrder, sourceType: space.sourceType, localSourcePath: space.localSourcePath,
    oneDriveDriveId: space.oneDriveDriveId, oneDriveFolderId: space.oneDriveFolderId, oneDriveFolderPath: space.oneDriveFolderPath,
    googleDriveFolderId: space.googleDriveFolderId, googleDriveFolderLabel: space.googleDriveFolderLabel, levelPresentation,
  };
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
      if (attempt === 9) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
