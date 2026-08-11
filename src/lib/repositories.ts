import type { InStatement, Row } from "@libsql/client";
import { randomUUID } from "node:crypto";

import type { IndexedPortfolio } from "@/lib/domain";
import { executeBatch, getDatabase } from "@/lib/database";

export interface AdminAsset {
  id: string;
  fileName: string;
  extension: string;
  step: number;
  variant: "standard" | "alternative";
}

export interface AdminExercise {
  id: string;
  code: string;
  visible: boolean;
  assets: AdminAsset[];
}

export interface AdminSection {
  id: string;
  order: number;
  title: string;
  exercises: AdminExercise[];
}

export interface AdminPortfolio {
  id: string;
  code: string;
  title: string;
  visible: boolean;
  assignmentPdfPath: string | null;
  finalSolutionsPdfPath: string | null;
  sections: AdminSection[];
}

export interface StudentPortfolio {
  code: string;
  title: string;
  sections: Array<{
    title: string;
    order: number;
    exercises: Array<{ id: string; code: string; visible: boolean }>;
  }>;
}

const bool = (value: unknown) => Number(value) === 1;
const text = (row: Row, field: string) => String(row[field] ?? "");

export async function persistIndex(portfolios: IndexedPortfolio[]): Promise<{ warnings: number }> {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const warnings = portfolios.flatMap((portfolio) => portfolio.warnings);
  const statements: InStatement[] = [
    {
      sql: "INSERT INTO sync_runs (id, started_at, portfolio_count, warning_count, status) VALUES (?, ?, ?, ?, 'running')",
      args: [runId, startedAt, portfolios.length, warnings.length],
    },
    { sql: "UPDATE portfolios SET is_indexed = 0", args: [] },
    { sql: "UPDATE sections SET is_indexed = 0", args: [] },
    { sql: "UPDATE exercises SET is_indexed = 0", args: [] },
    { sql: "DELETE FROM solution_assets", args: [] },
    { sql: "DELETE FROM solution_variants", args: [] },
    { sql: "DELETE FROM sync_warnings", args: [] },
  ];

  for (const portfolio of portfolios) {
    const portfolioId = `portfolio-${portfolio.code}`;
    statements.push({
      sql: `INSERT INTO portfolios (id, code, title, relative_path, assignment_pdf_path, final_solutions_pdf_path, is_indexed, indexed_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(id) DO UPDATE SET code = excluded.code, title = excluded.title, relative_path = excluded.relative_path,
              assignment_pdf_path = excluded.assignment_pdf_path, final_solutions_pdf_path = excluded.final_solutions_pdf_path,
              is_indexed = 1, indexed_at = excluded.indexed_at`,
      args: [portfolioId, portfolio.code, portfolio.title, portfolio.relativePath, portfolio.assignmentPdfPath, portfolio.finalSolutionsPdfPath, startedAt],
    });

    for (const section of portfolio.sections) {
      const sectionId = `${portfolioId}-section-${section.order}`;
      statements.push({
        sql: `INSERT INTO sections (id, portfolio_id, sort_order, title, relative_path, is_indexed)
              VALUES (?, ?, ?, ?, ?, 1)
              ON CONFLICT(id) DO UPDATE SET title = excluded.title, relative_path = excluded.relative_path, is_indexed = 1`,
        args: [sectionId, portfolioId, section.order, section.title, section.relativePath],
      });

      for (const exercise of section.exercises) {
        const exerciseId = `${sectionId}-exercise-${exercise.code}`;
        statements.push({
          sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, is_indexed)
                VALUES (?, ?, ?, ?, ?, ?, 1)
                ON CONFLICT(id) DO UPDATE SET exercise_number = excluded.exercise_number,
                  exercise_suffix = excluded.exercise_suffix, is_indexed = 1`,
          args: [exerciseId, portfolioId, sectionId, exercise.code, exercise.number, exercise.suffix],
        });

        for (const variant of ["standard", "alternative"] as const) {
          const variantAssets = exercise.assets.filter((asset) => asset.parsed.variant === variant);
          if (variantAssets.length === 0) continue;
          const variantId = `${exerciseId}-${variant}`;
          statements.push({
            sql: "INSERT INTO solution_variants (id, exercise_id, kind, label) VALUES (?, ?, ?, ?)",
            args: [variantId, exerciseId, variant, variant === "standard" ? "Standaard" : "Alternatief"],
          });
          for (const asset of variantAssets) {
            statements.push({
              sql: "INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step) VALUES (?, ?, ?, ?, ?, ?)",
              args: [randomUUID(), variantId, asset.relativePath, asset.fileName, asset.parsed.extension, asset.parsed.step],
            });
          }
        }
      }
    }
  }

  for (const warning of warnings) {
    statements.push({
      sql: "INSERT INTO sync_warnings (id, sync_run_id, severity, relative_path, message) VALUES (?, ?, ?, ?, ?)",
      args: [randomUUID(), runId, warning.severity, warning.path, warning.message],
    });
  }
  statements.push({
    sql: "UPDATE sync_runs SET status = 'completed', finished_at = ? WHERE id = ?",
    args: [new Date().toISOString(), runId],
  });

  await executeBatch(statements);
  return { warnings: warnings.length };
}

export async function getAdminPortfolios(): Promise<AdminPortfolio[]> {
  const database = await getDatabase();
  const portfolios = await database.execute("SELECT * FROM portfolios WHERE is_indexed = 1 ORDER BY CAST(code AS INTEGER), code");
  const sections = await database.execute("SELECT * FROM sections WHERE is_indexed = 1 ORDER BY portfolio_id, sort_order");
  const exercises = await database.execute("SELECT * FROM exercises WHERE is_indexed = 1 ORDER BY section_id, exercise_number, exercise_suffix");
  const assets = await database.execute(`SELECT solution_assets.*, solution_variants.exercise_id, solution_variants.kind
    FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
    ORDER BY solution_assets.step, solution_assets.file_name`);

  return portfolios.rows.map((portfolio) => {
    const portfolioId = text(portfolio, "id");
    return {
      id: portfolioId,
      code: text(portfolio, "code"),
      title: text(portfolio, "title"),
      visible: bool(portfolio.visible),
      assignmentPdfPath: (portfolio.assignment_pdf_path as string | null) ?? null,
      finalSolutionsPdfPath: (portfolio.final_solutions_pdf_path as string | null) ?? null,
      sections: sections.rows
        .filter((section) => text(section, "portfolio_id") === portfolioId)
        .map((section) => {
          const sectionId = text(section, "id");
          return {
            id: sectionId,
            order: Number(section.sort_order),
            title: text(section, "title"),
            exercises: exercises.rows
              .filter((exercise) => text(exercise, "section_id") === sectionId)
              .map((exercise) => {
                const exerciseId = text(exercise, "id");
                return {
                  id: exerciseId,
                  code: text(exercise, "exercise_code"),
                  visible: bool(exercise.visible),
                  assets: assets.rows
                    .filter((asset) => text(asset, "exercise_id") === exerciseId)
                    .map((asset) => ({
                      id: text(asset, "id"),
                      fileName: text(asset, "file_name"),
                      extension: text(asset, "extension"),
                      step: Number(asset.step),
                      variant: text(asset, "kind") as AdminAsset["variant"],
                    })),
                };
              }),
          };
        }),
    };
  });
}

export async function getLatestWarnings() {
  const database = await getDatabase();
  const result = await database.execute("SELECT severity, relative_path, message FROM sync_warnings ORDER BY relative_path, message");
  return result.rows.map((row) => ({
    severity: text(row, "severity"),
    relativePath: text(row, "relative_path"),
    message: text(row, "message"),
  }));
}

export async function setPortfolioVisibility(id: string, visible: boolean): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE portfolios SET visible = ? WHERE id = ?", args: [visible ? 1 : 0, id] });
}

export async function setExerciseVisibility(id: string, visible: boolean): Promise<void> {
  const database = await getDatabase();
  await database.execute({ sql: "UPDATE exercises SET visible = ? WHERE id = ?", args: [visible ? 1 : 0, id] });
}

export async function getStudentPortfolios(): Promise<StudentPortfolio[]> {
  const database = await getDatabase();
  const result = await database.execute(`SELECT portfolios.code AS portfolio_code, portfolios.title AS portfolio_title,
      sections.title AS section_title, sections.sort_order, exercises.id AS exercise_id, exercises.exercise_code, exercises.visible AS exercise_visible
    FROM portfolios
    JOIN sections ON sections.portfolio_id = portfolios.id AND sections.is_indexed = 1
    JOIN exercises ON exercises.section_id = sections.id AND exercises.is_indexed = 1
    WHERE portfolios.is_indexed = 1 AND portfolios.visible = 1
    ORDER BY CAST(portfolios.code AS INTEGER), portfolios.code, sections.sort_order, exercises.exercise_number, exercises.exercise_suffix`);
  const grouped = new Map<string, StudentPortfolio>();

  for (const row of result.rows) {
    const code = text(row, "portfolio_code");
    const portfolio = grouped.get(code) ?? { code, title: text(row, "portfolio_title"), sections: [] };
    let section = portfolio.sections.find((item) => item.order === Number(row.sort_order));
    if (!section) {
      section = { title: text(row, "section_title"), order: Number(row.sort_order), exercises: [] };
      portfolio.sections.push(section);
    }
    section.exercises.push({ id: text(row, "exercise_id"), code: text(row, "exercise_code"), visible: bool(row.exercise_visible) });
    grouped.set(code, portfolio);
  }
  return [...grouped.values()];
}

export async function getVisibleExercise(id: string) {
  const database = await getDatabase();
  const exercise = await database.execute({
    sql: `SELECT exercises.exercise_code, portfolios.code AS portfolio_code, portfolios.title AS portfolio_title
      FROM exercises JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE exercises.id = ? AND exercises.visible = 1 AND exercises.is_indexed = 1 AND portfolios.visible = 1 AND portfolios.is_indexed = 1`,
    args: [id],
  });
  if (exercise.rows.length === 0) return null;
  const assets = await database.execute({
    sql: `SELECT solution_assets.id, solution_assets.file_name, solution_assets.extension, solution_assets.step,
      solution_variants.kind, solution_variants.label
      FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      WHERE solution_variants.exercise_id = ? ORDER BY solution_variants.kind, solution_assets.step, solution_assets.file_name`,
    args: [id],
  });
  return {
    code: text(exercise.rows[0], "exercise_code"),
    portfolioCode: text(exercise.rows[0], "portfolio_code"),
    portfolioTitle: text(exercise.rows[0], "portfolio_title"),
    assets: assets.rows.map((asset) => ({
      id: text(asset, "id"),
      fileName: text(asset, "file_name"),
      extension: text(asset, "extension"),
      step: Number(asset.step),
      kind: text(asset, "kind") as "standard" | "alternative",
      label: text(asset, "label"),
    })),
  };
}

export async function getPublicAsset(id: string) {
  const database = await getDatabase();
  const result = await database.execute({
    sql: `SELECT solution_assets.relative_path, solution_assets.file_name, solution_assets.extension
      FROM solution_assets
      JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      JOIN exercises ON exercises.id = solution_variants.exercise_id
      JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE solution_assets.id = ? AND exercises.visible = 1 AND exercises.is_indexed = 1
        AND portfolios.visible = 1 AND portfolios.is_indexed = 1`,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { relativePath: text(row, "relative_path"), fileName: text(row, "file_name"), extension: text(row, "extension") };
}
