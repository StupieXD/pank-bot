import { getDatabase } from './database.js';

export function initialiseDatabase() {
  const database = getDatabase();

  database.exec(`
    CREATE TABLE IF NOT EXISTS moderation_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      case_number INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      case_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      expires_at TEXT,
      removed_at TEXT,
      removed_by TEXT,
      removal_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      UNIQUE (guild_id, case_number)
    );

    CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild
      ON moderation_cases (guild_id);

    CREATE INDEX IF NOT EXISTS idx_moderation_cases_user
      ON moderation_cases (guild_id, user_id);

    CREATE INDEX IF NOT EXISTS idx_moderation_cases_moderator
      ON moderation_cases (guild_id, moderator_id);

    CREATE INDEX IF NOT EXISTS idx_moderation_cases_type
      ON moderation_cases (guild_id, case_type);

    CREATE INDEX IF NOT EXISTS idx_moderation_cases_status
      ON moderation_cases (guild_id, status);

    CREATE TABLE IF NOT EXISTS moderation_case_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      moderation_case_id INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      case_number INTEGER NOT NULL,
      edited_by TEXT NOT NULL,
      previous_reason TEXT NOT NULL,
      new_reason TEXT NOT NULL,
      edited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (moderation_case_id)
        REFERENCES moderation_cases (id)
        ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_moderation_case_edits_case
      ON moderation_case_edits (guild_id, case_number, edited_at);
  `);

  console.log('â Database initialised.');
}
