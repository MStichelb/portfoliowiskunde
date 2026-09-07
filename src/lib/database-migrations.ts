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
  {
    version: "011_archive_missing_index_and_login_protection",
    statements: [
      "ALTER TABLE portfolios ADD COLUMN archived_at TEXT",
      "ALTER TABLE sections ADD COLUMN archived_at TEXT",
      "ALTER TABLE exercises ADD COLUMN archived_at TEXT",
      "ALTER TABLE solution_variants ADD COLUMN archived_at TEXT",
      "ALTER TABLE solution_assets ADD COLUMN archived_at TEXT",
      `CREATE TABLE admin_login_attempts (
        key TEXT PRIMARY KEY,
        window_started_at TEXT NOT NULL,
        attempts INTEGER NOT NULL
      )`,
    ],
  },
  {
    version: "012_revocable_admin_sessions",
    statements: [
      `CREATE TABLE admin_sessions (
        id TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      "CREATE INDEX admin_sessions_expiry_index ON admin_sessions(expires_at)",
    ],
  },
  {
    version: "013_synchronization_leases",
    statements: [
      `CREATE TABLE sync_leases (
        learning_space_id TEXT PRIMARY KEY REFERENCES learning_spaces(id),
        owner_id TEXT NOT NULL,
        acquired_until TEXT NOT NULL
      )`,
      "CREATE INDEX sync_leases_expiry_index ON sync_leases(acquired_until)",
    ],
  },
  {
    version: "014_google_drive_learning_spaces",
    statements: [
      "ALTER TABLE learning_spaces ADD COLUMN source_type TEXT NOT NULL DEFAULT 'local' CHECK(source_type IN ('local', 'onedrive', 'google_drive'))",
      "ALTER TABLE learning_spaces ADD COLUMN google_drive_folder_id TEXT",
      "ALTER TABLE learning_spaces ADD COLUMN google_drive_folder_label TEXT",
      "UPDATE learning_spaces SET source_type = storage_provider",
    ],
  },
  {
    version: "015_learning_space_lifecycle",
    statements: [
      "ALTER TABLE learning_spaces ADD COLUMN archived_at TEXT",
      "UPDATE learning_spaces SET archived_at = updated_at WHERE is_active = 0",
      "CREATE INDEX learning_spaces_lifecycle_index ON learning_spaces(archived_at, sort_order)",
    ],
  },
  {
    version: "016_learning_space_sources",
    statements: [
      `CREATE TABLE learning_space_sources (
        id TEXT PRIMARY KEY,
        learning_space_id TEXT NOT NULL REFERENCES learning_spaces(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('primary', 'mirror')),
        provider_type TEXT NOT NULL CHECK(provider_type IN ('local', 'onedrive', 'google_drive')),
        is_active INTEGER NOT NULL DEFAULT 0,
        local_source_path TEXT,
        onedrive_drive_id TEXT,
        onedrive_folder_id TEXT,
        onedrive_folder_path TEXT,
        google_drive_folder_id TEXT,
        google_drive_folder_label TEXT,
        last_validated_at TEXT,
        last_validation_status TEXT CHECK(last_validation_status IN ('valid', 'invalid')),
        last_validation_message TEXT,
        mirror_completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(learning_space_id, role)
      )`,
      "CREATE UNIQUE INDEX learning_space_active_source_index ON learning_space_sources(learning_space_id) WHERE is_active = 1",
      "CREATE INDEX learning_space_sources_provider_index ON learning_space_sources(provider_type, learning_space_id)",
      `INSERT INTO learning_space_sources (id, learning_space_id, role, provider_type, is_active, local_source_path,
        onedrive_drive_id, onedrive_folder_id, onedrive_folder_path, google_drive_folder_id, google_drive_folder_label, created_at, updated_at)
        SELECT id || ':primary', id, 'primary', source_type, 1, local_source_path,
          onedrive_drive_id, onedrive_folder_id, onedrive_folder_path, google_drive_folder_id, google_drive_folder_label, created_at, updated_at
        FROM learning_spaces`,
    ],
  },
  {
    version: "017_sync_run_source_reference",
    statements: [
      "ALTER TABLE sync_runs ADD COLUMN source_id TEXT REFERENCES learning_space_sources(id)",
    ],
  },
  {
    version: "018_ui_card_metadata",
    statements: [
      "ALTER TABLE learning_spaces ADD COLUMN description TEXT NOT NULL DEFAULT 'Portfolio''s en uitwerkingen.'",
      "ALTER TABLE learning_spaces ADD COLUMN card_color TEXT NOT NULL DEFAULT '#DCEFE9'",
      "ALTER TABLE portfolios ADD COLUMN card_color TEXT NOT NULL DEFAULT '#E7EEF2'",
    ],
  },
  {
    version: "019_error_report_reporter_name",
    statements: ["ALTER TABLE error_reports ADD COLUMN reporter_name TEXT"],
  },
  {
    version: "020_portfolio_hints_document",
    statements: [
      "ALTER TABLE portfolios ADD COLUMN hints_document_path TEXT",
      "ALTER TABLE portfolios ADD COLUMN hints_document_source_id TEXT",
    ],
  },
  {
    version: "021_multi_user_foundation",
    statements: [
      `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        email TEXT,
        role TEXT NOT NULL CHECK(role IN ('superadmin', 'teacher', 'student')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `INSERT INTO users (id, display_name, role, status, created_at, updated_at)
        VALUES ('user-legacy-superadmin', 'Huidige beheerder', 'superadmin', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      `CREATE TABLE external_identities (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_subject TEXT NOT NULL,
        provider_platform TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(provider, provider_subject)
      )`,
      `CREATE TABLE learning_space_members (
        learning_space_id TEXT NOT NULL REFERENCES learning_spaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('owner', 'editor')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(learning_space_id, user_id)
      )`,
      `CREATE TABLE learning_space_group_mappings (
        id TEXT PRIMARY KEY,
        learning_space_id TEXT NOT NULL REFERENCES learning_spaces(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        external_group_id TEXT NOT NULL,
        external_group_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(learning_space_id, provider, external_group_id)
      )`,
      `CREATE TABLE storage_connections (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id),
        provider TEXT NOT NULL CHECK(provider IN ('onedrive', 'google_drive')),
        display_name TEXT NOT NULL,
        encrypted_credentials TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disconnected')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      "ALTER TABLE learning_space_sources ADD COLUMN storage_connection_id TEXT REFERENCES storage_connections(id)",
      "ALTER TABLE admin_sessions ADD COLUMN user_id TEXT REFERENCES users(id)",
      "UPDATE admin_sessions SET user_id = 'user-legacy-superadmin' WHERE user_id IS NULL",
      `INSERT INTO storage_connections (id, owner_user_id, provider, display_name, encrypted_credentials, status, created_at, updated_at)
        VALUES ('connection-onedrive-user-legacy-superadmin', 'user-legacy-superadmin', 'onedrive', 'Bestaande OneDrive-verbinding',
          (SELECT value FROM app_settings WHERE key = 'onedrive_tokens'),
          CASE WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'onedrive_tokens') THEN 'active' ELSE 'disconnected' END,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      `UPDATE learning_space_sources SET storage_connection_id = 'connection-onedrive-user-legacy-superadmin'
        WHERE provider_type = 'onedrive' AND storage_connection_id IS NULL
          AND EXISTS (SELECT 1 FROM storage_connections WHERE id = 'connection-onedrive-user-legacy-superadmin')`,
      "DELETE FROM app_settings WHERE key = 'onedrive_tokens'",
      "CREATE INDEX users_role_status_index ON users(role, status)",
      "CREATE INDEX external_identities_user_index ON external_identities(user_id)",
      "CREATE INDEX learning_space_members_user_index ON learning_space_members(user_id, learning_space_id)",
      "CREATE INDEX learning_space_group_mappings_external_index ON learning_space_group_mappings(provider, external_group_id)",
      "CREATE INDEX storage_connections_owner_index ON storage_connections(owner_user_id, provider)",
      "CREATE INDEX learning_space_sources_connection_index ON learning_space_sources(storage_connection_id)",
      "CREATE INDEX admin_sessions_user_index ON admin_sessions(user_id)",
    ],
  },
  {
    version: "022_smartschool_oauth",
    statements: [
      `CREATE TABLE external_identities_v2 (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_subject TEXT NOT NULL,
        provider_platform TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(provider, provider_subject, provider_platform)
      )`,
      `INSERT INTO external_identities_v2 (id, user_id, provider, provider_subject, provider_platform, created_at, updated_at)
        SELECT id, user_id, provider, provider_subject, COALESCE(provider_platform, ''), created_at, updated_at FROM external_identities`,
      "DROP TABLE external_identities",
      "ALTER TABLE external_identities_v2 RENAME TO external_identities",
      `CREATE TABLE external_identity_groups (
        identity_id TEXT NOT NULL REFERENCES external_identities(id) ON DELETE CASCADE,
        external_group_id TEXT NOT NULL,
        external_group_name TEXT,
        membership_type TEXT NOT NULL CHECK(membership_type IN ('direct', 'parent')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY(identity_id, external_group_id, membership_type)
      )`,
      "CREATE INDEX external_identities_user_index ON external_identities(user_id)",
      "CREATE INDEX external_identity_groups_identity_index ON external_identity_groups(identity_id)",
      "CREATE INDEX external_identity_groups_external_index ON external_identity_groups(external_group_id)",
    ],
  },
  {
    version: "023_multi_user_access_management",
    statements: [
      "ALTER TABLE users ADD COLUMN first_name TEXT",
      "ALTER TABLE users ADD COLUMN last_name TEXT",
      "ALTER TABLE users ADD COLUMN class_group_override_id TEXT",
      `CREATE TABLE individual_learning_space_access (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        learning_space_id TEXT NOT NULL REFERENCES learning_spaces(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id, learning_space_id)
      )`,
      "CREATE INDEX individual_learning_space_access_space_index ON individual_learning_space_access(learning_space_id, user_id)",
      "CREATE INDEX users_class_override_index ON users(class_group_override_id)",
    ],
  },
  {
    version: "024_legacy_learning_space_ownership",
    statements: [
      `INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at)
        SELECT DISTINCT source.learning_space_id, connection.owner_user_id, 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM learning_space_sources source
        INNER JOIN storage_connections connection ON connection.id = source.storage_connection_id
        WHERE connection.owner_user_id = 'user-legacy-superadmin'
          AND connection.provider = 'onedrive'
        ON CONFLICT(learning_space_id, user_id) DO NOTHING`,
    ],
  },
  {
    version: "025_editor_student_access_delegation",
    statements: [
      "ALTER TABLE learning_spaces ADD COLUMN editors_can_manage_access INTEGER NOT NULL DEFAULT 0",
    ],
  },
];
