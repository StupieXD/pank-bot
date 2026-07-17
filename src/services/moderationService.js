import {
  createModerationCase,
  getAdjacentModerationCase,
  getModerationCase,
  getModerationCasesForUser,
  purgeModerationCase,
  removeModerationCase
} from '../database/repositories/moderationCaseRepository.js';

export const ModerationCaseType = Object.freeze({
  WARNING: 'warning',
  NOTE: 'note',
  TIMEOUT: 'timeout',
  TEMPORARY_TIMEOUT: 'temporary_timeout',
  BAN: 'ban',
  TEMPORARY_BAN: 'temporary_ban',
  SOFTBAN: 'softban'
});

export const ModerationCaseStatus = Object.freeze({
  ACTIVE: 'active',
  EXPIRED: 'expired',
  REMOVED: 'removed'
});

const DEFAULT_REASON = 'No reason provided.';
const MAX_REASON_LENGTH = 1000;

export function createWarning({
  guildId,
  userId,
  moderatorId,
  reason
}) {
  validateModerationTarget({
    guildId,
    userId,
    moderatorId
  });

  return createModerationCase({
    guildId,
    userId,
    moderatorId,
    caseType: ModerationCaseType.WARNING,
    reason: normaliseReason(reason),
    status: ModerationCaseStatus.ACTIVE
  });
}

export function createNote({
  guildId,
  userId,
  moderatorId,
  reason
}) {
  validateModerationTarget({
    guildId,
    userId,
    moderatorId
  });

  return createModerationCase({
    guildId,
    userId,
    moderatorId,
    caseType: ModerationCaseType.NOTE,
    reason: normaliseReason(reason),
    status: ModerationCaseStatus.ACTIVE
  });
}

export function getCase({
  guildId,
  caseNumber
}) {
  return getModerationCase(
    guildId,
    caseNumber
  );
}

export function getAdjacentCase({
  guildId,
  caseNumber,
  direction
}) {
  return getAdjacentModerationCase({
    guildId,
    caseNumber,
    direction
  });
}

export function getWarningsForUser({
  guildId,
  userId,
  includeRemoved = false,
  limit = 50
}) {
  return getModerationCasesForUser(
    guildId,
    userId,
    {
      includeRemoved,
      caseType: ModerationCaseType.WARNING,
      limit
    }
  );
}

export function removeWarning({
  guildId,
  caseNumber,
  moderatorId,
  reason
}) {
  const moderationCase = getModerationCase(
    guildId,
    caseNumber
  );

  if (!moderationCase) {
    throw new Error(
      `Case #${caseNumber} could not be found.`
    );
  }

  if (
    moderationCase.caseType !==
    ModerationCaseType.WARNING
  ) {
    throw new Error(
      `Case #${caseNumber} is not a warning.`
    );
  }

  if (
    moderationCase.status ===
    ModerationCaseStatus.REMOVED
  ) {
    throw new Error(
      `Warning case #${caseNumber} has already been removed.`
    );
  }

  return removeModerationCase({
    guildId,
    caseNumber,
    removedBy: moderatorId,
    removalReason: normaliseReason(reason)
  });
}

export function purgeWarning({
  guildId,
  caseNumber
}) {
  const moderationCase = getModerationCase(
    guildId,
    caseNumber
  );

  if (!moderationCase) {
    throw new Error(
      `Case #${caseNumber} could not be found.`
    );
  }

  if (
    moderationCase.caseType !==
    ModerationCaseType.WARNING
  ) {
    throw new Error(
      `Case #${caseNumber} is not a warning.`
    );
  }

  const purged = purgeModerationCase({
    guildId,
    caseNumber
  });

  if (!purged) {
    throw new Error(
      `Case #${caseNumber} could not be permanently deleted.`
    );
  }

  return moderationCase;
}

function validateModerationTarget({
  guildId,
  userId,
  moderatorId
}) {
  validateRequiredId(guildId, 'guildId');
  validateRequiredId(userId, 'userId');
  validateRequiredId(moderatorId, 'moderatorId');

  if (userId === moderatorId) {
    throw new Error(
      'Moderators cannot create moderation cases against themselves.'
    );
  }
}

function validateRequiredId(value, fieldName) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      `${fieldName} must be a valid Discord ID.`
    );
  }
}

function normaliseReason(reason) {
  if (
    typeof reason !== 'string' ||
    reason.trim().length === 0
  ) {
    return DEFAULT_REASON;
  }

  const trimmedReason = reason.trim();

  if (trimmedReason.length > MAX_REASON_LENGTH) {
    throw new Error(
      `Reasons cannot exceed ${MAX_REASON_LENGTH} characters.`
    );
  }

  return trimmedReason;
}
