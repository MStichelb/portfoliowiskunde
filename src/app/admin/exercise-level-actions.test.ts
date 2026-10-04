import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({
  endAdminSession: vi.fn(),
  requireAdmin: vi.fn(),
  requireAdminUser: mocks.requireAdminUser,
}));

import { getDatabase, resetDatabaseForTests } from "@/lib/database";
import type { IndexedPortfolio } from "@/lib/domain";
import { getAdminExercise, getAdminPortfolios, persistIndex } from "@/lib/repositories";

import { saveExerciseLevelAction } from "./actions";

let temporaryDirectory: string | undefined;
let spaceFiveExerciseId = "";
let spaceSixExerciseId = "";

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-exercise-level-action-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  const database = await getDatabase();
  await persistIndex(indexFixture("91"), "local", "space-5");
  await persistIndex(indexFixture("92"), "local", "space-6");
  spaceFiveExerciseId = (await getAdminPortfolios("space-5"))[0].sections[0].exercises[0].id;
  spaceSixExerciseId = (await getAdminPortfolios("space-6"))[0].sections[0].exercises[0].id;
  const now = "2026-09-27T10:00:00.000Z";
  await database.batch([
    userStatement("owner-level", "teacher", now),
    userStatement("editor-level", "teacher", now),
    userStatement("viewer-level", "teacher", now),
    userStatement("student-level", "student", now),
    { sql: "INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at) VALUES ('space-5', 'owner-level', 'owner', ?, ?)", args: [now, now] },
    { sql: "INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at) VALUES ('space-5', 'editor-level', 'editor', ?, ?)", args: [now, now] },
    { sql: "INSERT INTO solution_variants (id, exercise_id, kind, label, is_indexed) VALUES ('level-variant', ?, 'standard', 'Standaard', 1)", args: [spaceFiveExerciseId] },
    { sql: `INSERT INTO solution_assets
        (id, variant_id, relative_path, source_id, file_name, extension, step, is_indexed)
        VALUES ('level-asset', 'level-variant', 'source/PF91-Oef1.png', 'opaque-source-id', 'PF91-Oef1.png', 'png', 1, 1)`, args: [] },
  ]);
});

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
  mocks.requireAdminUser.mockResolvedValue(appUser("owner-level", "teacher"));
  const database = await getDatabase();
  await database.batch([
    { sql: "UPDATE learning_spaces SET is_active = 1, archived_at = NULL WHERE id = 'space-5'", args: [] },
    { sql: `UPDATE exercises SET visibility_mode = 'hidden', visible = 0, custom_note = 'Bestaande notitie', note_label = 'Hint',
        level_source = 'basis', level_override_mode = 'inherit', level_override = NULL WHERE id = ?`, args: [spaceFiveExerciseId] },
  ]);
});

afterAll(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
});

describe("saveExerciseLevelAction", () => {
  it.each([
    ["inherit", "inherit", null, "basis"],
    ["none", "none", null, null],
    ["level:opwarmer", "level", "opwarmer", "opwarmer"],
    ["level:basis", "level", "basis", "basis"],
    ["level:uitdaging", "level", "uitdaging", "uitdaging"],
    ["level:verdieping", "level", "verdieping", "verdieping"],
  ])("stores choice %s through the N1 repository contract", async (choice, mode, override, effective) => {
    await expect(saveExerciseLevelAction(levelForm(spaceFiveExerciseId, "space-5", choice)))
      .rejects.toThrow(`REDIRECT:/admin/5/oefening/${spaceFiveExerciseId}?levelSaved=1`);

    expect(await getAdminExercise(spaceFiveExerciseId, "space-5")).toMatchObject({
      levelSource: "basis", levelOverrideMode: mode, levelOverride: override, effectiveLevel: effective,
    });
  });

  it.each([
    ["owner-level", "teacher"],
    ["editor-level", "teacher"],
  ] as const)("allows existing manager %s", async (id, role) => {
    mocks.requireAdminUser.mockResolvedValue(appUser(id, role));

    await expect(saveExerciseLevelAction(levelForm(spaceFiveExerciseId, "space-5", "level:uitdaging")))
      .rejects.toThrow("REDIRECT:");
    expect((await getAdminExercise(spaceFiveExerciseId, "space-5"))?.effectiveLevel).toBe("uitdaging");
  });

  it.each([
    ["viewer-level", "teacher"],
    ["student-level", "student"],
  ] as const)("denies non-manager %s", async (id, role) => {
    mocks.requireAdminUser.mockResolvedValue(appUser(id, role));

    await expect(saveExerciseLevelAction(levelForm(spaceFiveExerciseId, "space-5", "level:uitdaging")))
      .rejects.toThrow("geen beheerrechten");
    expect((await getAdminExercise(spaceFiveExerciseId, "space-5"))?.levelOverrideMode).toBe("inherit");
  });

  it("rejects invalid explicit levels and modes", async () => {
    await expect(saveExerciseLevelAction(levelForm(spaceFiveExerciseId, "space-5", "level:expert")))
      .rejects.toThrow("geldig oefeningniveau");
    await expect(saveExerciseLevelAction(levelForm(spaceFiveExerciseId, "space-5", "automatic")))
      .rejects.toThrow("Ongeldige modus");
    expect((await getAdminExercise(spaceFiveExerciseId, "space-5"))?.levelOverrideMode).toBe("inherit");
  });

  it("rejects an exercise that belongs to another LearningSpace", async () => {
    await expect(saveExerciseLevelAction(levelForm(spaceSixExerciseId, "space-5", "level:uitdaging")))
      .rejects.toThrow("Oefening niet gevonden");
    expect((await getAdminExercise(spaceSixExerciseId, "space-6"))?.levelOverrideMode).toBe("inherit");
  });

  it("returns an inline edit to the trusted portfolio route", async () => {
    const form = levelForm(spaceFiveExerciseId, "space-5", "level:basis");
    form.set("returnContext", "portfolio");
    const portfolioId = (await getAdminExercise(spaceFiveExerciseId, "space-5"))!.portfolioId;

    await expect(saveExerciseLevelAction(form))
      .rejects.toThrow(`REDIRECT:/admin/5/portfolio/${portfolioId}#exercise-${spaceFiveExerciseId}`);
    expect((await getAdminExercise(spaceFiveExerciseId, "space-5"))?.effectiveLevel).toBe("basis");
  });

  it("keeps the existing management policy for an archived LearningSpace", async () => {
    await (await getDatabase()).execute("UPDATE learning_spaces SET is_active = 0, archived_at = '2026-09-27T10:30:00.000Z' WHERE id = 'space-5'");

    await expect(saveExerciseLevelAction(levelForm(spaceFiveExerciseId, "space-5", "none")))
      .rejects.toThrow("REDIRECT:");
    expect(await getAdminExercise(spaceFiveExerciseId, "space-5")).toMatchObject({ levelOverrideMode: "none", effectiveLevel: null });
  });

  it("changes no publication, note, asset, source or identity metadata", async () => {
    const database = await getDatabase();
    const before = (await database.execute({
      sql: `SELECT id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, visibility_mode, visible,
        custom_note, note_label, level_source FROM exercises WHERE id = ?`,
      args: [spaceFiveExerciseId],
    })).rows[0];
    const assetsBefore = (await database.execute("SELECT id, variant_id, source_id, relative_path, file_name, extension, step, is_indexed FROM solution_assets WHERE id = 'level-asset'")).rows;

    await expect(saveExerciseLevelAction(levelForm(spaceFiveExerciseId, "space-5", "level:verdieping")))
      .rejects.toThrow("REDIRECT:");

    expect((await database.execute({
      sql: `SELECT id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, visibility_mode, visible,
        custom_note, note_label, level_source FROM exercises WHERE id = ?`,
      args: [spaceFiveExerciseId],
    })).rows[0]).toEqual(before);
    expect((await database.execute("SELECT id, variant_id, source_id, relative_path, file_name, extension, step, is_indexed FROM solution_assets WHERE id = 'level-asset'")).rows)
      .toEqual(assetsBefore);
  });
});

function levelForm(id: string, learningSpaceId: string, levelChoice: string): FormData {
  const form = new FormData();
  form.set("id", id);
  form.set("learningSpaceId", learningSpaceId);
  form.set("levelChoice", levelChoice);
  return form;
}

function appUser(id: string, role: "teacher" | "student") {
  return { id, displayName: id, firstName: null, lastName: null, email: null, role, status: "active" as const, classGroupOverrideId: null };
}

function userStatement(id: string, role: "teacher" | "student", now: string) {
  return {
    sql: "INSERT INTO users (id, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)",
    args: [id, id, role, now, now],
  };
}

function indexFixture(code: string): IndexedPortfolio[] {
  return [{
    code, title: `Niveautest ${code}`, relativePath: `Portfolio ${code} - Niveautest`,
    assignmentPdfPath: null, assignmentPdfSourceId: null, hintsDocumentPath: null, hintsDocumentSourceId: null,
    finalSolutionsPdfPath: null, finalSolutionsPdfSourceId: null, resourceAssets: [], warnings: [],
    sections: [{ code: "1", sortOrder: 1, title: "Basis", relativePath: `Portfolio ${code} - Niveautest/Uitwerkingen/1 - Basis`, exercises: [
      { code: "1", number: 1, suffix: "", assets: [] },
    ] }],
  }];
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
