import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_LOCAL_SOURCE_PATH } from "@/lib/app-config";
import type { DatabaseRow, InStatement } from "@/lib/database";
import { executeBatch, getDatabase } from "@/lib/database";
import type { IndexedPortfolio } from "@/lib/domain";
import {
  resolveChildPublication,
  resolvePortfolioPublication,
  type ChildVisibilityMode,
  type EffectivePublication,
  type PortfolioVisibilityMode,
} from "@/lib/publication";

export interface AdminAsset {
  id: string;
  fileName: string;
  extension: string;
  step: number;
  variant: "standard" | "alternative";
  isIndexed: boolean;
  lastModifiedAt: string | null;
}

export interface AdminExercise {
  id: string;
  code: string;
  visible: boolean;
  visibilityMode: ChildVisibilityMode;
  publishFrom: string | null;
  publishUntil: string | null;
  effectiveStatus: EffectivePublication;
  effectivePublished: boolean;
  isIndexed: boolean;
  assets: AdminAsset[];
}

export interface AdminSection {
  id: string;
  order: number;
  title: string;
  visibilityMode: ChildVisibilityMode;
  publishFrom: string | null;
  publishUntil: string | null;
  effectiveStatus: EffectivePublication;
  effectivePublished: boolean;
  isIndexed: boolean;
  exercises: AdminExercise[];
}

export interface AdminPortfolio {
  id: string;
  code: string;
  title: string;
  detectedTitle: string;
  visible: boolean;
  publishFrom: string | null;
  publishUntil: string | null;
  limited: boolean;
  effectiveStatus: EffectivePublication;
  effectivePublished: boolean;
  isIndexed: boolean;
  assignmentPdfPath: string | null;
  finalSolutionsPdfPath: string | null;
  sections: AdminSection[];
}

export interface StudentPortfolio {
  id: string;
  code: string;
  title: string;
  sections: Array<{
    id: string;
    title: string;
    order: number;
    exercises: Array<{ id: string; code: string; visible: boolean }>;
  }>;
}

export interface LocalStorageSettings {
  sourcePath: string;
  sourcePathOrigin: "database" | "environment" | "default";
}

export interface SyncSummary {
  startedAt: string;
  finishedAt: string | null;
  portfolioCount: number;
  warningCount: number;
  status: string;
  providerType: string | null;
  addedCount: number;
  updatedCount: number;
  missingCount: number;
  failureMessage: string | null;
}

const bool = (value: unknown) => value === true || Number(value) === 1;
const text = (row: DatabaseRow, field: string) => String(row[field] ?? "");
const nullableText = (row: DatabaseRow, field: string): string | null => {
  const value = row[field];
  return typeof value === "string" && value ? value : null;
};

function childMode(row: DatabaseRow): ChildVisibilityMode {
  const value = text(row, "visibility_mode");
  return value === "hidden" ? "hidden" : "visible";
}

function stableId(prefix: string, ...parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("\u0000")).digest("base64url").slice(0, 30);
  return `${prefix}-${hash}`;
}

export async function getLocalStorageSettings(): Promise<LocalStorageSettings> {
  const sourcePath = await getSetting("local_source_path");
  if (sourcePath) return { sourcePath, sourcePathOrigin: "database" };
  if (process.env.PORTFOLIO_SOURCE_PATH?.trim()) {
    return { sourcePath: process.env.PORTFOLIO_SOURCE_PATH.trim(), sourcePathOrigin: "environment" };
  }
  return { sourcePath: DEFAULT_LOCAL_SOURCE_PATH, sourcePathOrigin: "default" };
}

export async function getLocalSourcePath(): Promise<string> {
  return (await getLocalStorageSettings()).sourcePath;
}

export async function setLocalSourcePath(sourcePath: string): Promise<void> {
  const normalizedPath = path.resolve(sourcePath.trim());
  const sourceStats = await stat(normalizedPath);
  if (!sourceStats.isDirectory()) throw new Error("De opgegeven bronmap bestaat niet of is geen map.");
  await setSetting("local_source_path", normalizedPath);
}

export async function resetLocalSourcePath(): Promise<void> {
  await deleteSetting("local_source_path");
}

export async function getStorageProviderType(): Promise<"local" | "onedrive"> {
  return (await getSetting("storage_provider")) === "onedrive" ? "onedrive" : "local";
}

export async function setStorageProviderType(provider: "local" | "onedrive"): Promise<void> {
  await setSetting("storage_provider", provider);
}

export async function getSetting(key: string): Promise<string | null> {
  const database = await getDatabase();
  const result = await database.execute({ sql: "SELECT value FROM app_settings WHERE key = ?", args: [key] });
  return result.rows[0] ? nullableText(result.rows[0], "value") : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({
    sql: `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, value, new Date().toISOString()],
  });
}

export async function deleteSetting(key: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "DELETE FROM app_settings WHERE key = ?", args: [key] });
}

export async function getLatestSyncSummary(): Promise<SyncSummary | null> {
  const database = await getDatabase();
  const result = await database.execute("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 1");
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    startedAt: text(row, "started_at"),
    finishedAt: nullableText(row, "finished_at"),
    portfolioCount: Number(row.portfolio_count),
    warningCount: Number(row.warning_count),
    status: text(row, "status"),
    providerType: nullableText(row, "provider_type"),
    addedCount: Number(row.added_count ?? 0),
    updatedCount: Number(row.updated_count ?? 0),
    missingCount: Number(row.missing_count ?? 0),
    failureMessage: nullableText(row, "failure_message"),
  };
}

export async function persistIndex(portfolios: IndexedPortfolio[], providerType: string): Promise<{ warnings: number; added: number; updated: number; missing: number }> {
  const database = await getDatabase();
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const warnings = portfolios.flatMap((portfolio) => portfolio.warnings);
  const existingAssets = await database.execute("SELECT id, variant_id, relative_path, source_version FROM solution_assets WHERE is_indexed = 1");
  const assetKey = (variantId: string, relativePath: string) => `${variantId}\u0000${relativePath}`;
  const existingAssetVersions = new Map(existingAssets.rows.map((row) => [
    assetKey(text(row, "variant_id"), text(row, "relative_path")),
    { id: text(row, "id"), sourceVersion: nullableText(row, "source_version") },
  ]));
  const seenAssetKeys = new Set<string>();
  let added = 0;
  let updated = 0;

  const statements: InStatement[] = [
    {
      sql: `INSERT INTO sync_runs (id, started_at, portfolio_count, warning_count, status, provider_type)
        VALUES (?, ?, ?, ?, 'running', ?)`,
      args: [runId, startedAt, portfolios.length, warnings.length, providerType],
    },
    { sql: "UPDATE portfolios SET is_indexed = 0", args: [] },
    { sql: "UPDATE sections SET is_indexed = 0", args: [] },
    { sql: "UPDATE exercises SET is_indexed = 0", args: [] },
    { sql: "UPDATE solution_variants SET is_indexed = 0", args: [] },
    { sql: "UPDATE solution_assets SET is_indexed = 0", args: [] },
  ];

  for (const portfolio of portfolios) {
    const portfolioId = `portfolio-${portfolio.code}`;
    statements.push({
      sql: `INSERT INTO portfolios (id, code, title, relative_path, assignment_pdf_path, assignment_pdf_source_id,
        final_solutions_pdf_path, final_solutions_pdf_source_id, is_indexed, indexed_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET code = excluded.code, title = excluded.title, relative_path = excluded.relative_path,
          assignment_pdf_path = excluded.assignment_pdf_path, assignment_pdf_source_id = excluded.assignment_pdf_source_id,
          final_solutions_pdf_path = excluded.final_solutions_pdf_path, final_solutions_pdf_source_id = excluded.final_solutions_pdf_source_id,
          is_indexed = 1, indexed_at = excluded.indexed_at, last_seen_at = excluded.last_seen_at`,
      args: [portfolioId, portfolio.code, portfolio.title, portfolio.relativePath, portfolio.assignmentPdfPath,
        portfolio.assignmentPdfSourceId, portfolio.finalSolutionsPdfPath, portfolio.finalSolutionsPdfSourceId, startedAt, startedAt],
    });

    for (const section of portfolio.sections) {
      const sectionId = `${portfolioId}-section-${section.order}`;
      statements.push({
        sql: `INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path, visibility_mode, is_indexed, last_seen_at)
          VALUES (?, ?, ?, ?, ?, 'visible', 1, ?)
          ON CONFLICT(id) DO UPDATE SET title = excluded.title, relative_path = excluded.relative_path,
            is_indexed = 1, last_seen_at = excluded.last_seen_at`,
        args: [sectionId, portfolioId, section.order, section.title, section.relativePath, startedAt],
      });

      for (const exercise of section.exercises) {
        const exerciseId = `${sectionId}-exercise-${exercise.code}`;
        statements.push({
          sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, visibility_mode, visible, is_indexed, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, 'visible', 1, 1, ?)
            ON CONFLICT(id) DO UPDATE SET exercise_number = excluded.exercise_number,
              exercise_suffix = excluded.exercise_suffix, is_indexed = 1, last_seen_at = excluded.last_seen_at`,
          args: [exerciseId, portfolioId, sectionId, exercise.code, exercise.number, exercise.suffix, startedAt],
        });

        for (const variant of ["standard", "alternative"] as const) {
          const variantAssets = exercise.assets.filter((asset) => asset.parsed.variant === variant);
          if (variantAssets.length === 0) continue;
          const variantId = `${exerciseId}-${variant}`;
          statements.push({
            sql: `INSERT INTO solution_variants (id, exercise_id, kind, label, is_indexed) VALUES (?, ?, ?, ?, 1)
              ON CONFLICT(id) DO UPDATE SET label = excluded.label, is_indexed = 1`,
            args: [variantId, exerciseId, variant, variant === "standard" ? "Standaard" : "Alternatief"],
          });
          for (const asset of variantAssets) {
            const assetId = stableId("asset", variantId, asset.relativePath);
            const logicalAssetKey = assetKey(variantId, asset.relativePath);
            seenAssetKeys.add(logicalAssetKey);
            const previousAsset = existingAssetVersions.get(logicalAssetKey);
            if (previousAsset === undefined) added += 1;
            else if (previousAsset.sourceVersion !== asset.sourceVersion) updated += 1;
            statements.push({
              sql: `INSERT INTO solution_assets (id, variant_id, relative_path, source_id, file_name, extension, step,
                last_modified_at, source_version, is_indexed, missing_since)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)
                ON CONFLICT(variant_id, relative_path) DO UPDATE SET source_id = excluded.source_id,
                  file_name = excluded.file_name, extension = excluded.extension, step = excluded.step,
                  last_modified_at = excluded.last_modified_at, source_version = excluded.source_version,
                  is_indexed = 1, missing_since = NULL`,
              args: [assetId, variantId, asset.relativePath, asset.sourceId, asset.fileName, asset.parsed.extension,
                asset.parsed.step, asset.lastModifiedAt, asset.sourceVersion],
            });
          }
        }
      }
    }
  }

  const missing = [...existingAssetVersions.entries()].filter(([key]) => !seenAssetKeys.has(key)).map(([, asset]) => asset.id);
  if (missing.length > 0) {
    statements.push({
      sql: `UPDATE solution_assets SET missing_since = ? WHERE is_indexed = 0 AND missing_since IS NULL`,
      args: [startedAt],
    });
  }
  for (const warning of warnings) {
    statements.push({
      sql: "INSERT INTO sync_warnings (id, sync_run_id, severity, relative_path, message) VALUES (?, ?, ?, ?, ?)",
      args: [randomUUID(), runId, warning.severity, warning.path, warning.message],
    });
  }
  statements.push({
    sql: `UPDATE sync_runs SET status = 'completed', finished_at = ?, added_count = ?, updated_count = ?, missing_count = ? WHERE id = ?`,
    args: [new Date().toISOString(), added, updated, missing.length, runId],
  });

  await executeBatch(statements);
  return { warnings: warnings.length, added, updated, missing: missing.length };
}

export async function recordFailedSync(providerType: string, error: unknown): Promise<void> {
  const database = await getDatabase();
  const message = error instanceof Error ? error.message.slice(0, 1000) : "Onbekende synchronisatiefout.";
  await database.execute({
    sql: `INSERT INTO sync_runs (id, started_at, finished_at, portfolio_count, warning_count, status, provider_type, failure_message)
      VALUES (?, ?, ?, 0, 0, 'failed', ?, ?)`,
    args: [randomUUID(), new Date().toISOString(), new Date().toISOString(), providerType, message],
  });
}

export async function getAdminPortfolios(): Promise<AdminPortfolio[]> {
  const database = await getDatabase();
  const [portfolios, sections, exercises, assets] = await Promise.all([
    database.execute("SELECT * FROM portfolios ORDER BY code"),
    database.execute("SELECT * FROM sections ORDER BY portfolio_id, sort_order"),
    database.execute("SELECT * FROM exercises ORDER BY section_id, exercise_number, exercise_suffix"),
    database.execute(`SELECT solution_assets.*, solution_variants.exercise_id, solution_variants.kind
      FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      ORDER BY solution_assets.step, solution_assets.file_name`),
  ]);
  const now = new Date();

  return portfolios.rows.map((portfolio) => {
    const portfolioId = text(portfolio, "id");
    const portfolioStatus = resolvePortfolioPublication({
      visible: bool(portfolio.visible), limited: bool(portfolio.publication_limited), publishFrom: nullableText(portfolio, "publish_from"), publishUntil: nullableText(portfolio, "publish_until"),
    }, now);
    return {
      id: portfolioId,
      code: text(portfolio, "code"),
      title: nullableText(portfolio, "title_override") ?? text(portfolio, "title"),
      detectedTitle: text(portfolio, "title"),
      visible: bool(portfolio.visible),
      publishFrom: nullableText(portfolio, "publish_from"),
      publishUntil: nullableText(portfolio, "publish_until"),
      limited: bool(portfolio.publication_limited),
      effectiveStatus: portfolioStatus,
      effectivePublished: portfolioStatus.state === "visible",
      isIndexed: bool(portfolio.is_indexed),
      assignmentPdfPath: nullableText(portfolio, "assignment_pdf_path"),
      finalSolutionsPdfPath: nullableText(portfolio, "final_solutions_pdf_path"),
      sections: sections.rows.filter((section) => text(section, "portfolio_id") === portfolioId).map((section) => {
        const sectionId = text(section, "id");
        const sectionPublication = { mode: childMode(section), publishFrom: nullableText(section, "publish_from"), publishUntil: nullableText(section, "publish_until") };
        const sectionStatus = resolveChildPublication(sectionPublication, portfolioStatus, now);
        return {
          id: sectionId,
          order: Number(section.sort_order),
          title: text(section, "title"),
          visibilityMode: sectionPublication.mode,
          publishFrom: sectionPublication.publishFrom,
          publishUntil: sectionPublication.publishUntil,
          effectiveStatus: sectionStatus,
          effectivePublished: sectionStatus.state === "visible",
          isIndexed: bool(section.is_indexed),
          exercises: exercises.rows.filter((exercise) => text(exercise, "section_id") === sectionId).map((exercise) => {
            const exerciseId = text(exercise, "id");
            const exercisePublication = { mode: childMode(exercise), publishFrom: nullableText(exercise, "publish_from"), publishUntil: nullableText(exercise, "publish_until") };
            const exerciseStatus = resolveChildPublication(exercisePublication, sectionStatus, now);
            return {
              id: exerciseId,
              code: text(exercise, "exercise_code"),
              visible: childMode(exercise) === "visible",
              visibilityMode: exercisePublication.mode,
              publishFrom: exercisePublication.publishFrom,
              publishUntil: exercisePublication.publishUntil,
              effectiveStatus: exerciseStatus,
              effectivePublished: exerciseStatus.state === "visible",
              isIndexed: bool(exercise.is_indexed),
              assets: assets.rows.filter((asset) => text(asset, "exercise_id") === exerciseId).map((asset) => ({
                id: text(asset, "id"), fileName: text(asset, "file_name"), extension: text(asset, "extension"),
                step: Number(asset.step), variant: text(asset, "kind") as AdminAsset["variant"],
                isIndexed: bool(asset.is_indexed), lastModifiedAt: nullableText(asset, "last_modified_at"),
              })),
            };
          }),
        };
      }),
    };
  });
}

export async function getAdminPortfolio(id: string): Promise<AdminPortfolio | null> {
  return (await getAdminPortfolios()).find((portfolio) => portfolio.id === id) ?? null;
}

export async function getLatestWarnings() {
  const database = await getDatabase();
  const result = await database.execute(`SELECT sync_warnings.severity, sync_warnings.relative_path, sync_warnings.message
    FROM sync_warnings JOIN sync_runs ON sync_runs.id = sync_warnings.sync_run_id
    WHERE sync_runs.status = 'completed' ORDER BY sync_runs.finished_at DESC, sync_warnings.relative_path, sync_warnings.message`);
  return result.rows.map((row) => ({ severity: text(row, "severity"), relativePath: text(row, "relative_path"), message: text(row, "message") }));
}

export async function getPortfolioWarnings(portfolioId: string) {
  const portfolio = await getAdminPortfolio(portfolioId);
  if (!portfolio) return [];
  return (await getLatestWarnings()).filter((warning) => warning.relativePath.includes(`Portfolio ${portfolio.code} -`));
}

export async function setPortfolioPublication(id: string, mode: PortfolioVisibilityMode, limited: boolean, publishFrom: string | null, publishUntil: string | null): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE portfolios SET visible = ?, publication_limited = ?, publish_from = ?, publish_until = ? WHERE id = ?", args: [mode === "visible" ? 1 : 0, limited ? 1 : 0, publishFrom, publishUntil, id] });
}

export async function setPortfolioTitle(id: string, title: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE portfolios SET title_override = ? WHERE id = ?", args: [title.trim() || null, id] });
}

export async function setSectionPublication(id: string, mode: ChildVisibilityMode, publishFrom: string | null, publishUntil: string | null): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE sections SET visibility_mode = ?, publish_from = ?, publish_until = ? WHERE id = ?", args: [mode, publishFrom, publishUntil, id] });
}

export async function setSectionVisibility(id: string, visible: boolean): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE sections SET visibility_mode = ? WHERE id = ?", args: [visible ? "visible" : "hidden", id] });
}

export async function setExercisePublication(ids: string[], mode: ChildVisibilityMode, publishFrom: string | null, publishUntil: string | null): Promise<void> {
  if (ids.length === 0) return;
  const database = await getDatabase();
  await database.batch(ids.map((id) => ({
    sql: "UPDATE exercises SET visibility_mode = ?, visible = ?, publish_from = ?, publish_until = ? WHERE id = ?",
    args: [mode, mode === "visible" ? 1 : 0, publishFrom, publishUntil, id],
  })));
}

export async function setPortfolioVisibility(id: string, visible: boolean): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE portfolios SET visible = ? WHERE id = ?", args: [visible ? 1 : 0, id] });
}

export async function setExerciseVisibility(id: string, visible: boolean): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE exercises SET visibility_mode = ?, visible = ? WHERE id = ?", args: [visible ? "visible" : "hidden", visible ? 1 : 0, id] });
}

export async function getStudentPortfolios(): Promise<StudentPortfolio[]> {
  const database = await getDatabase();
  const [portfolios, sections, exercises] = await Promise.all([
    database.execute("SELECT * FROM portfolios WHERE is_indexed = 1 ORDER BY code"),
    database.execute("SELECT * FROM sections WHERE is_indexed = 1 ORDER BY portfolio_id, sort_order"),
    database.execute("SELECT * FROM exercises WHERE is_indexed = 1 ORDER BY section_id, exercise_number, exercise_suffix"),
  ]);
  const now = new Date();
  const result: StudentPortfolio[] = [];

  for (const portfolio of portfolios.rows) {
    const publication = resolvePortfolioPublication({ visible: bool(portfolio.visible), limited: bool(portfolio.publication_limited), publishFrom: nullableText(portfolio, "publish_from"), publishUntil: nullableText(portfolio, "publish_until") }, now);
    if (publication.state !== "visible") continue;
    const portfolioId = text(portfolio, "id");
    const studentPortfolio: StudentPortfolio = {
      id: portfolioId,
      code: text(portfolio, "code"),
      title: nullableText(portfolio, "title_override") ?? text(portfolio, "title"),
      sections: [],
    };
    for (const section of sections.rows.filter((row) => text(row, "portfolio_id") === portfolioId)) {
      const sectionPublication = { mode: childMode(section), publishFrom: nullableText(section, "publish_from"), publishUntil: nullableText(section, "publish_until") };
      const sectionStatus = resolveChildPublication(sectionPublication, publication, now);
      const sectionId = text(section, "id");
      studentPortfolio.sections.push({
        id: sectionId, title: text(section, "title"), order: Number(section.sort_order),
        exercises: exercises.rows.filter((row) => text(row, "section_id") === sectionId).map((exercise) => {
          const exercisePublication = { mode: childMode(exercise), publishFrom: nullableText(exercise, "publish_from"), publishUntil: nullableText(exercise, "publish_until") };
          return {
            id: text(exercise, "id"), code: text(exercise, "exercise_code"),
            visible: resolveChildPublication(exercisePublication, sectionStatus, now).state === "visible",
          };
        }),
      });
    }
    result.push(studentPortfolio);
  }
  return result;
}

export async function getStudentPortfolio(id: string): Promise<StudentPortfolio | null> {
  return (await getStudentPortfolios()).find((portfolio) => portfolio.id === id) ?? null;
}

export async function getVisibleExercise(id: string) {
  const database = await getDatabase();
  const exerciseResult = await database.execute({
    sql: `SELECT exercises.*, sections.title AS section_title, sections.visibility_mode AS section_visibility_mode,
      sections.publish_from AS section_publish_from, sections.publish_until AS section_publish_until,
      portfolios.code AS portfolio_code, portfolios.title AS portfolio_title, portfolios.title_override,
      portfolios.visible AS portfolio_visible, portfolios.publication_limited, portfolios.publish_from AS portfolio_publish_from, portfolios.publish_until AS portfolio_publish_until
      FROM exercises JOIN sections ON sections.id = exercises.section_id JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE exercises.id = ? AND exercises.is_indexed = 1 AND sections.is_indexed = 1 AND portfolios.is_indexed = 1`,
    args: [id],
  });
  const exercise = exerciseResult.rows[0];
  if (!exercise) return null;
  const now = new Date();
  const portfolioStatus = resolvePortfolioPublication({ visible: bool(exercise.portfolio_visible), limited: bool(exercise.publication_limited), publishFrom: nullableText(exercise, "portfolio_publish_from"), publishUntil: nullableText(exercise, "portfolio_publish_until") }, now);
  const sectionStatus = resolveChildPublication({ mode: childMode({ visibility_mode: exercise.section_visibility_mode }), publishFrom: nullableText(exercise, "section_publish_from"), publishUntil: nullableText(exercise, "section_publish_until") }, portfolioStatus, now);
  const exerciseStatus = resolveChildPublication({ mode: childMode(exercise), publishFrom: nullableText(exercise, "publish_from"), publishUntil: nullableText(exercise, "publish_until") }, sectionStatus, now);
  if (exerciseStatus.state !== "visible") return null;

  const assets = await database.execute({
    sql: `SELECT solution_assets.id, solution_assets.file_name, solution_assets.extension, solution_assets.step,
      solution_assets.last_modified_at, solution_variants.kind, solution_variants.label
      FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      WHERE solution_variants.exercise_id = ? AND solution_assets.is_indexed = 1 AND solution_variants.is_indexed = 1
      ORDER BY CASE solution_variants.kind WHEN 'standard' THEN 0 ELSE 1 END, solution_assets.step, solution_assets.file_name`,
    args: [id],
  });
  return {
    id, code: text(exercise, "exercise_code"), sectionTitle: text(exercise, "section_title"),
    portfolioCode: text(exercise, "portfolio_code"), portfolioTitle: nullableText(exercise, "title_override") ?? text(exercise, "portfolio_title"),
    assets: assets.rows.map((asset) => ({ id: text(asset, "id"), fileName: text(asset, "file_name"), extension: text(asset, "extension"), step: Number(asset.step), kind: text(asset, "kind") as "standard" | "alternative", label: text(asset, "label"), lastModifiedAt: nullableText(asset, "last_modified_at") })),
  };
}

export async function getPublicAsset(id: string) {
  const database = await getDatabase();
  const result = await database.execute({
    sql: `SELECT solution_assets.relative_path, solution_assets.source_id, solution_assets.file_name, solution_assets.extension,
      exercises.*, sections.visibility_mode AS section_visibility_mode, sections.publish_from AS section_publish_from,
      sections.publish_until AS section_publish_until, sections.is_indexed AS section_is_indexed,
      portfolios.visible AS portfolio_visible, portfolios.publication_limited, portfolios.publish_from AS portfolio_publish_from,
      portfolios.publish_until AS portfolio_publish_until, portfolios.is_indexed AS portfolio_is_indexed
      FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      JOIN exercises ON exercises.id = solution_variants.exercise_id JOIN sections ON sections.id = exercises.section_id
      JOIN portfolios ON portfolios.id = exercises.portfolio_id WHERE solution_assets.id = ?
        AND solution_assets.is_indexed = 1 AND solution_variants.is_indexed = 1`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row || !bool(row.is_indexed) || !bool(row.section_is_indexed) || !bool(row.portfolio_is_indexed)) return null;
  const now = new Date();
  const portfolioStatus = resolvePortfolioPublication({ visible: bool(row.portfolio_visible), limited: bool(row.publication_limited), publishFrom: nullableText(row, "portfolio_publish_from"), publishUntil: nullableText(row, "portfolio_publish_until") }, now);
  const sectionStatus = resolveChildPublication({ mode: childMode({ visibility_mode: row.section_visibility_mode }), publishFrom: nullableText(row, "section_publish_from"), publishUntil: nullableText(row, "section_publish_until") }, portfolioStatus, now);
  if (resolveChildPublication({ mode: childMode(row), publishFrom: nullableText(row, "publish_from"), publishUntil: nullableText(row, "publish_until") }, sectionStatus, now).state !== "visible") return null;
  return { sourceId: nullableText(row, "source_id") ?? text(row, "relative_path"), fileName: text(row, "file_name"), extension: text(row, "extension") };
}

export async function getPublicPortfolioDocument(portfolioId: string, kind: "assignment" | "final-solutions") {
  const database = await getDatabase();
  const result = await database.execute({ sql: "SELECT * FROM portfolios WHERE id = ? AND is_indexed = 1", args: [portfolioId] });
  const portfolio = result.rows[0];
  if (!portfolio || resolvePortfolioPublication({ visible: bool(portfolio.visible), limited: bool(portfolio.publication_limited), publishFrom: nullableText(portfolio, "publish_from"), publishUntil: nullableText(portfolio, "publish_until") }).state !== "visible") return null;
  const sourceId = kind === "assignment" ? nullableText(portfolio, "assignment_pdf_source_id") : nullableText(portfolio, "final_solutions_pdf_source_id");
  const relativePath = kind === "assignment" ? nullableText(portfolio, "assignment_pdf_path") : nullableText(portfolio, "final_solutions_pdf_path");
  if (!sourceId && !relativePath) return null;
  return { sourceId: sourceId ?? relativePath!, fileName: (relativePath ?? "document.pdf").split("/").at(-1) ?? "document.pdf", extension: "pdf" };
}

export async function getAdminPortfolioDocument(portfolioId: string, kind: "assignment" | "final-solutions") {
  const database = await getDatabase();
  const result = await database.execute({ sql: "SELECT * FROM portfolios WHERE id = ?", args: [portfolioId] });
  const portfolio = result.rows[0];
  if (!portfolio) return null;
  const sourceId = kind === "assignment" ? nullableText(portfolio, "assignment_pdf_source_id") : nullableText(portfolio, "final_solutions_pdf_source_id");
  const relativePath = kind === "assignment" ? nullableText(portfolio, "assignment_pdf_path") : nullableText(portfolio, "final_solutions_pdf_path");
  if (!sourceId && !relativePath) return null;
  return { sourceId: sourceId ?? relativePath!, fileName: (relativePath ?? "document.pdf").split("/").at(-1) ?? "document.pdf", extension: "pdf" };
}


export async function createErrorReport(input: { exerciseId: string; variant: "standard" | "alternative"; message: string; rateLimitKey: string }): Promise<void> {
  const exercise = await getVisibleExercise(input.exerciseId);
  if (!exercise || input.message.trim().length < 3 || input.message.trim().length > 2_000) throw new Error("De melding is ongeldig of de oplossing is niet beschikbaar.");
  const matchingAssets = exercise.assets.filter((asset) => asset.kind === input.variant);
  if (matchingAssets.length === 0) throw new Error("Deze oplossingsvariant bestaat niet.");
  const database = await getDatabase();
  const identifiers = await database.execute({ sql: "SELECT portfolio_id, section_id FROM exercises WHERE id = ?", args: [input.exerciseId] });
  const row = identifiers.rows[0];
  if (!row) throw new Error("Oefening niet gevonden.");
  const now = new Date();
  const windowStartedAt = new Date(Math.floor(now.getTime() / 600_000) * 600_000).toISOString();
  const current = await database.execute({ sql: "SELECT attempts FROM error_report_rate_limits WHERE key = ?", args: [input.rateLimitKey] });
  if (Number(current.rows[0]?.attempts ?? 0) >= 5) throw new Error("Probeer later opnieuw.");
  const snapshot = matchingAssets.map((asset) => ({ id: asset.id, fileName: asset.fileName, lastModifiedAt: asset.lastModifiedAt }));
  await database.batch([
    { sql: "DELETE FROM error_report_rate_limits WHERE window_started_at < ?", args: [new Date(now.getTime() - 3_600_000).toISOString()] },
    { sql: `INSERT INTO error_report_rate_limits (key, window_started_at, attempts) VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET attempts = error_report_rate_limits.attempts + 1, window_started_at = excluded.window_started_at`, args: [input.rateLimitKey, windowStartedAt] },
    { sql: `INSERT INTO error_reports (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, source_last_modified_at, message, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TODO', ?, ?)`, args: [randomUUID(), text(row, "portfolio_id"), text(row, "section_id"), input.exerciseId, input.variant, JSON.stringify(snapshot), matchingAssets.map((asset) => asset.lastModifiedAt).filter(Boolean).sort().at(-1) ?? null, input.message.trim(), now.toISOString(), now.toISOString()] },
  ]);
}

export interface AdminErrorReport {
  id: string;
  portfolioId: string;
  portfolioCode: string;
  portfolioTitle: string;
  sectionTitle: string;
  exerciseId: string;
  exerciseCode: string;
  variant: string;
  message: string;
  status: "TODO" | "DONE";
  pinned: boolean;
  adminNote: string;
  createdAt: string;
  completedAt: string | null;
  solutionConfiguredVisible: boolean;
  solutionStatus: EffectivePublication;
  solutionVisible: boolean;
}

export async function getOpenErrorReportCount(): Promise<number> {
  const database = await getDatabase();
  const result = await database.execute("SELECT COUNT(*) AS count FROM error_reports WHERE status = 'TODO'");
  return Number(result.rows[0]?.count ?? 0);
}

export async function getAdminErrorReports(): Promise<AdminErrorReport[]> {
  const database = await getDatabase();
  const result = await database.execute(`SELECT error_reports.*, portfolios.code AS portfolio_code, portfolios.title AS portfolio_title, portfolios.title_override,
    sections.title AS section_title, exercises.exercise_code, exercises.visibility_mode AS exercise_visibility_mode,
    exercises.publish_from AS exercise_publish_from, exercises.publish_until AS exercise_publish_until,
    sections.visibility_mode AS section_visibility_mode, sections.publish_from AS section_publish_from, sections.publish_until AS section_publish_until,
    portfolios.visible AS portfolio_visible, portfolios.publication_limited, portfolios.publish_from AS portfolio_publish_from, portfolios.publish_until AS portfolio_publish_until
    FROM error_reports JOIN portfolios ON portfolios.id = error_reports.portfolio_id JOIN sections ON sections.id = error_reports.section_id
    JOIN exercises ON exercises.id = error_reports.exercise_id`);
  const now = new Date();
  return result.rows.map((row) => {
    const portfolioStatus = resolvePortfolioPublication({ visible: bool(row.portfolio_visible), limited: bool(row.publication_limited), publishFrom: nullableText(row, "portfolio_publish_from"), publishUntil: nullableText(row, "portfolio_publish_until") }, now);
    const sectionStatus = resolveChildPublication({ mode: childMode({ visibility_mode: row.section_visibility_mode }), publishFrom: nullableText(row, "section_publish_from"), publishUntil: nullableText(row, "section_publish_until") }, portfolioStatus, now);
    const solutionStatus = resolveChildPublication({ mode: childMode({ visibility_mode: row.exercise_visibility_mode }), publishFrom: nullableText(row, "exercise_publish_from"), publishUntil: nullableText(row, "exercise_publish_until") }, sectionStatus, now);
    return { id: text(row, "id"), portfolioId: text(row, "portfolio_id"), portfolioCode: text(row, "portfolio_code"), portfolioTitle: nullableText(row, "title_override") ?? text(row, "portfolio_title"), sectionTitle: text(row, "section_title"), exerciseId: text(row, "exercise_id"), exerciseCode: text(row, "exercise_code"), variant: text(row, "variant_kind"), message: text(row, "message"), status: text(row, "status") === "DONE" ? "DONE" : "TODO", pinned: bool(row.pinned), adminNote: nullableText(row, "admin_note") ?? "", createdAt: text(row, "created_at"), completedAt: nullableText(row, "completed_at"), solutionConfiguredVisible: childMode({ visibility_mode: row.exercise_visibility_mode }) === "visible", solutionStatus, solutionVisible: solutionStatus.state === "visible" };
  });
}

export async function setErrorReportStatus(id: string, status: "TODO" | "DONE"): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.execute({ sql: "UPDATE error_reports SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?", args: [status, status === "DONE" ? now : null, now, id] });
}

export async function toggleErrorReportPin(id: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE error_reports SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?", args: [new Date().toISOString(), id] });
}

export async function saveErrorReportNote(id: string, note: string): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE error_reports SET admin_note = ?, updated_at = ? WHERE id = ?", args: [note.slice(0, 4000), new Date().toISOString(), id] });
}
