import {
  AuditLogEvent,
  ChannelType,
  EmbedBuilder
} from 'discord.js';

import { config } from '../../config/config.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';

const CREATE_COLOUR = 0x2ecc71;
const UPDATE_COLOUR = 0x3498db;
const DELETE_COLOUR = 0xe74c3c;

const MAX_FIELD_VALUE_LENGTH = 1000;

export async function handleChannelCreate(channel) {
  if (!channel.guild) return;

  const logChannel = await getLogChannel(channel.guild.client);

  if (!logChannel) return;

  const auditEntry = await findChannelAuditEntry(
    channel,
    AuditLogEvent.ChannelCreate
  );

  const createdBy = auditEntry?.executor ?? null;
  const timestamp = Math.floor(Date.now() / 1000);
  const isCategory = channel.type === ChannelType.GuildCategory;

  const fields = [
    {
      name: isCategory ? '📁 Category' : '📍 Channel',
      value: formatCreatedChannel(channel),
      inline: false
    },
    {
      name: '🏷️ Type',
      value: formatChannelType(channel.type),
      inline: true
    },
    {
      name: '🕒 Created',
      value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
      inline: true
    },
    {
      name: '🛡️ Moderator',
      value: formatModerator(
        createdBy,
        `Unable to determine who created this ${
          isCategory ? 'category' : 'channel'
        }.`
      ),
      inline: false
    }
  ];

  if (!isCategory) {
    fields.push({
      name: '📂 Category',
      value: channel.parent?.name ?? 'None',
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setColor(CREATE_COLOUR)
    .setTitle(
      isCategory
        ? '📁 Category Created'
        : '➕ Channel Created'
    )
    .addFields(fields)
    .setFooter({
      text: `🆔 ${
        isCategory ? 'Category' : 'Channel'
      } ID: ${channel.id}`
    });

  await logChannel.send({ embeds: [embed] });
}

export async function handleChannelDelete(channel) {
  if (!channel.guild) return;

  const logChannel = await getLogChannel(channel.guild.client);

  if (!logChannel) return;

  const auditEntry = await findChannelAuditEntry(
    channel,
    AuditLogEvent.ChannelDelete
  );

  const deletedBy = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(Date.now() / 1000);
  const isCategory = channel.type === ChannelType.GuildCategory;

  const fields = [
    {
      name: isCategory ? '📁 Category' : '📍 Channel',
      value: channel.name,
      inline: false
    },
    {
      name: '🏷️ Type',
      value: formatChannelType(channel.type),
      inline: true
    },
    {
      name: '🕒 Deleted',
      value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
      inline: true
    },
    {
      name: '🛡️ Moderator',
      value: formatModerator(
        deletedBy,
        `Unable to determine who deleted this ${
          isCategory ? 'category' : 'channel'
        }.`
      ),
      inline: false
    }
  ];

  if (!isCategory) {
    fields.splice(2, 0, {
      name: '📂 Category',
      value: channel.parent?.name ?? 'None',
      inline: false
    });
  }

  if (reason) {
    fields.push({
      name: '📝 Reason',
      value: shortenText(reason, MAX_FIELD_VALUE_LENGTH),
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setColor(DELETE_COLOUR)
    .setTitle(
      isCategory
        ? '🗑️ Category Deleted'
        : '🗑️ Channel Deleted'
    )
    .addFields(fields)
    .setFooter({
      text: `🆔 ${
        isCategory ? 'Category' : 'Channel'
      } ID: ${channel.id}`
    });

  await logChannel.send({ embeds: [embed] });
}

export async function handleChannelUpdate(oldChannel, newChannel) {
  if (!oldChannel?.guild || !newChannel?.guild) return;

  const changes = collectChannelChanges(oldChannel, newChannel);

  if (changes.length === 0) return;

  const logChannel = await getLogChannel(newChannel.guild.client);

  if (!logChannel) return;

  const auditEntry = await findChannelAuditEntry(
    newChannel,
    AuditLogEvent.ChannelUpdate
  );

  const updatedBy = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(Date.now() / 1000);
  const isCategory = newChannel.type === ChannelType.GuildCategory;

  const fields = [
    {
      name: isCategory ? '📁 Category' : '📍 Channel',
      value: isCategory
        ? newChannel.name
        : `<#${newChannel.id}>`,
      inline: false
    },
    {
      name: '🏷️ Type',
      value: formatChannelType(newChannel.type),
      inline: true
    },
    {
      name: '🕒 Updated',
      value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
      inline: true
    },
    ...changes,
    {
      name: '🛡️ Moderator',
      value: formatModerator(
        updatedBy,
        `Unable to determine who updated this ${
          isCategory ? 'category' : 'channel'
        }.`
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
    .setTitle(
      isCategory
        ? '✏️ Category Updated'
        : '✏️ Channel Updated'
    )
    .addFields(fields)
    .setFooter({
      text: `🆔 ${
        isCategory ? 'Category' : 'Channel'
      } ID: ${newChannel.id}`
    });

  await logChannel.send({ embeds: [embed] });
}

function collectChannelChanges(oldChannel, newChannel) {
  const changes = [];

  addChange(
    changes,
    '🏷️ Name',
    oldChannel.name,
    newChannel.name
  );

  addChange(
    changes,
    '📂 Category',
    oldChannel.parent?.name ?? 'None',
    newChannel.parent?.name ?? 'None'
  );

  addChange(
    changes,
    '📌 Position',
    formatPosition(oldChannel.rawPosition),
    formatPosition(newChannel.rawPosition)
  );

  addChange(
    changes,
    '💬 Topic',
    formatNullableText(oldChannel.topic),
    formatNullableText(newChannel.topic)
  );

  addChange(
    changes,
    '🔞 Age Restricted',
    formatEnabled(oldChannel.nsfw),
    formatEnabled(newChannel.nsfw)
  );

  addChange(
    changes,
    '🐢 Slowmode',
    formatDurationSeconds(oldChannel.rateLimitPerUser),
    formatDurationSeconds(newChannel.rateLimitPerUser)
  );

  addChange(
    changes,
    '🧵 Default Thread Slowmode',
    formatDurationSeconds(oldChannel.defaultThreadRateLimitPerUser),
    formatDurationSeconds(newChannel.defaultThreadRateLimitPerUser)
  );

  addChange(
    changes,
    '🗄️ Default Archive Duration',
    formatArchiveDuration(oldChannel.defaultAutoArchiveDuration),
    formatArchiveDuration(newChannel.defaultAutoArchiveDuration)
  );

  addChange(
    changes,
    '🔊 Bitrate',
    formatBitrate(oldChannel.bitrate),
    formatBitrate(newChannel.bitrate)
  );

  addChange(
    changes,
    '👥 User Limit',
    formatUserLimit(oldChannel.userLimit),
    formatUserLimit(newChannel.userLimit)
  );

  addChange(
    changes,
    '🌍 Voice Region',
    formatRtcRegion(oldChannel.rtcRegion),
    formatRtcRegion(newChannel.rtcRegion)
  );

  addChange(
    changes,
    '🎥 Video Quality',
    formatVideoQuality(oldChannel.videoQualityMode),
    formatVideoQuality(newChannel.videoQualityMode)
  );

  if (oldChannel.type !== newChannel.type) {
    addChange(
      changes,
      '🏷️ Channel Type',
      formatChannelType(oldChannel.type),
      formatChannelType(newChannel.type)
    );
  }

  const permissionChange = buildPermissionOverwriteChange(
    oldChannel,
    newChannel
  );

  if (permissionChange) {
    changes.push({
      name: '🔐 Permission Overwrites',
      value: permissionChange,
      inline: false
    });
  }

  return changes;
}

function addChange(changes, name, before, after) {
  if (before === after) return;

  changes.push({
    name,
    value: formatBeforeAfter(before, after),
    inline: false
  });
}

function formatBeforeAfter(before, after) {
  return shortenText(
    `**Before**\n${before}\n\n` +
    `**After**\n${after}`,
    MAX_FIELD_VALUE_LENGTH
  );
}

function buildPermissionOverwriteChange(oldChannel, newChannel) {
  const oldOverwrites = getPermissionOverwriteMap(oldChannel);
  const newOverwrites = getPermissionOverwriteMap(newChannel);

  if (
    JSON.stringify([...oldOverwrites.entries()]) ===
    JSON.stringify([...newOverwrites.entries()])
  ) {
    return null;
  }

  const added = [];
  const removed = [];
  const updated = [];

  for (const [id, overwrite] of newOverwrites) {
    if (!oldOverwrites.has(id)) {
      added.push(
        formatOverwriteTarget(
          newChannel.guild,
          id,
          overwrite.type
        )
      );

      continue;
    }

    const previous = oldOverwrites.get(id);

    if (
      previous.allow !== overwrite.allow ||
      previous.deny !== overwrite.deny ||
      previous.type !== overwrite.type
    ) {
      updated.push(
        formatOverwriteTarget(
          newChannel.guild,
          id,
          overwrite.type
        )
      );
    }
  }

  for (const [id, overwrite] of oldOverwrites) {
    if (!newOverwrites.has(id)) {
      removed.push(
        formatOverwriteTarget(
          oldChannel.guild,
          id,
          overwrite.type
        )
      );
    }
  }

  const sections = [];

  if (added.length > 0) {
    sections.push(`**Added**\n${added.join('\n')}`);
  }

  if (removed.length > 0) {
    sections.push(`**Removed**\n${removed.join('\n')}`);
  }

  if (updated.length > 0) {
    sections.push(`**Updated**\n${updated.join('\n')}`);
  }

  return shortenText(
    sections.join('\n\n') || 'Permission overwrites changed.',
    MAX_FIELD_VALUE_LENGTH
  );
}

function getPermissionOverwriteMap(channel) {
  const entries = channel.permissionOverwrites?.cache
    ? [...channel.permissionOverwrites.cache.values()]
    : [];

  const sortedEntries = entries
    .map((overwrite) => [
      overwrite.id,
      {
        type: overwrite.type,
        allow: overwrite.allow.bitfield.toString(),
        deny: overwrite.deny.bitfield.toString()
      }
    ])
    .sort(([firstId], [secondId]) =>
      firstId.localeCompare(secondId)
    );

  return new Map(sortedEntries);
}

function formatOverwriteTarget(guild, id, type) {
  if (type === 0) {
    if (id === guild.id) {
      return '@everyone';
    }

    const role = guild.roles.cache.get(id);

    return role ? `<@&${id}>` : `Role (${id})`;
  }

  const member = guild.members.cache.get(id);

  return member ? `<@${id}>` : `Member (${id})`;
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

async function findChannelAuditEntry(channel, type) {
  return waitForAuditLogEntry({
    guild: channel.guild,
    type,
    timeout: 3000,
    match: (log) => {
      const recent =
        Date.now() - log.createdTimestamp < 10000;

      const sameTarget =
        log.target?.id === channel.id ||
        log.targetId === channel.id;

      return recent && sameTarget;
    }
  });
}

function formatCreatedChannel(channel) {
  if (channel.type === ChannelType.GuildCategory) {
    return channel.name;
  }

  return `<#${channel.id}>`;
}

function formatChannelType(type) {
  const channelTypes = {
    [ChannelType.GuildText]: '💬 Text Channel',
    [ChannelType.GuildVoice]: '🔊 Voice Channel',
    [ChannelType.GuildCategory]: '📁 Category',
    [ChannelType.GuildAnnouncement]: '📢 Announcement Channel',
    [ChannelType.GuildStageVoice]: '🎙️ Stage Channel',
    [ChannelType.GuildForum]: '💭 Forum Channel',
    [ChannelType.GuildMedia]: '🖼️ Media Channel'
  };

  return channelTypes[type] ?? `❓ Unknown (${type})`;
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

function formatNullableText(value) {
  const text = value?.trim();

  return text || 'None';
}

function formatEnabled(value) {
  if (typeof value !== 'boolean') {
    return 'Not applicable';
  }

  return value ? 'Enabled' : 'Disabled';
}

function formatPosition(value) {
  if (typeof value !== 'number') {
    return 'Unknown';
  }

  return String(value + 1);
}

function formatDurationSeconds(seconds) {
  if (typeof seconds !== 'number') {
    return 'Not applicable';
  }

  if (seconds === 0) return 'Off';

  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function formatArchiveDuration(minutes) {
  if (typeof minutes !== 'number') {
    return 'Not applicable';
  }

  if (minutes < 60) {
    return `${minutes} minutes`;
  }

  if (minutes < 1440) {
    const hours = minutes / 60;

    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  const days = minutes / 1440;

  return `${days} day${days === 1 ? '' : 's'}`;
}

function formatBitrate(bitrate) {
  if (typeof bitrate !== 'number') {
    return 'Not applicable';
  }

  return `${Math.round(bitrate / 1000)} kbps`;
}

function formatUserLimit(limit) {
  if (typeof limit !== 'number') {
    return 'Not applicable';
  }

  if (limit === 0) return 'Unlimited';

  return String(limit);
}

function formatRtcRegion(region) {
  return region ?? 'Automatic';
}

function formatVideoQuality(mode) {
  const modes = {
    1: 'Automatic',
    2: 'Full'
  };

  return modes[mode] ?? 'Not applicable';
}

function shortenText(text, maxLength) {
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 3)}...`;
}
