import { getDatabase } from '../database.js';

const DEFAULT_CASE_LIMIT = 50;
const MAX_CASE_LIMIT = 100;

export function createModerationCase({
  guildId,
  userId,
  moderatorId,
  caseType,
  reason,
  status = 'active',
  expiresAt = null
}) {
  validateRequiredString(guildId, 'guildId');
  validateRequiredString(userId, 'userId');
  validateRequiredString(moderatorId, 'moderatorId');
  validateRequiredString(caseType, 'caseType');
  validateRequiredString(reason, 'reason');

  const database = getDatabase();

  database.exec('BEGIN IMMEDIATE;');

  try {
    const caseNumber = getNextCaseNumberWithinTransaction(
      database,
      guildId
    );

    database
      .prepare(`
        INSERT INTO moderation_cases (
          guild_id,
          case_number,
          user_id,
          moderator_id,
          case_type,
          reason,
          status,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        guildId,
        caseNumber,
        userId,
        moderatorId,
        caseType,
        reason.trim(),
        status,
        expiresAt
      );

    database.exec('COMMIT;');

    return getModerationCase(guildId, caseNumber);
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}

export function getNextCaseNumber(guildId) {
  validateRequiredString(guildId, 'guildId');

  const database = getDatabase();

  return getNextCaseNumberWithinTransaction(
    database,
    guildId
  );
}

export function getModerationCase(guildId, caseNumber) {
  validateRequiredString(guildId, 'guildId');
  validateCaseNumber(caseNumber);

  const database = getDatabase();

  const row = database
    .prepare(`
      SELECT *
      FROM moderation_cases
      WHERE guild_id = ?
        AND case_number = ?
      LIMIT 1
    `)
    .get(guildId, caseNumber);

  return row ? mapModerationCase(row) : null;
}


export function getAdjacentModerationCase({
  guildId,
  caseNumber,
  direction
}) {
  validateRequiredString(guildId, 'guildId');
  validateCaseNumber(caseNumber);

  if (direction !== 'previous' && direction !== 'next') {
    throw new TypeError(
      "direction must be either 'previous' or 'next'."
    );
  }

  const database = getDatabase();
  const operator = direction === 'previous' ? '<' : '>';
  const order = direction === 'previous' ? 'DESC' : 'ASC';

  const row = database
    .prepare(`
      SELECT *
      FROM moderation_cases
      WHERE guild_id = ?
        AND case_number ${operator} ?
      ORDER BY case_number ${order}
      LIMIT 1
    `)
    .get(guildId, caseNumber);

  return row ? mapModerationCase(row) : null;
}

export function getModerationCasesForUser(
  guildId,
  userId,
  {
    includeRemoved = false,
    caseType = null,
    limit = DEFAULT_CASE_LIMIT
  } = {}
) {
  validateRequiredString(guildId, 'guildId');
  validateRequiredString(userId, 'userId');

  const safeLimit = normaliseLimit(limit);
  const conditions = [
    'guild_id = ?',
    'user_id = ?'
  ];

  const parameters = [
    guildId,
    userId
  ];

  if (!includeRemoved) {
    conditions.push("status != 'removed'");
  }

  if (caseType) {
    validateRequiredString(caseType, 'caseType');

    conditions.push('case_type = ?');
    parameters.push(caseType);
  }

  parameters.push(safeLimit);

  const database = getDatabase();

  const rows = database
    .prepare(`
      SELECT *
      FROM moderation_cases
      WHERE ${conditions.join(' AND ')}
      ORDER BY case_number DESC
      LIMIT ?
    `)
    .all(...parameters);

  return rows.map(mapModerationCase);
}

export function getModerationCasesForGuild(
  guildId,
  {
    includeRemoved = true,
    limit = DEFAULT_CASE_LIMIT
  } = {}
) {
  validateRequiredString(guildId, 'guildId');

  const safeLimit = normaliseLimit(limit);
  const conditions = ['guild_id = ?'];
  const parameters = [guildId];

  if (!includeRemoved) {
    conditions.push("status != 'removed'");
  }

  parameters.push(safeLimit);

  const database = getDatabase();

  const rows = database
    .prepare(`
      SELECT *
      FROM moderation_cases
      WHERE ${conditions.join(' AND ')}
      ORDER BY case_number DESC
      LIMIT ?
    `)
    .all(...parameters);

  return rows.map(mapModerationCase);
}

export function removeModerationCase({
  guildId,
  caseNumber,
  removedBy,
  removalReason
}) {
  validateRequiredString(guildId, 'guildId');
  validateCaseNumber(caseNumber);
  validateRequiredString(removedBy, 'removedBy');
  validateRequiredString(removalReason, 'removalReason');

  const existingCase = getModerationCase(
    guildId,
    caseNumber
  );

  if (!existingCase) {
    return null;
  }

  if (existingCase.status === 'removed') {
    throw new Error(
      `Moderation case #${caseNumber} has already been removed.`
    );
  }

  const removedAt = new Date().toISOString();
  const database = getDatabase();

  database
    .prepare(`
      UPDATE moderation_cases
      SET
        status = 'removed',
        removed_at = ?,
        removed_by = ?,
        removal_reason = ?
      WHERE guild_id = ?
        AND case_number = ?
    `)
    .run(
      removedAt,
      removedBy,
      removalReason.trim(),
      guildId,
      caseNumber
    );

  return getModerationCase(guildId, caseNumber);
}

export function purgeModerationCase({
  guildId,
  caseNumber
}) {
  validateRequiredString(guildId, 'guildId');
  validateCaseNumber(caseNumber);

  const existingCase = getModerationCase(
    guildId,
    caseNumber
  );

  if (!existingCase) {
    return null;
  }

  const database = getDatabase();

  const result = database
    .prepare(`
      DELETE FROM moderation_cases
      WHERE guild_id = ?
        AND case_number = ?
    `)
    .run(
      guildId,
      caseNumber
    );

  return Number(result.changes) > 0;
}

export function updateModerationCaseStatus({
  guildId,
  caseNumber,
  status
}) {
  validateRequiredString(guildId, 'guildId');
  validateCaseNumber(caseNumber);
  validateRequiredString(status, 'status');

  const database = getDatabase();

  const result = database
    .prepare(`
      UPDATE moderation_cases
      SET status = ?
      WHERE guild_id = ?
        AND case_number = ?
    `)
    .run(status, guildId, caseNumber);

  if (Number(result.changes) === 0) {
    return null;
  }

  return getModerationCase(guildId, caseNumber);
}

function getNextCaseNumberWithinTransaction(
  database,
  guildId
) {
  const row = database
    .prepare(`
      SELECT COALESCE(MAX(case_number), 0) + 1
        AS next_case_number
      FROM moderation_cases
      WHERE guild_id = ?
    `)
    .get(guildId);

  return Number(row.next_case_number);
}

function mapModerationCase(row) {
  return {
    id: Number(row.id),
    guildId: row.guild_id,
    caseNumber: Number(row.case_number),
    userId: row.user_id,
    moderatorId: row.moderator_id,
    caseType: row.case_type,
    reason: row.reason,
    status: row.status,
    expiresAt: row.expires_at,
    removedAt: row.removed_at,
    removedBy: row.removed_by,
    removalReason: row.removal_reason,
    createdAt: row.created_at
  };
}

function validateRequiredString(value, fieldName) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      `${fieldName} must be a non-empty string.`
    );
  }
}

function validateCaseNumber(caseNumber) {
  if (
    !Number.isInteger(caseNumber) ||
    caseNumber < 1
  ) {
    throw new TypeError(
      'caseNumber must be a positive integer.'
    );
  }
}

function normaliseLimit(limit) {
  const parsedLimit = Number(limit);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    return DEFAULT_CASE_LIMIT;
  }

  return Math.min(parsedLimit, MAX_CASE_LIMIT);
}
