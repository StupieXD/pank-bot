import { EmbedBuilder } from 'discord.js';

const CASE_STYLES = Object.freeze({
  warning: {
    label: 'Warning',
    emoji: '\u26A0\uFE0F',
    colour: 0xf1c40f
  },
  note: {
    label: 'Note',
    emoji: '\uD83D\uDCDD',
    colour: 0x3498db
  },
  timeout: {
    label: 'Timeout',
    emoji: '\u23F3',
    colour: 0xe67e22
  },
  temporary_timeout: {
    label: 'Temporary Timeout',
    emoji: '\u23F3',
    colour: 0xe67e22
  },
  kick: {
    label: 'Kick',
    emoji: '\uD83E\uDD7E',
    colour: 0x9b59b6
  },
  ban: {
    label: 'Ban',
    emoji: '\uD83D\uDD28',
    colour: 0xe74c3c
  },
  temporary_ban: {
    label: 'Temporary Ban',
    emoji: '\uD83D\uDD28',
    colour: 0xe74c3c
  },
  softban: {
    label: 'Softban',
    emoji: '\uD83E\uDDF9',
    colour: 0xc0392b
  }
});

const STATUS_STYLES = Object.freeze({
  active: {
    label: 'Active',
    emoji: '\uD83D\uDFE0'
  },
  expired: {
    label: 'Expired',
    emoji: '\u26AA'
  },
  removed: {
    label: 'Removed',
    emoji: '\uD83D\uDFE2'
  }
});

export async function buildModerationCaseEmbed({
  client,
  moderationCase
}) {
  const [targetUser, moderatorUser, removedByUser] =
    await Promise.all([
      fetchUser(client, moderationCase.userId),
      fetchUser(client, moderationCase.moderatorId),
      moderationCase.removedBy
        ? fetchUser(client, moderationCase.removedBy)
        : null
    ]);

  const caseStyle = getCaseStyle(moderationCase.caseType);
  const statusStyle = getStatusStyle(moderationCase.status);

  const embed = new EmbedBuilder()
    .setColor(caseStyle.colour)
    .setTitle(
      `${caseStyle.emoji} ${caseStyle.label} Case #${moderationCase.caseNumber}`
    )
    .addFields(
      {
        name: '\uD83D\uDC64 Member',
        value: formatUser(moderationCase.userId, targetUser),
        inline: false
      },
      {
        name: '\uD83D\uDCCA Status',
        value: `${statusStyle.emoji} ${statusStyle.label}`,
        inline: true
      },
      {
        name: '\uD83D\uDCDD Reason',
        value: moderationCase.reason || 'No reason provided.',
        inline: false
      },
      {
        name: '\uD83D\uDEE1\uFE0F Moderator',
        value: formatUser(moderationCase.moderatorId, moderatorUser),
        inline: false
      },
      {
        name: '\uD83D\uDD52 Issued',
        value: formatDiscordTimestamp(moderationCase.createdAt),
        inline: false
      }
    )
    .setFooter({
      text: `Case #${moderationCase.caseNumber} \u2022 ${statusStyle.label} ${caseStyle.label}`
    });

  if (targetUser) {
    embed.setThumbnail(
      targetUser.displayAvatarURL({
        size: 256
      })
    );
  }

  if (moderationCase.edits?.length) {
    embed.addFields({
      name: `\u270F\uFE0F Reason Edit History (${moderationCase.edits.length})`,
      value: formatReasonEditHistory(moderationCase.edits),
      inline: false
    });
  }

  if (moderationCase.expiresAt) {
    embed.addFields({
      name: '\u23F1\uFE0F Expires',
      value: formatDiscordTimestamp(moderationCase.expiresAt),
      inline: false
    });
  }

  if (moderationCase.status === 'removed') {
    embed.addFields(
      {
        name: '\uD83D\uDDD1\uFE0F Removed By',
        value: moderationCase.removedBy
          ? formatUser(moderationCase.removedBy, removedByUser)
          : 'Unknown',
        inline: false
      },
      {
        name: '\uD83D\uDCDD Removal Reason',
        value:
          moderationCase.removalReason ||
          'No removal reason recorded.',
        inline: false
      },
      {
        name: '\uD83D\uDD52 Removed',
        value: moderationCase.removedAt
          ? formatDiscordTimestamp(moderationCase.removedAt)
          : 'Unknown',
        inline: false
      }
    );
  }

  return embed;
}

export function formatModerationStatus(status) {
  const style = getStatusStyle(status);
  return `${style.emoji} ${style.label}`;
}

export function formatDiscordTimestamp(value) {
  if (!value) {
    return 'Unknown';
  }

  const milliseconds = new Date(
    normaliseSqliteTimestamp(value)
  ).getTime();

  if (!Number.isFinite(milliseconds)) {
    return 'Unknown';
  }

  const timestamp = Math.floor(milliseconds / 1000);
  return `<t:${timestamp}:R>\n<t:${timestamp}:F>`;
}

function formatReasonEditHistory(edits) {
  const recentEdits = edits.slice(-3);
  const hiddenCount = Math.max(0, edits.length - recentEdits.length);

  const entries = recentEdits.map((edit, index) => {
    const editNumber = hiddenCount + index + 1;
    const timestamp = formatDiscordTimestamp(edit.editedAt);

    return (
      `**Edit #${editNumber}** \u2022 <@${edit.editedBy}>\n` +
      `${timestamp}\n\n` +
      `**Old**\n${truncateText(edit.previousReason, 160)}\n\n` +
      `\u2B07\uFE0F\n\n` +
      `**New**\n${truncateText(edit.newReason, 160)}`
    );
  });

  if (hiddenCount > 0) {
    entries.unshift(
      `*${hiddenCount} earlier edit${hiddenCount === 1 ? '' : 's'} not shown.*`
    );
  }

  return entries.join('\n\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n');
}

function truncateText(value, maximumLength) {
  const text = String(value ?? '');

  if (text.length <= maximumLength) {
    return text;
  }

  return `${text.slice(0, maximumLength - 3)}...`;
}

function getCaseStyle(caseType) {
  return CASE_STYLES[caseType] ?? {
    label: toTitleCase(caseType || 'unknown'),
    emoji: '\uD83D\uDCC1',
    colour: 0x95a5a6
  };
}

function getStatusStyle(status) {
  return STATUS_STYLES[status] ?? {
    label: toTitleCase(status || 'unknown'),
    emoji: '\u26AA'
  };
}

function formatUser(userId, user) {
  if (!userId) {
    return 'Unknown';
  }

  const lines = [`<@${userId}>`];

  if (user?.tag) {
    lines.push(user.tag);
  }

  lines.push(`**User ID:** \`${userId}\``);
  return lines.join('\n');
}

function fetchUser(client, userId) {
  if (!userId) {
    return Promise.resolve(null);
  }

  return client.users.fetch(userId).catch(() => null);
}

function normaliseSqliteTimestamp(value) {
  if (
    typeof value === 'string' &&
    !value.includes('T')
  ) {
    return `${value.replace(' ', 'T')}Z`;
  }

  return value;
}

function toTitleCase(value) {
  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
