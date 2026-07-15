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
  `);

  console.log('✅ Database initialised.');
}
