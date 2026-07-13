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

export async function handleStickerCreate(sticker) {
  if (!sticker.guild) return;

  const logChannel = await getLogChannel(sticker.guild.client);
  if (!logChannel) return;

  const auditEntry = await findStickerAuditEntry(
    sticker,
    AuditLogEvent.StickerCreate
  );

  const createdBy = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(Date.now() / 1000);

  const fields = [
    {
      name: '🏷️ Name',
      value: sticker.name ?? 'Unknown',
      inline: false
    },
    {
      name: '📝 Description',
      value: sticker.description || 'None',
      inline: false
    },
    {
      name: '😀 Related Emoji',
      value: formatStickerTags(sticker.tags),
      inline: true
    },
    {
      name: '🖼️ Format',
      value: formatStickerFormat(sticker.format),
      inline: true
    },
    {
      name: '✅ Available',
      value: formatAvailable(sticker.available),
      inline: true
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
        'Unable to determine who created this sticker.'
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
    .setTitle('➕ Sticker Created')
    .addFields(fields)
    .setFooter({ text: `🆔 Sticker ID: ${sticker.id}` });

  const previewUrl = getStickerPreviewUrl(sticker);

  if (previewUrl) {
    embed.setThumbnail(previewUrl);
  }

  await logChannel.send({ embeds: [embed] });
}

export async function handleStickerDelete(sticker) {
  if (!sticker.guild) return;

  const logChannel = await getLogChannel(sticker.guild.client);
  if (!logChannel) return;

  const auditEntry = await findStickerAuditEntry(
    sticker,
    AuditLogEvent.StickerDelete
  );

  const deletedBy = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(Date.now() / 1000);

  const fields = [
    {
      name: '🏷️ Name',
      value: sticker.name ?? 'Unknown',
      inline: false
    },
    {
      name: '📝 Description',
      value: sticker.description || 'None',
      inline: false
    },
    {
      name: '😀 Related Emoji',
      value: formatStickerTags(sticker.tags),
      inline: true
    },
    {
      name: '🖼️ Format',
      value: formatStickerFormat(sticker.format),
      inline: true
    },
    {
      name: '✅ Available',
      value: formatAvailable(sticker.available),
      inline: true
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
        'Unable to determine who deleted this sticker.'
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
    .setTitle('🗑️ Sticker Deleted')
    .addFields(fields)
    .setFooter({ text: `🆔 Sticker ID: ${sticker.id}` });

  const previewUrl = getStickerPreviewUrl(sticker);

  if (previewUrl) {
    embed.setThumbnail(previewUrl);
  }

  await logChannel.send({ embeds: [embed] });
}

export async function handleStickerUpdate(oldSticker, newSticker) {
  if (!oldSticker?.guild || !newSticker?.guild) return;

  const changes = buildStickerChanges(oldSticker, newSticker);
  if (changes.length === 0) return;

  const logChannel = await getLogChannel(newSticker.guild.client);
  if (!logChannel) return;

  const auditEntry = await findStickerAuditEntry(
    newSticker,
    AuditLogEvent.StickerUpdate
  );

  const updatedBy = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(Date.now() / 1000);

  const fields = [
    {
      name: '🏷️ Sticker',
      value: newSticker.name ?? 'Unknown',
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
        'Unable to determine who updated this sticker.'
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
    .setTitle('✏️ Sticker Updated')
    .addFields(fields)
    .setFooter({ text: `🆔 Sticker ID: ${newSticker.id}` });

  const previewUrl = getStickerPreviewUrl(newSticker);

  if (previewUrl) {
    embed.setThumbnail(previewUrl);
  }

  await logChannel.send({ embeds: [embed] });
}

function buildStickerChanges(oldSticker, newSticker) {
  const changes = [];

  addChange(
    changes,
    '🏷️ Name',
    oldSticker.name ?? 'Unknown',
    newSticker.name ?? 'Unknown'
  );

  addChange(
    changes,
    '📝 Description',
    oldSticker.description || 'None',
    newSticker.description || 'None'
  );

  addChange(
    changes,
    '😀 Related Emoji',
    formatStickerTags(oldSticker.tags),
    formatStickerTags(newSticker.tags)
  );

  addChange(
    changes,
    '🖼️ Format',
    formatStickerFormat(oldSticker.format),
    formatStickerFormat(newSticker.format)
  );

  addChange(
    changes,
    '✅ Available',
    formatAvailable(oldSticker.available),
    formatAvailable(newSticker.available)
  );

  return changes;
}

function addChange(changes, name, before, after) {
  if (before === after) return;

  changes.push({
    name,
    value: shortenText(
      `**Before**\n${before}\n\n**After**\n${after}`,
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

async function findStickerAuditEntry(sticker, type) {
  return waitForAuditLogEntry({
    guild: sticker.guild,
    type,
    timeout: 3000,
    match: (log) => {
      const recent =
        Date.now() - log.createdTimestamp < 10000;

      const sameTarget =
        log.target?.id === sticker.id ||
        log.targetId === sticker.id;

      return recent && sameTarget;
    }
  });
}

function formatStickerTags(tags) {
  if (!tags) return 'None';

  const formatted = String(tags)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(', ');

  return formatted || 'None';
}

function formatStickerFormat(format) {
  const formats = {
    1: 'PNG',
    2: 'APNG',
    3: 'Lottie',
    4: 'GIF'
  };

  return formats[format] ?? `Unknown (${format})`;
}

function formatAvailable(available) {
  if (typeof available !== 'boolean') {
    return 'Unknown';
  }

  return available ? 'Yes' : 'No';
}

function getStickerPreviewUrl(sticker) {
  if (sticker.format === 3) return null;

  return sticker.url ?? null;
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
