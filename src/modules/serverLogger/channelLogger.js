import {
  AuditLogEvent,
  ChannelType,
  EmbedBuilder
} from 'discord.js';

import { config } from '../../config/config.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';

const CREATE_COLOUR = 0x2ecc71;
const DELETE_COLOUR = 0xe74c3c;

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
      value: `Name: ${channel.name}`,
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
      value: reason,
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

/*
 * Channel and category update logging will be implemented next.
 * This export remains so channelUpdate.js loads safely.
 */
export async function handleChannelUpdate(oldChannel, newChannel) {
  if (!oldChannel || !newChannel) return;
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
    return `Name: ${channel.name}`;
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
