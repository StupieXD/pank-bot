import { getDatabase } from '../database.js';

export function createAnonymousQuestion({ guildId, userId, subject, question }) {
  const database = getDatabase();

  database.exec('BEGIN IMMEDIATE');
  try {
    const counter = database.prepare(`
      SELECT next_number
      FROM anonymous_qa_counters
      WHERE guild_id = ?
    `).get(guildId);

    const questionNumber = counter ? Number(counter.next_number) : 1;

    database.prepare(`
      INSERT INTO anonymous_qa_submissions (
        guild_id,
        question_number,
        user_id,
        subject,
        question
      ) VALUES (?, ?, ?, ?, ?)
    `).run(guildId, questionNumber, userId, subject || null, question);

    database.prepare(`
      INSERT INTO anonymous_qa_counters (guild_id, next_number)
      VALUES (?, ?)
      ON CONFLICT(guild_id)
      DO UPDATE SET next_number = excluded.next_number
    `).run(guildId, questionNumber + 1);

    const created = getAnonymousQuestion(guildId, questionNumber);
    database.exec('COMMIT');
    return created;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function getAnonymousQuestion(guildId, questionNumber) {
  return getDatabase().prepare(`
    SELECT *
    FROM anonymous_qa_submissions
    WHERE guild_id = ? AND question_number = ?
  `).get(guildId, questionNumber) ?? null;
}

export function listAnonymousQuestions(guildId, { status = null, limit = 20 } = {}) {
  const database = getDatabase();

  if (status) {
    return database.prepare(`
      SELECT *
      FROM anonymous_qa_submissions
      WHERE guild_id = ? AND status = ?
      ORDER BY question_number DESC
      LIMIT ?
    `).all(guildId, status, limit);
  }

  return database.prepare(`
    SELECT *
    FROM anonymous_qa_submissions
    WHERE guild_id = ?
    ORDER BY question_number DESC
    LIMIT ?
  `).all(guildId, limit);
}

export function getLatestSubmissionByUser(guildId, userId) {
  return getDatabase().prepare(`
    SELECT *
    FROM anonymous_qa_submissions
    WHERE guild_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(guildId, userId) ?? null;
}

export function markAnonymousQuestionAnswered({ guildId, id, answeredBy }) {
  return updateQuestionStatusWithAudit({
    guildId,
    questionNumber: id,
    actorId: answeredBy,
    nextStatus: 'answered',
    alreadyStatus: 'answered',
    action: 'marked_answered',
    updateSql: `
      UPDATE anonymous_qa_submissions
      SET status = 'answered',
          answered_by = ?,
          answered_at = CURRENT_TIMESTAMP,
          skipped_by = NULL,
          skipped_at = NULL,
          skipped_reason = NULL
      WHERE id = ? AND status != 'answered'
    `,
    updateParameters: (question) => [answeredBy, question.id]
  });
}

export function markAnonymousQuestionSkipped({ guildId, id, skippedBy, reason }) {
  return updateQuestionStatusWithAudit({
    guildId,
    questionNumber: id,
    actorId: skippedBy,
    nextStatus: 'skipped',
    alreadyStatus: 'skipped',
    action: 'marked_skipped',
    details: reason || null,
    updateSql: `
      UPDATE anonymous_qa_submissions
      SET status = 'skipped',
          skipped_by = ?,
          skipped_at = CURRENT_TIMESTAMP,
          skipped_reason = ?,
          answered_by = NULL,
          answered_at = NULL
      WHERE id = ? AND status != 'skipped'
    `,
    updateParameters: (question) => [skippedBy, reason || null, question.id]
  });
}

export function archiveAnonymousQuestion({ guildId, id, archivedBy }) {
  return updateQuestionStatusWithAudit({
    guildId,
    questionNumber: id,
    actorId: archivedBy,
    nextStatus: 'archived',
    alreadyStatus: 'archived',
    action: 'archived',
    updateSql: `
      UPDATE anonymous_qa_submissions
      SET status = 'archived',
          archived_by = ?,
          archived_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status != 'archived'
    `,
    updateParameters: (question) => [archivedBy, question.id]
  });
}

function updateQuestionStatusWithAudit({
  guildId,
  questionNumber,
  actorId,
  nextStatus,
  alreadyStatus,
  action,
  details = null,
  updateSql,
  updateParameters
}) {
  const database = getDatabase();
  database.exec('BEGIN IMMEDIATE');

  try {
    const question = database.prepare(`
      SELECT *
      FROM anonymous_qa_submissions
      WHERE guild_id = ? AND question_number = ?
    `).get(guildId, questionNumber);

    if (!question) {
      database.exec('ROLLBACK');
      return { changed: false, reason: 'not_found', question: null };
    }

    if (question.status === alreadyStatus) {
      database.exec('ROLLBACK');
      return { changed: false, reason: 'already_set', question };
    }

    const result = database.prepare(updateSql).run(...updateParameters(question));
    if (result.changes === 0) {
      database.exec('ROLLBACK');
      return { changed: false, reason: 'not_changed', question };
    }

    insertAuditRow(database, {
      guildId,
      submissionId: question.id,
      actorId,
      action,
      details
    });

    database.exec('COMMIT');
    return {
      changed: true,
      reason: null,
      question: { ...question, status: nextStatus }
    };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function revealAnonymousQuestion({ guildId, id, revealedBy }) {
  const database = getDatabase();
  database.exec('BEGIN IMMEDIATE');

  try {
    const question = database.prepare(`
      SELECT *
      FROM anonymous_qa_submissions
      WHERE guild_id = ? AND question_number = ?
    `).get(guildId, id);

    if (!question) {
      database.exec('ROLLBACK');
      return null;
    }

    database.prepare(`
      UPDATE anonymous_qa_submissions
      SET reveal_count = reveal_count + 1,
          last_revealed_by = ?,
          last_revealed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(revealedBy, question.id);

    insertAuditRow(database, {
      guildId,
      submissionId: question.id,
      actorId: revealedBy,
      action: 'identity_revealed',
      details: null
    });

    database.exec('COMMIT');
    return question;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function addAnonymousQaAudit({ guildId, submissionId, actorId, action, details }) {
  const database = getDatabase();
  const parent = database.prepare(`
    SELECT id
    FROM anonymous_qa_submissions
    WHERE id = ? AND guild_id = ?
  `).get(submissionId, guildId);

  if (!parent) {
    throw new Error(
      `Cannot add Anonymous Q&A audit entry: submission ${submissionId} does not exist in guild ${guildId}.`
    );
  }

  insertAuditRow(database, {
    guildId,
    submissionId,
    actorId,
    action,
    details
  });
}

function insertAuditRow(database, { guildId, submissionId, actorId, action, details }) {
  database.prepare(`
    INSERT INTO anonymous_qa_audit (
      guild_id,
      submission_id,
      actor_id,
      action,
      details
    ) VALUES (?, ?, ?, ?, ?)
  `).run(guildId, submissionId, actorId, action, details || null);
}

export function listAnonymousQaAudit(guildId, questionNumber) {
  return getDatabase().prepare(`
    SELECT audit.*
    FROM anonymous_qa_audit AS audit
    INNER JOIN anonymous_qa_submissions AS submission
      ON submission.id = audit.submission_id
    WHERE audit.guild_id = ?
      AND submission.guild_id = ?
      AND submission.question_number = ?
    ORDER BY audit.id ASC
  `).all(guildId, guildId, questionNumber);
}

export function permanentlyDeleteAnonymousQuestion({ guildId, id }) {
  const database = getDatabase();
  const question = getAnonymousQuestion(guildId, id);
  if (!question) return null;

  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare(`
      DELETE FROM anonymous_qa_audit
      WHERE guild_id = ? AND submission_id = ?
    `).run(guildId, question.id);

    database.prepare(`
      DELETE FROM anonymous_qa_submissions
      WHERE guild_id = ? AND id = ?
    `).run(guildId, question.id);

    const remaining = database.prepare(`
      SELECT COUNT(*) AS count
      FROM anonymous_qa_submissions
      WHERE guild_id = ?
    `).get(guildId);

    const numberingReset = Number(remaining.count) === 0;

    if (numberingReset) {
      database.prepare(`
        INSERT INTO anonymous_qa_counters (guild_id, next_number)
        VALUES (?, 1)
        ON CONFLICT(guild_id)
        DO UPDATE SET next_number = 1
      `).run(guildId);
    }

    database.exec('COMMIT');
    return { question, numberingReset };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function resetAnonymousQuestions({ guildId }) {
  const database = getDatabase();
  const countRow = database.prepare(`
    SELECT COUNT(*) AS count
    FROM anonymous_qa_submissions
    WHERE guild_id = ?
  `).get(guildId);

  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare(`
      DELETE FROM anonymous_qa_audit
      WHERE guild_id = ?
    `).run(guildId);

    database.prepare(`
      DELETE FROM anonymous_qa_submissions
      WHERE guild_id = ?
    `).run(guildId);

    database.prepare(`
      INSERT INTO anonymous_qa_counters (guild_id, next_number)
      VALUES (?, 1)
      ON CONFLICT(guild_id)
      DO UPDATE SET next_number = 1
    `).run(guildId);

    database.exec('COMMIT');

    return {
      deletedCount: Number(countRow.count),
      numberingReset: true
    };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
