import { getDatabase } from '../database.js';

export function createAnonymousQuestion({ guildId, userId, subject, question }) {
  const database = getDatabase();
  const result = database.prepare(`
    INSERT INTO anonymous_qa_submissions (guild_id, user_id, subject, question)
    VALUES (?, ?, ?, ?)
  `).run(guildId, userId, subject || null, question);
  return getAnonymousQuestion(guildId, Number(result.lastInsertRowid));
}

export function getAnonymousQuestion(guildId, id) {
  return getDatabase().prepare(`
    SELECT * FROM anonymous_qa_submissions WHERE guild_id = ? AND id = ?
  `).get(guildId, id) ?? null;
}

export function listAnonymousQuestions(guildId, { status = null, limit = 20 } = {}) {
  const database = getDatabase();
  if (status) {
    return database.prepare(`
      SELECT * FROM anonymous_qa_submissions
      WHERE guild_id = ? AND status = ?
      ORDER BY id DESC LIMIT ?
    `).all(guildId, status, limit);
  }
  return database.prepare(`
    SELECT * FROM anonymous_qa_submissions
    WHERE guild_id = ? ORDER BY id DESC LIMIT ?
  `).all(guildId, limit);
}

export function getLatestSubmissionByUser(guildId, userId) {
  return getDatabase().prepare(`
    SELECT * FROM anonymous_qa_submissions
    WHERE guild_id = ? AND user_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(guildId, userId) ?? null;
}

export function markAnonymousQuestionAnswered({ guildId, id, answeredBy }) {
  return getDatabase().prepare(`
    UPDATE anonymous_qa_submissions
    SET status = 'answered', answered_by = ?, answered_at = CURRENT_TIMESTAMP
    WHERE guild_id = ? AND id = ? AND status != 'answered'
  `).run(answeredBy, guildId, id).changes > 0;
}

export function archiveAnonymousQuestion({ guildId, id, archivedBy }) {
  return getDatabase().prepare(`
    UPDATE anonymous_qa_submissions
    SET status = 'archived', archived_by = ?, archived_at = CURRENT_TIMESTAMP
    WHERE guild_id = ? AND id = ?
  `).run(archivedBy, guildId, id).changes > 0;
}

export function revealAnonymousQuestion({ guildId, id, revealedBy }) {
  const database = getDatabase();
  const question = getAnonymousQuestion(guildId, id);
  if (!question) return null;
  database.prepare(`
    UPDATE anonymous_qa_submissions
    SET reveal_count = reveal_count + 1, last_revealed_by = ?, last_revealed_at = CURRENT_TIMESTAMP
    WHERE guild_id = ? AND id = ?
  `).run(revealedBy, guildId, id);
  addAnonymousQaAudit({ guildId, submissionId: id, actorId: revealedBy, action: 'identity_revealed', details: null });
  return question;
}

export function addAnonymousQaAudit({ guildId, submissionId, actorId, action, details }) {
  getDatabase().prepare(`
    INSERT INTO anonymous_qa_audit (guild_id, submission_id, actor_id, action, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, submissionId, actorId, action, details || null);
}

export function listAnonymousQaAudit(guildId, submissionId) {
  return getDatabase().prepare(`
    SELECT * FROM anonymous_qa_audit
    WHERE guild_id = ? AND submission_id = ?
    ORDER BY id ASC
  `).all(guildId, submissionId);
}
