import {
  AuditLogEvent,
  EmbedBuilder
} from 'discord.js';

import { config } from '../../config/config.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';

const CREATE_COLOUR = 0x2ecc71;
const UPDATE_COLOUR = 0x3498db;
const DELETE_COLOUR = 0xe74c3c;
const MAX_FIELD_VALUE_LENGTH = 1000;

export async function handleEmojiCreate(emoji) {
  if (!emoji.guild) return;

  const logChannel = await getLogChannel(emoji.guild.client);
  if (!logChannel) return;

  const auditEntry = await findEmojiAuditEntry(
    emoji,
    AuditLogEvent.EmojiCreate
  );

  const createdBy = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(Date.now() / 1000);

  const fields = [
    {
      name: '😀 Emoji',
      value: formatEmoji(emoji),
      inline: false
    },
    {
      name: '🏷️ Name',
      value: emoji.name ?? 'Unknown',
      inline: true
    },
    {
      name: '🎞️ Animated',
      value: emoji.animated ? 'Yes' : 'No',
      inline: true
    },
    {
      name: '🎭 Restricted Roles',
      value: formatRestrictedRoles(emoji),
      inline: false
    },
    {
      name: '🕒 Created',
      value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
      inline: false
    },
    {
      name: '🛡️ Moderator',
      value: formatModerator(
        createdBy,
        'Unable to determine who created this emoji.'
      ),
      inline: false
    }
  ];

  if (reason) {
    fields.push({
      name: '📝 Reason',
      value: shortenText(reason, MAX_FIELD_VALUE_LENGTH),
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setColor(CREATE_COLOUR)
    .setTitle('➕ Emoji Created')
    .setThumbnail(emoji.imageURL({ size: 256 }))
    .addFields(fields)
    .setFooter({ text: `🆔 Emoji ID: ${emoji.id}` });

  await logChannel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
}

export async function handleEmojiDelete(emoji) {
  if (!emoji.guild) return;

  const logChannel = await getLogChannel(emoji.guild.client);
  if (!logChannel) return;

  const auditEntry = await findEmojiAuditEntry(
    emoji,
    AuditLogEvent.EmojiDelete
  );

  const deletedBy = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(Date.now() / 1000);

  const fields = [
    {
      name: '😀 Emoji',
      value: emoji.name ?? 'Unknown',
      inline: false
    },
    {
      name: '🎞️ Animated',
      value: emoji.animated ? 'Yes' : 'No',
      inline: true
    },
    {
      name: '🎭 Restricted Roles',
      value: formatRestrictedRoles(emoji),
      inline: false
    },
    {
      name: '🕒 Deleted',
      value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
      inline: false
    },
    {
      name: '🛡️ Moderator',
      value: formatModerator(
        deletedBy,
        'Unable to determine who deleted this emoji.'
      ),
      inline: false
    }
  ];

  if (reason) {
    fields.push({
      name: '📝 Reason',
      value: shortenText(reason, MAX_FIELD_VALUE_LENGTH),
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setColor(DELETE_COLOUR)
    .setTitle('🗑️ Emoji Deleted')
    .setThumbnail(emoji.imageURL({ size: 256 }))
    .addFields(fields)
    .setFooter({ text: `🆔 Emoji ID: ${emoji.id}` });

  await logChannel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
}

export async function handleEmojiUpdate(oldEmoji, newEmoji) {
  if (!oldEmoji?.guild || !newEmoji?.guild) return;

  const changes = buildEmojiChanges(oldEmoji, newEmoji);
  if (changes.length === 0) return;

  const logChannel = await getLogChannel(newEmoji.guild.client);
  if (!logChannel) return;

  const auditEntry = await findEmojiAuditEntry(
    newEmoji,
    AuditLogEvent.EmojiUpdate
  );

  const updatedBy = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(Date.now() / 1000);

  const fields = [
    {
      name: '😀 Emoji',
      value: formatEmoji(newEmoji),
      inline: false
    },
    {
      name: '🕒 Updated',
      value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
      inline: false
    },
    ...changes,
    {
      name: '🛡️ Moderator',
      value: formatModerator(
        updatedBy,
        'Unable to determine who updated this emoji.'
      ),
      inline: false
    }
  ];

  if (reason) {
    fields.push({
      name: '📝 Reason',
      value: shortenText(reason, MAX_FIELD_VALUE_LENGTH),
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setColor(UPDATE_COLOUR)
    .setTitle('✏️ Emoji Updated')
    .setThumbnail(newEmoji.imageURL({ size: 256 }))
    .addFields(fields)
    .setFooter({ text: `🆔 Emoji ID: ${newEmoji.id}` });

  await logChannel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
}

function buildEmojiChanges(oldEmoji, newEmoji) {
  const changes = [];

  addChange(
    changes,
    '🏷️ Name',
    oldEmoji.name ?? 'Unknown',
    newEmoji.name ?? 'Unknown'
  );

  addChange(
    changes,
    '🎞️ Animated',
    oldEmoji.animated ? 'Yes' : 'No',
    newEmoji.animated ? 'Yes' : 'No'
  );

  addChange(
    changes,
    '🎭 Restricted Roles',
    formatRestrictedRoles(oldEmoji),
    formatRestrictedRoles(newEmoji)
  );

  return changes;
}

function addChange(changes, name, before, after) {
  if (before === after) return;

  changes.push({
    name,
    value: shortenText(
      `**Before**\n${before}\n\n` +
      `**After**\n${after}`,
      MAX_FIELD_VALUE_LENGTH
    ),
    inline: false
  });
}

async function getLogChannel(client) {
  const logChannel = await client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find server log channel.');
    return null;
  }

  return logChannel;
}

async function findEmojiAuditEntry(emoji, type) {
  return waitForAuditLogEntry({
    guild: emoji.guild,
    type,
    timeout: 3000,
    match: (log) => {
      const recent =
        Date.now() - log.createdTimestamp < 10000;

      const sameTarget =
        log.target?.id === emoji.id ||
        log.targetId === emoji.id;

      return recent && sameTarget;
    }
  });
}

function formatEmoji(emoji) {
  if (!emoji.id) {
    return emoji.name ?? 'Unknown';
  }

  const prefix = emoji.animated ? 'a' : '';

  return `<${prefix}:${emoji.name}:${emoji.id}>`;
}

function formatRestrictedRoles(emoji) {
  const roles = emoji.roles?.cache;

  if (!roles || roles.size === 0) {
    return 'Everyone';
  }

  return shortenText(
    [...roles.values()]
      .sort((a, b) => b.position - a.position)
      .map((role) => `<@&${role.id}>`)
      .join('\n'),
    MAX_FIELD_VALUE_LENGTH
  );
}

function formatModerator(moderator, unknownMessage) {
  if (!moderator) {
    return `Unknown\n${unknownMessage}`;
  }

  return (
    `<@${moderator.id}>\n` +
    `Username: ${moderator.tag}`
  );
}

function shortenText(text, maxLength) {
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 3)}...`;
}
