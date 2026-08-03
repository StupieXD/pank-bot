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


    CREATE TABLE IF NOT EXISTS channel_locks (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      send_messages_state INTEGER NOT NULL,
      send_messages_in_threads_state INTEGER NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (guild_id, channel_id)
    );

    CREATE INDEX IF NOT EXISTS idx_channel_locks_guild
      ON channel_locks (guild_id);


    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT NOT NULL,
      setting_key TEXT NOT NULL,
      setting_value TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (guild_id, setting_key)
    );

    CREATE INDEX IF NOT EXISTS idx_guild_config_guild
      ON guild_config (guild_id);

    CREATE TABLE IF NOT EXISTS anonymous_qa_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      question_number INTEGER,
      user_id TEXT NOT NULL,
      subject TEXT,
      question TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      answered_by TEXT,
      answered_at TEXT,
      archived_by TEXT,
      archived_at TEXT,
      skipped_by TEXT,
      skipped_at TEXT,
      skipped_reason TEXT,
      reveal_count INTEGER NOT NULL DEFAULT 0,
      last_revealed_by TEXT,
      last_revealed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_anonymous_qa_guild_status
      ON anonymous_qa_submissions (guild_id, status, created_at);

    CREATE INDEX IF NOT EXISTS idx_anonymous_qa_user
      ON anonymous_qa_submissions (guild_id, user_id, created_at);

    CREATE TABLE IF NOT EXISTS anonymous_qa_counters (
      guild_id TEXT PRIMARY KEY,
      next_number INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS anonymous_qa_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      submission_id INTEGER NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (submission_id) REFERENCES anonymous_qa_submissions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_anonymous_qa_audit_submission
      ON anonymous_qa_audit (guild_id, submission_id, created_at);

    CREATE TABLE IF NOT EXISTS lockdown_state (
      guild_id TEXT PRIMARY KEY,
      active INTEGER NOT NULL DEFAULT 0,
      enabled_by TEXT,
      reason TEXT,
      enabled_at TEXT,
      disabled_by TEXT,
      disabled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS lockdown_channel_states (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      send_messages_state INTEGER NOT NULL,
      send_messages_in_threads_state INTEGER NOT NULL,
      create_public_threads_state INTEGER NOT NULL,
      create_private_threads_state INTEGER NOT NULL,
      PRIMARY KEY (guild_id, channel_id)
    );

    CREATE INDEX IF NOT EXISTS idx_lockdown_channel_states_guild
      ON lockdown_channel_states (guild_id);

  `);

  migrateAnonymousQaNumbering(database);
  migrateAnonymousQaAuditForeignKey(database);

  console.log('Success: Database initialised.');
}


function migrateAnonymousQaNumbering(database) {
  const columns = database.prepare(
    `PRAGMA table_info(anonymous_qa_submissions)`
  ).all();

  if (!columns.some((column) => column.name === 'question_number')) {
    database.exec(
      'ALTER TABLE anonymous_qa_submissions ADD COLUMN question_number INTEGER'
    );
  }

  const guilds = database.prepare(`
    SELECT DISTINCT guild_id
    FROM anonymous_qa_submissions
  `).all();

  for (const { guild_id: guildId } of guilds) {
    const questions = database.prepare(`
      SELECT id, question_number
      FROM anonymous_qa_submissions
      WHERE guild_id = ?
      ORDER BY id ASC
    `).all(guildId);

    let nextNumber = 1;
    for (const question of questions) {
      if (question.question_number == null) {
        database.prepare(`
          UPDATE anonymous_qa_submissions
          SET question_number = ?
          WHERE id = ?
        `).run(nextNumber, question.id);
      }

      nextNumber = Math.max(
        nextNumber + 1,
        Number(question.question_number ?? nextNumber) + 1
      );
    }

    database.prepare(`
      INSERT INTO anonymous_qa_counters (guild_id, next_number)
      VALUES (?, ?)
      ON CONFLICT(guild_id)
      DO UPDATE SET next_number = MAX(next_number, excluded.next_number)
    `).run(guildId, nextNumber);
  }

  const qaColumns = database.prepare(`
    PRAGMA table_info(anonymous_qa_submissions)
  `).all();
  const qaColumnNames = new Set(qaColumns.map((column) => column.name));

  if (!qaColumnNames.has('skipped_by')) {
    database.exec('ALTER TABLE anonymous_qa_submissions ADD COLUMN skipped_by TEXT');
  }
  if (!qaColumnNames.has('skipped_at')) {
    database.exec('ALTER TABLE anonymous_qa_submissions ADD COLUMN skipped_at TEXT');
  }
  if (!qaColumnNames.has('skipped_reason')) {
    database.exec('ALTER TABLE anonymous_qa_submissions ADD COLUMN skipped_reason TEXT');
  }

  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_anonymous_qa_guild_number
      ON anonymous_qa_submissions (guild_id, question_number)
  `);
}


function migrateAnonymousQaAuditForeignKey(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_key TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrationKey = 'anonymous_qa_audit_fk_v2';
  const applied = database.prepare(`
    SELECT migration_key
    FROM schema_migrations
    WHERE migration_key = ?
  `).get(migrationKey);

  if (applied) return;

  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(`
      DROP INDEX IF EXISTS idx_anonymous_qa_audit_submission;
      ALTER TABLE anonymous_qa_audit RENAME TO anonymous_qa_audit_legacy;

      CREATE TABLE anonymous_qa_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        submission_id INTEGER NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (submission_id)
          REFERENCES anonymous_qa_submissions(id)
          ON DELETE CASCADE
      );

      INSERT INTO anonymous_qa_audit (
        id,
        guild_id,
        submission_id,
        actor_id,
        action,
        details,
        created_at
      )
      SELECT
        audit.id,
        audit.guild_id,
        audit.submission_id,
        audit.actor_id,
        audit.action,
        audit.details,
        audit.created_at
      FROM anonymous_qa_audit_legacy AS audit
      INNER JOIN anonymous_qa_submissions AS submission
        ON submission.id = audit.submission_id
       AND submission.guild_id = audit.guild_id;

      DROP TABLE anonymous_qa_audit_legacy;

      CREATE INDEX idx_anonymous_qa_audit_submission
        ON anonymous_qa_audit (guild_id, submission_id, created_at);
    `);

    database.prepare(`
      INSERT INTO schema_migrations (migration_key)
      VALUES (?)
    `).run(migrationKey);

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
