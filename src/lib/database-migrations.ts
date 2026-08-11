export interface DatabaseMigration {
  version: string;
  statements: string[];
}

export const migrations: DatabaseMigration[] = [
  {
    version: "001_initial",
    statements: [
      `CREATE TABLE IF NOT EXISTS portfolios (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        assignment_pdf_path TEXT,
        final_solutions_pdf_path TEXT,
        visible INTEGER NOT NULL DEFAULT 0,
        is_indexed INTEGER NOT NULL DEFAULT 1,
        indexed_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sections (
        id TEXT PRIMARY KEY,
        portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
        sort_order INTEGER NOT NULL,
        title TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        is_indexed INTEGER NOT NULL DEFAULT 1,
        UNIQUE(portfolio_id, sort_order)
      )`,
      `CREATE TABLE IF NOT EXISTS exercises (
        id TEXT PRIMARY KEY,
        portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
        section_id TEXT NOT NULL REFERENCES sections(id),
        exercise_code TEXT NOT NULL,
        exercise_number INTEGER NOT NULL,
        exercise_suffix TEXT NOT NULL,
        visible INTEGER NOT NULL DEFAULT 0,
        is_indexed INTEGER NOT NULL DEFAULT 1,
        UNIQUE(section_id, exercise_code)
      )`,
      `CREATE TABLE IF NOT EXISTS solution_variants (
        id TEXT PRIMARY KEY,
        exercise_id TEXT NOT NULL REFERENCES exercises(id),
        kind TEXT NOT NULL CHECK(kind IN ('standard', 'alternative')),
        label TEXT NOT NULL,
        UNIQUE(exercise_id, kind)
      )`,
      `CREATE TABLE IF NOT EXISTS solution_assets (
        id TEXT PRIMARY KEY,
        variant_id TEXT NOT NULL REFERENCES solution_variants(id),
        relative_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        extension TEXT NOT NULL,
        step INTEGER NOT NULL,
        UNIQUE(variant_id, relative_path)
      )`,
      `CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        portfolio_count INTEGER NOT NULL DEFAULT 0,
        warning_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sync_warnings (
        id TEXT PRIMARY KEY,
        sync_run_id TEXT NOT NULL REFERENCES sync_runs(id),
        severity TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        message TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: "002_publication_and_sources",
    statements: [
      "ALTER TABLE portfolios ADD COLUMN title_override TEXT",
      "ALTER TABLE portfolios ADD COLUMN assignment_pdf_source_id TEXT",
      "ALTER TABLE portfolios ADD COLUMN final_solutions_pdf_source_id TEXT",
      "ALTER TABLE portfolios ADD COLUMN publish_from TEXT",
      "ALTER TABLE portfolios ADD COLUMN publish_until TEXT",
      "ALTER TABLE portfolios ADD COLUMN last_seen_at TEXT",
      "ALTER TABLE sections ADD COLUMN visibility_mode TEXT NOT NULL DEFAULT 'inherit' CHECK(visibility_mode IN ('inherit', 'hidden', 'visible'))",
      "ALTER TABLE sections ADD COLUMN publish_from TEXT",
      "ALTER TABLE sections ADD COLUMN publish_until TEXT",
      "ALTER TABLE sections ADD COLUMN last_seen_at TEXT",
      "ALTER TABLE exercises ADD COLUMN visibility_mode TEXT NOT NULL DEFAULT 'inherit' CHECK(visibility_mode IN ('inherit', 'hidden', 'visible'))",
      "ALTER TABLE exercises ADD COLUMN publish_from TEXT",
      "ALTER TABLE exercises ADD COLUMN publish_until TEXT",
      "ALTER TABLE exercises ADD COLUMN last_seen_at TEXT",
      "ALTER TABLE solution_variants ADD COLUMN is_indexed INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE solution_assets ADD COLUMN source_id TEXT",
      "ALTER TABLE solution_assets ADD COLUMN last_modified_at TEXT",
      "ALTER TABLE solution_assets ADD COLUMN source_version TEXT",
      "ALTER TABLE solution_assets ADD COLUMN is_indexed INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE solution_assets ADD COLUMN missing_since TEXT",
      "ALTER TABLE sync_runs ADD COLUMN provider_type TEXT",
      "ALTER TABLE sync_runs ADD COLUMN added_count INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE sync_runs ADD COLUMN updated_count INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE sync_runs ADD COLUMN missing_count INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE sync_runs ADD COLUMN failure_message TEXT",
      "CREATE INDEX IF NOT EXISTS solution_assets_source_id_index ON solution_assets(source_id)",
    ],
  },
  {
    version: "003_error_reports",
    statements: [
      `CREATE TABLE IF NOT EXISTS error_reports (
        id TEXT PRIMARY KEY,
        portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
        section_id TEXT NOT NULL REFERENCES sections(id),
        exercise_id TEXT NOT NULL REFERENCES exercises(id),
        variant_kind TEXT NOT NULL CHECK(variant_kind IN ('standard', 'alternative')),
        asset_snapshot TEXT NOT NULL,
        source_last_modified_at TEXT,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW', 'VIEWED', 'RESOLVED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS error_report_rate_limits (
        key TEXT PRIMARY KEY,
        window_started_at TEXT NOT NULL,
        attempts INTEGER NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS error_reports_status_index ON error_reports(status)",
      "CREATE INDEX IF NOT EXISTS error_reports_exercise_index ON error_reports(exercise_id)",
    ],
  },
  {
    version: "004_migrate_v02_visibility_to_inheritance",
    statements: [
      "UPDATE exercises SET visibility_mode = CASE WHEN visible = 1 THEN 'visible' ELSE 'inherit' END",
    ],
  },
  {
    version: "005_correct_early_v1_exercise_default",
    statements: [
      "UPDATE exercises SET visibility_mode = 'inherit' WHERE visibility_mode = 'hidden' AND visible = 0 AND publish_from IS NULL AND publish_until IS NULL",
    ],
  },
];
