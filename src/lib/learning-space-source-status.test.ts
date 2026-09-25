import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AuthorizationError } from "./authorization";
import { getDatabase, resetDatabaseForTests } from "./database";
import type { IndexedPortfolio, IndexWarning } from "./domain";
import type { AppUser } from "./identity";
import { getLearningSpaceSourceStatus } from "./learning-space-source-status";
import {
  archiveLearningSpace,
  getActiveLearningSpaceSource,
  getLearningSpace,
  persistIndex,
  recordLearningSpaceSourceValidation,
  updateLearningSpace,
} from "./repositories";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EBUSY") throw error;
    }
  }
  temporaryDirectory = undefined;
});

describe("LearningSpace source status read model", () => {
  it("reports a successful synchronization without presenting historical validation as a live reachability check", async () => {
    await setupDatabase();
    await persistStatusFixture("space-5");

    const status = await getLearningSpaceSourceStatus(owner, "space-5", new Date("2026-09-25T12:00:00.000Z"));

    expect(status).toMatchObject({
      learningSpaceId: "space-5",
      isArchived: false,
      activeSource: {
        role: "primary",
        isActive: true,
        lastKnownValidation: { state: "valid", message: null },
      },
      profile: { configVersion: 1 },
      synchronization: {
        latestAttempt: { result: "succeeded", portfolioCount: 1, warningCount: 0, failureMessage: null },
        latestSuccessful: { result: "succeeded", portfolioCount: 1 },
        inProgress: { state: "not_detected", evidence: "no_active_sync_lease", leaseExpiresAt: null },
        usableIndex: { available: true, state: "available_from_latest_success" },
        profileIndexAlignment: { state: "confirmed_current" },
      },
      missingContent: { state: "known", totalFilesAndResources: 0 },
      warnings: { state: "known", count: 0, items: [] },
      assessment: { state: "no_problem_detected", reasons: [], evidence: "stored_state_only" },
    });

    await (await getDatabase()).execute({
      sql: "INSERT INTO sync_leases (learning_space_id, owner_id, acquired_until) VALUES (?, ?, ?)",
      args: ["space-5", "active-sync", "2026-09-25T12:10:00.000Z"],
    });
    const duringSync = await getLearningSpaceSourceStatus(owner, "space-5", new Date("2026-09-25T12:05:00.000Z"));
    expect(duringSync.synchronization).toMatchObject({
      inProgress: { state: "inferred_running", evidence: "active_sync_lease", leaseExpiresAt: "2026-09-25T12:10:00.000Z" },
      usableIndex: { available: true, state: "available_while_syncing" },
    });
  });

  it("keeps an older usable index visible after a failed attempt and an unreachable-source validation", async () => {
    await setupDatabase();
    await persistStatusFixture("space-5", [{
      severity: "warning",
      path: "Portfolio 1 - Status/oude-waarschuwing.pdf",
      message: "Waarschuwing uit de laatste geslaagde synchronisatie.",
    }]);
    const source = (await getActiveLearningSpaceSource("space-5"))!;
    await insertFailedSync("space-5", source.id, "onedrive", "Bron tijdelijk onbereikbaar.");
    await recordLearningSpaceSourceValidation(source.id, "invalid", "Bron tijdelijk onbereikbaar.");

    const status = await getLearningSpaceSourceStatus(owner, "space-5");

    expect(status.activeSource?.lastKnownValidation).toMatchObject({ state: "invalid", message: "Bron tijdelijk onbereikbaar." });
    expect(status.synchronization.latestAttempt).toMatchObject({
      result: "failed",
      portfolioCount: null,
      warningCount: null,
      failureMessage: "Bron tijdelijk onbereikbaar.",
    });
    expect(status.synchronization.latestSuccessful?.result).toBe("succeeded");
    expect(status.synchronization.usableIndex).toEqual({ available: true, state: "available_from_previous_success" });
    expect(status.missingContent.state).toBe("known");
    expect(status.warnings).toMatchObject({
      state: "known",
      count: 1,
      items: [expect.objectContaining({
        message: "Waarschuwing uit de laatste geslaagde synchronisatie.",
        portfolio: expect.objectContaining({ code: "1", title: "Status" }),
      })],
    });
    expect(status.assessment).toMatchObject({
      state: "attention_required",
      reasons: expect.arrayContaining(["active_source_invalid", "latest_sync_failed"]),
    });
  });

  it("does not invent index, warning or missing-content health after a failed first synchronization", async () => {
    await setupDatabase();
    const source = (await getActiveLearningSpaceSource("space-5"))!;
    await insertFailedSync("space-5", source.id, source.providerType, "Eerste synchronisatie mislukt.");

    const status = await getLearningSpaceSourceStatus(owner, "space-5");

    expect(status.synchronization).toMatchObject({
      latestAttempt: { result: "failed" },
      latestSuccessful: null,
      usableIndex: { available: false, state: "unavailable" },
      profileIndexAlignment: { state: "unknown", reason: "no_successful_sync" },
    });
    expect(status.missingContent).toMatchObject({ state: "unknown", totalFilesAndResources: null });
    expect(status.warnings).toEqual({ state: "unknown", basedOnSuccessfulSyncAt: null, count: null, items: null });
    expect(status.assessment).toMatchObject({
      state: "attention_required",
      reasons: expect.arrayContaining(["active_source_not_checked", "no_usable_index", "latest_sync_failed"]),
    });
  });

  it("keeps warnings without a reliable portfolio path available as general warnings", async () => {
    await setupDatabase();
    await persistStatusFixture("space-5", [{ severity: "warning", path: "los-bestand.pdf", message: "Niet gekoppeld." }]);

    const status = await getLearningSpaceSourceStatus(owner, "space-5");

    expect(status.warnings).toMatchObject({
      state: "known",
      count: 1,
      items: [expect.objectContaining({ message: "Niet gekoppeld.", portfolio: null })],
    });
  });

  it("counts missing hierarchy and both asset models while deduplicating their shared exercise file", async () => {
    await setupDatabase();
    await persistStatusFixture("space-5");
    const database = await getDatabase();
    await database.batch([
      { sql: "UPDATE portfolios SET is_indexed = 0 WHERE learning_space_id = ?", args: ["space-5"] },
      { sql: "UPDATE sections SET is_indexed = 0 WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)", args: ["space-5"] },
      { sql: "UPDATE exercises SET is_indexed = 0 WHERE portfolio_id IN (SELECT id FROM portfolios WHERE learning_space_id = ?)", args: ["space-5"] },
      { sql: `UPDATE solution_assets SET is_indexed = 0, missing_since = ? WHERE variant_id IN (
        SELECT solution_variants.id FROM solution_variants INNER JOIN exercises ON exercises.id = solution_variants.exercise_id
        INNER JOIN portfolios ON portfolios.id = exercises.portfolio_id WHERE portfolios.learning_space_id = ?)`, args: ["2026-09-25T13:00:00.000Z", "space-5"] },
      { sql: "UPDATE source_resource_assets SET is_indexed = 0, missing_since = ? WHERE learning_space_id = ?", args: ["2026-09-25T13:00:00.000Z", "space-5"] },
      { sql: "UPDATE source_resource_assets SET archived_at = ? WHERE learning_space_id = ? AND resource_id = 'archived-global'", args: ["2026-09-25T13:05:00.000Z", "space-5"] },
    ]);

    const status = await getLearningSpaceSourceStatus(owner, "space-5");

    expect(status.missingContent).toEqual({
      state: "known",
      portfolios: 1,
      sections: 1,
      exercises: 1,
      legacySolutionAssets: 1,
      genericPortfolioResources: 1,
      genericExerciseResources: 1,
      genericResources: 2,
      overlappingLegacyAndGenericExerciseAssets: 1,
      totalFilesAndResources: 2,
    });
    expect(status.assessment.reasons).toContain("missing_content");
  });

  it("excludes archived assets and still reports an authorized archived LearningSpace", async () => {
    await setupDatabase();
    await persistStatusFixture("space-5");
    const database = await getDatabase();
    await database.execute({
      sql: "UPDATE source_resource_assets SET is_indexed = 0, missing_since = ?, archived_at = ? WHERE learning_space_id = ?",
      args: ["2026-09-25T13:00:00.000Z", "2026-09-25T13:05:00.000Z", "space-5"],
    });
    await archiveLearningSpace("space-5");

    const status = await getLearningSpaceSourceStatus(owner, "space-5");

    expect(status.isArchived).toBe(true);
    expect(status.missingContent).toMatchObject({
      state: "known",
      genericPortfolioResources: 0,
      genericExerciseResources: 0,
      genericResources: 0,
    });
  });

  it("reports primary and mirror validation separately without checking either provider", async () => {
    await setupDatabase();
    await configureDualSource();
    await persistStatusFixture("space-5");
    const space = (await getLearningSpace("space-5"))!;
    await recordLearningSpaceSourceValidation(space.mirrorSource!.id, "invalid", "Mirror is onvolledig.");

    const status = await getLearningSpaceSourceStatus(owner, "space-5");

    expect(status.activeSource).toMatchObject({ role: "primary", providerType: "onedrive", isActive: true });
    expect(status.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "primary", providerType: "onedrive", isActive: true }),
      expect.objectContaining({
        role: "mirror",
        providerType: "google_drive",
        isActive: false,
        lastKnownValidation: expect.objectContaining({ state: "invalid", message: "Mirror is onvolledig." }),
      }),
    ]));
    expect(status.assessment).toMatchObject({ state: "attention_required", reasons: expect.arrayContaining(["mirror_invalid"]) });
  });

  it("marks profile/index alignment unknown after a later profile or assignment update", async () => {
    await setupDatabase();
    await persistStatusFixture("space-5");
    const database = await getDatabase();
    await database.execute({
      sql: `UPDATE source_profiles SET updated_at = ? WHERE id = (
        SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = ?
      )`,
      args: ["2099-01-01T00:00:00.000Z", "space-5"],
    });

    const status = await getLearningSpaceSourceStatus(owner, "space-5");

    expect(status.synchronization.usableIndex.available).toBe(true);
    expect(status.synchronization.profileIndexAlignment).toEqual({
      state: "unknown",
      reason: "profile_or_assignment_changed_after_sync",
    });
    expect(status.assessment).toMatchObject({ state: "unknown", reasons: ["profile_index_alignment_unknown"] });
  });

  it("enforces owner, editor and superadmin scope and never leaks another LearningSpace's warnings", async () => {
    await setupDatabase();
    await persistStatusFixture("space-5", [{ severity: "warning", path: "Portfolio 1 - Status/vijf.pdf", message: "Alleen vijf." }]);
    await persistStatusFixture("space-6", [{ severity: "warning", path: "Portfolio 1 - Status/zes.pdf", message: "Alleen zes." }]);

    await expect(getLearningSpaceSourceStatus(owner, "space-5")).resolves.toMatchObject({ learningSpaceId: "space-5" });
    await expect(getLearningSpaceSourceStatus(editor, "space-5")).resolves.toMatchObject({ learningSpaceId: "space-5" });
    await expect(getLearningSpaceSourceStatus(superadmin, "space-6")).resolves.toMatchObject({ learningSpaceId: "space-6" });
    await expect(getLearningSpaceSourceStatus(otherTeacher, "space-5")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(getLearningSpaceSourceStatus(student, "space-5")).rejects.toBeInstanceOf(AuthorizationError);

    const fifth = await getLearningSpaceSourceStatus(owner, "space-5");
    expect(fifth.warnings).toMatchObject({ state: "known", count: 1, items: [expect.objectContaining({ message: "Alleen vijf." })] });
    if (fifth.warnings.state === "known") expect(fifth.warnings.items.some((warning) => warning.message.includes("zes"))).toBe(false);
  });
});

const owner = appUser("status-owner", "teacher");
const editor = appUser("status-editor", "teacher");
const otherTeacher = appUser("status-other", "teacher");
const student = appUser("status-student", "student");
const superadmin = appUser("status-superadmin", "superadmin");

async function setupDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-source-status-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  const database = await getDatabase();
  const now = "2026-09-25T08:00:00.000Z";
  await database.batch([
    ...[owner, editor, otherTeacher, student].map((user) => ({
      sql: "INSERT INTO users (id, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)",
      args: [user.id, user.displayName, user.role, now, now],
    })),
    { sql: "INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at) VALUES (?, ?, 'owner', ?, ?)", args: ["space-5", owner.id, now, now] },
    { sql: "INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at) VALUES (?, ?, 'editor', ?, ?)", args: ["space-5", editor.id, now, now] },
    { sql: "INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at) VALUES (?, ?, 'owner', ?, ?)", args: ["space-6", otherTeacher.id, now, now] },
  ]);
}

async function persistStatusFixture(learningSpaceId: string, warnings: IndexWarning[] = []): Promise<void> {
  const source = (await getActiveLearningSpaceSource(learningSpaceId))!;
  await persistIndex([statusFixture(warnings)], source.providerType, learningSpaceId, { sourceId: source.id });
}

function statusFixture(warnings: IndexWarning[]): IndexedPortfolio {
  const portfolioPath = "Portfolio 1 - Status";
  const sectionPath = `${portfolioPath}/Uitwerkingen/1 - Status`;
  const exercisePath = `${sectionPath}/PF1-Oef1.png`;
  return {
    code: "1",
    title: "Status",
    relativePath: portfolioPath,
    assignmentPdfPath: null,
    assignmentPdfSourceId: null,
    hintsDocumentPath: null,
    hintsDocumentSourceId: null,
    finalSolutionsPdfPath: null,
    finalSolutionsPdfSourceId: null,
    resourceAssets: [
      {
        resourceId: "active-global",
        semanticRole: "generic",
        relativePath: `${portfolioPath}/Actieve bron.pdf`,
        sourceId: "active-global-source",
        fileName: "Actieve bron.pdf",
        extension: "pdf",
        lastModifiedAt: "2026-09-25T08:00:00.000Z",
        sourceVersion: "v1",
      },
      {
        resourceId: "archived-global",
        semanticRole: "generic",
        relativePath: `${portfolioPath}/Later gearchiveerd.pdf`,
        sourceId: "archived-global-source",
        fileName: "Later gearchiveerd.pdf",
        extension: "pdf",
        lastModifiedAt: "2026-09-25T08:00:00.000Z",
        sourceVersion: "v1",
      },
    ],
    sections: [{
      order: 1,
      title: "Status",
      relativePath: sectionPath,
      exercises: [{
        code: "1",
        number: 1,
        suffix: "",
        assets: [{
          resourceId: "worked-solution",
          semanticRole: "worked_solution",
          legacyVariant: "standard",
          relativePath: exercisePath,
          sourceId: "exercise-source",
          fileName: "PF1-Oef1.png",
          lastModifiedAt: "2026-09-25T08:00:00.000Z",
          sourceVersion: "v1",
          parsed: {
            portfolioCode: "1",
            exerciseNumber: 1,
            exerciseSuffix: "",
            exerciseCode: "1",
            variant: "standard",
            step: 1,
            extension: "png",
          },
        }],
      }],
    }],
    warnings,
  };
}

async function insertFailedSync(
  learningSpaceId: string,
  sourceId: string,
  providerType: string,
  message: string,
): Promise<void> {
  await (await getDatabase()).execute({
    sql: `INSERT INTO sync_runs
      (id, learning_space_id, source_id, started_at, finished_at, portfolio_count, warning_count, status, provider_type, failure_message)
      VALUES (?, ?, ?, ?, ?, 0, 0, 'failed', ?, ?)`,
    args: [`failed-${learningSpaceId}`, learningSpaceId, sourceId, "2099-01-01T00:00:00.000Z", "2099-01-01T00:00:01.000Z", providerType, message],
  });
}

async function configureDualSource(): Promise<void> {
  await updateLearningSpace("space-5", {
    name: "5de jaar",
    slug: "5",
    shortLabel: "5",
    sortOrder: 50,
    sourceType: "onedrive",
    primarySource: {
      providerType: "onedrive",
      storageConnectionId: "connection-onedrive-user-legacy-superadmin",
      oneDriveDriveId: "drive-primary",
      oneDriveFolderId: "folder-primary",
      oneDriveFolderPath: "Portfolio/5",
    },
    mirrorSource: {
      providerType: "google_drive",
      googleDriveFolderId: "google-mirror",
      googleDriveFolderLabel: "Mirror 5",
    },
  });
}

function appUser(id: string, role: AppUser["role"]): AppUser {
  return {
    id,
    displayName: id,
    firstName: null,
    lastName: null,
    email: null,
    role,
    status: "active",
    classGroupOverrideId: null,
  };
}
