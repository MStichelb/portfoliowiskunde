import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import { createLearningSpace } from "./repositories";
import {
  BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
  BUILT_IN_DEFAULT_SOURCE_PROFILE_ID,
  EXERCISE_RESOURCE_LIMIT,
  GLOBAL_RESOURCE_LIMIT,
  LEGACY_EXERCISE_RESOURCE_CONFIGS,
  LEGACY_GLOBAL_RESOURCE_CONFIGS,
  globalResourceSelectableIcons,
  parseSourceProfileConfig,
  parseStoredSourceProfileConfig,
} from "./source-profile-config";
import {
  canDeleteSourceProfile,
  ensureBuiltInDefaultSourceProfile,
  getActiveSourceProfileForLearningSpace,
  getSourceProfileConfig,
} from "./source-profiles";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("source profile config", () => {
  it("accepts the built-in V1 config through the shared typed parser", () => {
    expect(parseSourceProfileConfig(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG)).toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
  });

  it("rejects unknown versions and malformed stored config safely", () => {
    expect(() => parseSourceProfileConfig({ configVersion: 2, scanner: { convention: "legacy_portfolio_v1" } })).toThrow();
    expect(() => parseSourceProfileConfig({ configVersion: 1, scanner: {} })).toThrow();
    expect(() => parseStoredSourceProfileConfig(1, "not-json")).toThrow();
    expect(() => parseStoredSourceProfileConfig(2, JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG))).toThrow();
  });

  it("normalizes legacy V1 config without resource lists to both legacy resource definitions", () => {
    expect(parseSourceProfileConfig({ configVersion: 1, scanner: { convention: "legacy_portfolio_v1" } })).toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    expect(LEGACY_GLOBAL_RESOURCE_CONFIGS.map((resource) => resource.label)).toEqual(["Opgaven", "Hints", "Eindoplossingen"]);
    expect(LEGACY_EXERCISE_RESOURCE_CONFIGS.map((resource) => resource.label)).toEqual(["Uitwerking", "Alternatieve uitwerking"]);
  });

  it("accepts source-file and external-link global resource definitions without storing portfolio URLs in the profile", () => {
    const config = parseSourceProfileConfig({
      configVersion: 1,
      scanner: { convention: "legacy_portfolio_v1" },
      globalResources: [
        {
          id: "theory", kind: "source_file", label: "Theorie", icon: "book-open", order: 10, semanticRole: "generic",
          recognition: { target: "file_name", operator: "contains", value: "theorie", fileExtensions: ["pdf"] },
        },
        { id: "geogebra", kind: "external_link", label: "GeoGebra", icon: "external-link", order: 20, semanticRole: "generic" },
      ],
    });

    expect(config.globalResources).toEqual([
      expect.objectContaining({ id: "theory", kind: "source_file", recognition: expect.objectContaining({ caseSensitive: false }) }),
      expect.objectContaining({ id: "geogebra", kind: "external_link" }),
    ]);
    expect(config.globalResources[1]).not.toHaveProperty("url");
  });



  it("upgradet realistische legacy exercise resources naar het nieuwe herkenningsmodel", () => {
    const config = parseSourceProfileConfig({
      configVersion: 1,
      scanner: { convention: "legacy_portfolio_v1" },
      exerciseResources: [
        {
          id: "model", kind: "source_file", label: "Modeluitwerking", icon: "circle-check-big", order: 10, semanticRole: "worked_solution",
          recognition: { target: "legacy_solution_file", fileExtensions: ["png"] },
        },
        {
          id: "alternative", kind: "source_file", label: "Andere aanpak", icon: "shapes", order: 20, semanticRole: "alternative_solution",
          recognition: { target: "legacy_solution_file", fileExtensions: ["pdf", "jpg"] },
        },
      ],
    });

    expect(config.exerciseResources).toEqual([
      expect.objectContaining({
        id: "model", semanticRole: "worked_solution", location: { scope: "alongside_exercise" },
        recognition: { file: { target: "fallback" }, directory: { target: "fallback" }, fileExtensions: ["png"] }, allowMultiple: true, displayMode: "collapsible_group",
      }),
      expect.objectContaining({
        id: "alternative", semanticRole: "alternative_solution", location: { scope: "alongside_exercise" },
        recognition: {
          file: { target: "after_exercise_number", operator: "starts_with", value: "-alt", caseSensitive: false },
          directory: { target: "after_exercise_number", operator: "starts_with", value: "-alt", caseSensitive: false },
          fileExtensions: ["pdf", "jpg"],
        },
        allowMultiple: true, displayMode: "collapsible_group",
      }),
    ]);
  });

  it("normaliseert de oefeningsscanner en valideert de marker alleen wanneer die nodig is", () => {
    expect(parseSourceProfileConfig({ configVersion: 1, scanner: { convention: "legacy_portfolio_v1" } }).scanner.exercise)
      .toEqual({ exerciseMode: "files_and_directories", numberLocation: "after_text", marker: "Oef" });
    expect(parseSourceProfileConfig({
      configVersion: 1,
      scanner: { convention: "legacy_portfolio_v1", exercise: { numberLocation: "start", marker: "" } },
    }).scanner.exercise).toEqual({ exerciseMode: "files_and_directories", numberLocation: "start", marker: "" });
    expect(() => parseSourceProfileConfig({
      configVersion: 1,
      scanner: { convention: "legacy_portfolio_v1", exercise: { numberLocation: "after_text", marker: "" } },
    })).toThrow("Vul de tekst in die vóór het oefeningsnummer staat.");
  });

  it("bewaart contextregels dormant bij een moduswissel en valideert alleen actieve exact-regels", () => {
    const resource = {
      id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 10, semanticRole: "worked_solution",
      location: { scope: "alongside_exercise" },
      recognition: {
        file: { target: "after_exercise_number", operator: "starts_with", value: "-uitwerking", caseSensitive: false },
        directory: { target: "file_name", operator: "exact", value: "uitwerking", caseSensitive: false },
        fileExtensions: ["png"],
      },
      allowMultiple: true,
      displayMode: "collapsible_group",
    };
    const filesOnly = parseSourceProfileConfig({
      configVersion: 1,
      scanner: { convention: "legacy_portfolio_v1", exercise: { exerciseMode: "files", numberLocation: "after_text", marker: "Oef" } },
      globalResources: [],
      exerciseResources: [resource],
    });

    expect(filesOnly.exerciseResources[0].recognition.directory).toMatchObject({ target: "file_name", operator: "exact", value: "uitwerking" });
    expect(() => parseSourceProfileConfig({
      ...filesOnly,
      scanner: { ...filesOnly.scanner, exercise: { ...filesOnly.scanner.exercise, exerciseMode: "files_and_directories" } },
    })).toThrow("Bij een exacte actieve herkenningsregel kan maar één bestand worden toegestaan.");
  });

  it("weigert een herkenningstarget in de verkeerde context server-side", () => {
    expect(() => parseSourceProfileConfig({
      configVersion: 1,
      scanner: { convention: "legacy_portfolio_v1", exercise: { exerciseMode: "files", numberLocation: "after_text", marker: "Oef" } },
      globalResources: [],
      exerciseResources: [{
        id: "invalid", kind: "source_file", label: "Fout", icon: "file-text", order: 10, semanticRole: "generic",
        location: { scope: "alongside_exercise" },
        recognition: {
          file: { target: "file_name", operator: "contains", value: "fout", caseSensitive: false },
          directory: null,
          fileExtensions: ["png"],
        },
        allowMultiple: false,
        displayMode: "always",
      }],
    })).toThrow();
  });

  it("aanvaardt tekst na oefeningnummer in de directorycontext", () => {
    const config = parseSourceProfileConfig({
      configVersion: 1,
      scanner: { convention: "legacy_portfolio_v1", exercise: { exerciseMode: "directories", numberLocation: "after_text", marker: "Oef" } },
      globalResources: [],
      exerciseResources: [{
        id: "worked", kind: "source_file", label: "Uitwerking", icon: "notebook-pen", order: 10, semanticRole: "worked_solution",
        location: { scope: "alongside_exercise" },
        recognition: {
          file: null,
          directory: { target: "after_exercise_number", operator: "starts_with", value: "-uitwerking", caseSensitive: false },
          fileExtensions: ["png"],
        },
        allowMultiple: true,
        displayMode: "collapsible_group",
      }],
    });
    expect(config.exerciseResources[0].recognition.directory).toMatchObject({ target: "after_exercise_number", value: "-uitwerking" });
  });

  it("accepteert locatie, meerdere bestanden, weergave en meerdere fallbacks die runtime per bestand worden afgetoetst", () => {
    const config = parseSourceProfileConfig({
      configVersion: 1,
      scanner: { convention: "legacy_portfolio_v1", exercise: { numberLocation: "after_text", marker: "Oef" } },
      exerciseResources: [{
        id: "exercise-hint", kind: "source_file", label: "Hint", icon: "lightbulb", order: 10, semanticRole: "hint",
        location: { scope: "subdirectory", subdirectory: "assets" },
        recognition: { target: "after_exercise_number", operator: "starts_with", value: "-hint", caseSensitive: false, fileExtensions: ["png"] },
        allowMultiple: true,
        displayMode: "collapsible_each",
      }],
    });
    expect(config.exerciseResources[0]).toMatchObject({
      location: { scope: "subdirectory", subdirectory: "assets" }, allowMultiple: true, displayMode: "collapsible_each",
    });

    const fallback = (id: string, order: number, extension: "pdf" | "png") => ({
      id, kind: "source_file" as const, label: id, icon: "file-text" as const, order, semanticRole: "generic" as const,
      location: { scope: "alongside_exercise" as const }, recognition: { target: "fallback" as const, fileExtensions: [extension] },
      allowMultiple: true, displayMode: "collapsible_group" as const,
    });
    expect(parseSourceProfileConfig({
      configVersion: 1,
      scanner: { convention: "legacy_portfolio_v1" },
      exerciseResources: [fallback("one", 10, "pdf"), fallback("two", 20, "png")],
    }).exerciseResources).toHaveLength(2);
  });

  it("accepts Scanner v2 filename rules for exercise resources and defaults case sensitivity safely", () => {
    const config = parseSourceProfileConfig({
      configVersion: 1,
      scanner: { convention: "legacy_portfolio_v1" },
      exerciseResources: [{
        id: "exercise-hint", kind: "source_file", label: "Hint", icon: "lightbulb", order: 10, semanticRole: "hint",
        recognition: { target: "file_name", operator: "ends_with", value: "-hint", fileExtensions: ["png", "jpg"] },
      }],
    });

    expect(config.exerciseResources[0]).toMatchObject({
      id: "exercise-hint",
      recognition: { file: null, directory: { target: "file_name", operator: "ends_with", value: "-hint", caseSensitive: false }, fileExtensions: ["png", "jpg"] },
    });
    expect(() => parseSourceProfileConfig({
      configVersion: 1,
      scanner: { convention: "legacy_portfolio_v1" },
      exerciseResources: [{
        id: "bad-hint", kind: "source_file", label: "Hint", icon: "lightbulb", order: 10, semanticRole: "hint",
        recognition: { target: "file_name", operator: "contains", value: "hint", fileExtensions: [] },
      }],
    })).toThrow();
  });

  it("enforces exercise resource limits, unique ids/orders and at least one allowed extension", () => {
    const base = { configVersion: 1, scanner: { convention: "legacy_portfolio_v1" } } as const;
    const resource = (index: number) => ({
      id: `exercise-resource-${index}`, kind: "source_file" as const, label: `Resource ${index}`, icon: "file-text" as const,
      order: index, semanticRole: "generic" as const,
      location: { scope: "alongside_exercise" as const },
      recognition: { target: "file_name" as const, operator: "starts_with" as const, value: `resource-${index}`, caseSensitive: false, fileExtensions: ["pdf" as const] },
      allowMultiple: true,
      displayMode: "collapsible_group" as const,
    });

    expect(() => parseSourceProfileConfig({ ...base, exerciseResources: Array.from({ length: EXERCISE_RESOURCE_LIMIT + 1 }, (_, index) => resource(index)) })).toThrow();
    expect(() => parseSourceProfileConfig({ ...base, exerciseResources: [resource(1), { ...resource(2), id: "exercise-resource-1" }] })).toThrow();
    expect(() => parseSourceProfileConfig({ ...base, exerciseResources: [resource(1), { ...resource(2), order: 1 }] })).toThrow();
    expect(() => parseSourceProfileConfig({
      ...base,
      exerciseResources: [{ ...resource(1), recognition: { target: "file_name", operator: "starts_with", value: "resource-1", caseSensitive: false, fileExtensions: [] } }],
    })).toThrow();
  });


  it("supports the expanded icon picker while keeping legacy youtube configs readable", () => {
    expect(globalResourceSelectableIcons).toHaveLength(27);
    expect(globalResourceSelectableIcons).toContain("map-pinned");
    expect(globalResourceSelectableIcons).not.toContain("youtube");

    const parsed = parseSourceProfileConfig({
      configVersion: 1,
      scanner: { convention: "legacy_portfolio_v1" },
      globalResources: [
        { id: "legacy-video", kind: "external_link", label: "Video", icon: "youtube", order: 10, semanticRole: "generic" },
        { id: "cards", kind: "external_link", label: "Locatiekaart", icon: "map-pinned", order: 20, semanticRole: "generic" },
      ],
    });
    expect(parsed.globalResources.map((resource) => resource.icon)).toEqual(["youtube", "map-pinned"]);
  });

  it("enforces global resource limits, unique ids/orders and strict source-file recognition", () => {
    const base = { configVersion: 1, scanner: { convention: "legacy_portfolio_v1" } } as const;
    const resource = (index: number) => ({
      id: `resource-${index}`, kind: "external_link" as const, label: `Resource ${index}`, icon: "link" as const, order: index, semanticRole: "generic" as const,
    });

    expect(() => parseSourceProfileConfig({ ...base, globalResources: Array.from({ length: GLOBAL_RESOURCE_LIMIT + 1 }, (_, index) => resource(index)) })).toThrow();
    expect(() => parseSourceProfileConfig({ ...base, globalResources: [resource(1), { ...resource(2), id: "resource-1" }] })).toThrow();
    expect(() => parseSourceProfileConfig({ ...base, globalResources: [resource(1), { ...resource(2), order: 1 }] })).toThrow();
    expect(() => parseSourceProfileConfig({
      ...base,
      globalResources: [{
        id: "bad-file", kind: "source_file", label: "Fout", icon: "file-text", order: 1, semanticRole: "generic",
        recognition: { target: "file_name", operator: "contains", value: "x", fileExtensions: [] },
      }],
    })).toThrow();
  });
});

describe("concrete source profile foundation", () => {
  it("keeps one technical fallback while assigning distinct custom snapshots on a fresh database", async () => {
    const database = await useFreshDatabase("source-profile-fresh-");
    const fallback = await database.execute({ sql: "SELECT type, management_learning_space_id FROM source_profiles WHERE id = ?", args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID] });
    const assignments = (await database.execute(`SELECT learning_space_source_profiles.learning_space_id, source_profiles.*
      FROM learning_space_source_profiles JOIN source_profiles ON source_profiles.id = learning_space_source_profiles.source_profile_id
      ORDER BY learning_space_source_profiles.learning_space_id`)).rows;

    expect(fallback.rows[0]).toMatchObject({ type: "built_in", management_learning_space_id: null });
    expect(assignments).toHaveLength(2);
    expect(new Set(assignments.map((row) => row.id)).size).toBe(2);
    expect(assignments.every((row) => row.type === "custom" && row.management_learning_space_id === row.learning_space_id)).toBe(true);
    expect(assignments.every((row) => row.config_json === JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG))).toBe(true);
  });

  it("bootstraps only the technical fallback idempotently and does not reassign LearningSpaces", async () => {
    const database = await useFreshDatabase("source-profile-bootstrap-");
    const before = (await database.execute("SELECT * FROM learning_space_source_profiles ORDER BY learning_space_id")).rows;

    await database.execute({ sql: "DELETE FROM source_profiles WHERE id = ?", args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID] });
    await ensureBuiltInDefaultSourceProfile();
    await ensureBuiltInDefaultSourceProfile();

    expect(Number((await database.execute({ sql: "SELECT COUNT(*) AS count FROM source_profiles WHERE id = ?", args: [BUILT_IN_DEFAULT_SOURCE_PROFILE_ID] })).rows[0].count)).toBe(1);
    expect((await database.execute("SELECT * FROM learning_space_source_profiles ORDER BY learning_space_id")).rows).toEqual(before);
  });

  it("gives a newly created LearningSpace its own typed custom snapshot", async () => {
    await useFreshDatabase("source-profile-created-space-");
    const space = await createLearningSpace({
      name: "Nieuwe leeromgeving", slug: "nieuwe-leeromgeving", shortLabel: "Nieuw", sortOrder: 70, sourceType: "local", localSourcePath: null,
    });

    const profile = await getActiveSourceProfileForLearningSpace(space.id);
    expect(profile).toMatchObject({ type: "custom", managementLearningSpaceId: space.id });
    expect(profile?.name).toMatch(/^Standaard portfolio/);
    expect(profile?.id).not.toBe(BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);
    expect(profile && getSourceProfileConfig(profile)).toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
  });

  it("keeps the fallback immutable in application semantics", async () => {
    await useFreshDatabase("source-profile-delete-");
    expect(canDeleteSourceProfile({ type: "built_in" })).toBe(false);
    expect(canDeleteSourceProfile({ type: "custom" })).toBe(true);
  });

  it("upgrades existing spaces to snapshots without changing source connections or portfolio metadata", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "source-profile-upgrade-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 33)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-10T08:00:00.000Z"] },
      ], "write");
    }
    await legacy.execute("UPDATE learning_space_sources SET local_source_path = 'D:/bestaande-bron', last_validation_status = 'valid' WHERE id = 'space-6:primary'");
    await legacy.execute(`INSERT INTO portfolios
      (id, code, portfolio_code, learning_space_id, title, relative_path, is_indexed, indexed_at, custom_text)
      VALUES ('profile-portfolio', 'space-6:1', '1', 'space-6', 'Bestaande titel', 'Portfolio 1 - Bestaande titel', 1,
        '2026-09-10T08:00:00.000Z', 'Bestaande metadata')`);
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();

    expect((await upgraded.execute("SELECT local_source_path, last_validation_status FROM learning_space_sources WHERE id = 'space-6:primary'")).rows[0]).toMatchObject({
      local_source_path: "D:/bestaande-bron", last_validation_status: "valid",
    });
    expect((await upgraded.execute("SELECT title, custom_text FROM portfolios WHERE id = 'profile-portfolio'")).rows[0]).toMatchObject({
      title: "Bestaande titel", custom_text: "Bestaande metadata",
    });
    expect(await getActiveSourceProfileForLearningSpace("space-6")).toMatchObject({ type: "custom", managementLearningSpaceId: "space-6" });
  });
});

async function useFreshDatabase(prefix: string) {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  return getDatabase();
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
