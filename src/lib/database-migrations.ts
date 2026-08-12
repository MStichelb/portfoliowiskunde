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
  {
    version: "006_simplify_error_report_workflow",
    statements: [
      `CREATE TABLE error_reports_v2 (
        id TEXT PRIMARY KEY,
        portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
        section_id TEXT NOT NULL REFERENCES sections(id),
        exercise_id TEXT NOT NULL REFERENCES exercises(id),
        variant_kind TEXT NOT NULL CHECK(variant_kind IN ('standard', 'alternative')),
        asset_snapshot TEXT NOT NULL,
        source_last_modified_at TEXT,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO', 'DONE')),
        pinned INTEGER NOT NULL DEFAULT 0,
        admin_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        completed_at TEXT,
        updated_at TEXT NOT NULL
      )`,
      `INSERT INTO error_reports_v2 (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, source_last_modified_at, message, status, created_at, completed_at, updated_at)
        SELECT id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, source_last_modified_at, message,
          CASE WHEN status = 'RESOLVED' THEN 'DONE' ELSE 'TODO' END, created_at,
          CASE WHEN status = 'RESOLVED' THEN updated_at ELSE NULL END, updated_at FROM error_reports`,
      "DROP TABLE error_reports",
      "ALTER TABLE error_reports_v2 RENAME TO error_reports",
      "CREATE INDEX IF NOT EXISTS error_reports_status_index ON error_reports(status)",
      "CREATE INDEX IF NOT EXISTS error_reports_exercise_index ON error_reports(exercise_id)",
    ],
  },
  {
    version: "007_remove_inherit_visibility",
    statements: [
      "ALTER TABLE portfolios ADD COLUMN publication_limited INTEGER NOT NULL DEFAULT 0",
      "UPDATE portfolios SET publication_limited = CASE WHEN publish_from IS NOT NULL OR publish_until IS NOT NULL THEN 1 ELSE 0 END",
      "UPDATE sections SET visibility_mode = 'visible' WHERE visibility_mode = 'inherit'",
      "UPDATE exercises SET visibility_mode = 'visible' WHERE visibility_mode = 'inherit'",
    ],
  },
  {
    version: "008_section_publication_windows",
    statements: [
      "ALTER TABLE sections ADD COLUMN publication_limited INTEGER NOT NULL DEFAULT 0",
      "UPDATE sections SET publication_limited = CASE WHEN publish_from IS NOT NULL OR publish_until IS NOT NULL THEN 1 ELSE 0 END",
    ],
  },
  {
    version: "009_alternative_solution_visibility",
    statements: ["ALTER TABLE exercises ADD COLUMN show_alternative_to_students INTEGER NOT NULL DEFAULT 1"],
  },
  {
    version: "010_learning_spaces",
    statements: [
      `CREATE TABLE learning_spaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        short_label TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        storage_provider TEXT NOT NULL DEFAULT 'local' CHECK(storage_provider IN ('local', 'onedrive')),
        local_source_path TEXT,
        onedrive_drive_id TEXT,
        onedrive_folder_id TEXT,
        onedrive_folder_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `INSERT INTO learning_spaces (id, name, slug, short_label, sort_order, is_active, storage_provider, local_source_path, created_at, updated_at)
        VALUES ('space-6', '6de jaar', '6', '6', 60, 1, 'local', (SELECT value FROM app_settings WHERE key = 'local_source_path'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      `INSERT INTO learning_spaces (id, name, slug, short_label, sort_order, is_active, storage_provider, created_at, updated_at)
        VALUES ('space-5', '5de jaar', '5', '5', 50, 1, 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('legacy_default_learning_space_id', 'space-6', CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING`,
      "ALTER TABLE portfolios ADD COLUMN learning_space_id TEXT REFERENCES learning_spaces(id)",
      "ALTER TABLE portfolios ADD COLUMN portfolio_code TEXT",
      "ALTER TABLE portfolios ADD COLUMN theme_id TEXT",
      "UPDATE portfolios SET learning_space_id = 'space-6', portfolio_code = code",
      "UPDATE portfolios SET code = learning_space_id || ':' || portfolio_code",
      "ALTER TABLE sync_runs ADD COLUMN learning_space_id TEXT REFERENCES learning_spaces(id)",
      "UPDATE sync_runs SET learning_space_id = 'space-6'",
      `CREATE TABLE themes (
        id TEXT PRIMARY KEY,
        learning_space_id TEXT NOT NULL REFERENCES learning_spaces(id),
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(learning_space_id, name)
      )`,
      "CREATE INDEX portfolios_learning_space_index ON portfolios(learning_space_id, portfolio_code)",
      "CREATE INDEX sync_runs_learning_space_index ON sync_runs(learning_space_id, started_at)",
      "CREATE INDEX themes_learning_space_index ON themes(learning_space_id, sort_order)",
    ],
  },
];
