import {
  AuditLogEvent,
  EmbedBuilder
} from 'discord.js';

import { config } from '../../config/config.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';

const CREATE_COLOUR = 0x2ecc71;
const DELETE_COLOUR = 0xe74c3c;
const MAX_FIELD_VALUE_LENGTH = 1000;

export async function handleInviteCreate(invite) {
  const guild = invite.guild;

  if (!guild || !('client' in guild)) return;

  const logChannel = await getLogChannel(guild.client);
  if (!logChannel) return;

  const auditEntry = await findInviteAuditEntry(
    invite,
    AuditLogEvent.InviteCreate
  );

  const createdBy =
    auditEntry?.executor ??
    invite.inviter ??
    null;

  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(
    (invite.createdTimestamp ?? Date.now()) / 1000
  );

  const fields = [
    {
      name: '🔗 Invite',
      value:
        `Code: \`${invite.code}\`\n` +
        `[Open Invite](${invite.url})`,
      inline: false
    },
    {
      name: '📍 Channel',
      value: formatInviteChannel(invite),
      inline: false
    },
    {
      name: '⌛ Expires',
      value: formatInviteExpiry(invite),
      inline: true
    },
    {
      name: '🔢 Maximum Uses',
      value: formatMaximumUses(invite.maxUses),
      inline: true
    },
    {
      name: '📊 Current Uses',
      value: formatCurrentUses(invite.uses),
      inline: true
    },
    {
      name: '⏱️ Temporary Membership',
      value: formatTemporary(invite.temporary),
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
        'Unable to determine who created this invite.'
      ),
      inline: false
    }
  ];

  const target = formatInviteTarget(invite);

  if (target) {
    fields.splice(2, 0, {
      name: '🎯 Target',
      value: target,
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
    .setColor(CREATE_COLOUR)
    .setTitle('➕ Invite Created')
    .addFields(fields)
    .setFooter({ text: `🆔 Invite Code: ${invite.code}` });

  await logChannel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
}

export async function handleInviteDelete(invite) {
  const guild = invite.guild;

  if (!guild || !('client' in guild)) return;

  const logChannel = await getLogChannel(guild.client);
  if (!logChannel) return;

  const auditEntry = await findInviteAuditEntry(
    invite,
    AuditLogEvent.InviteDelete
  );

  const deletedBy = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(Date.now() / 1000);

  const fields = [
    {
      name: '🔗 Invite',
      value: `Code: \`${invite.code}\``,
      inline: false
    },
    {
      name: '📍 Channel',
      value: formatInviteChannel(invite),
      inline: false
    },
    {
      name: '⌛ Expiry',
      value: formatInviteExpiry(invite),
      inline: true
    },
    {
      name: '🔢 Maximum Uses',
      value: formatMaximumUses(invite.maxUses),
      inline: true
    },
    {
      name: '📊 Uses Before Deletion',
      value: formatCurrentUses(invite.uses),
      inline: true
    },
    {
      name: '⏱️ Temporary Membership',
      value: formatTemporary(invite.temporary),
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
        'Unable to determine who deleted this invite.'
      ),
      inline: false
    }
  ];

  const target = formatInviteTarget(invite);

  if (target) {
    fields.splice(2, 0, {
      name: '🎯 Target',
      value: target,
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
    .setTitle('🗑️ Invite Deleted')
    .addFields(fields)
    .setFooter({ text: `🆔 Invite Code: ${invite.code}` });

  await logChannel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
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

async function findInviteAuditEntry(invite, type) {
  return waitForAuditLogEntry({
    guild: invite.guild,
    type,
    timeout: 3000,
    match: (log) => {
      const recent =
        Date.now() - log.createdTimestamp < 10000;

      const sameInvite =
        log.target?.code === invite.code ||
        log.target?.id === invite.code ||
        log.targetId === invite.code;

      return recent && sameInvite;
    }
  });
}

function formatInviteChannel(invite) {
  if (invite.channelId) {
    return `<#${invite.channelId}>`;
  }

  if (invite.channel?.name) {
    return invite.channel.name;
  }

  return 'Unknown';
}

function formatInviteExpiry(invite) {
  if (invite.expiresTimestamp) {
    const expiresTimestamp = Math.floor(
      invite.expiresTimestamp / 1000
    );

    return (
      `<t:${expiresTimestamp}:R> ` +
      `(<t:${expiresTimestamp}:F>)`
    );
  }

  if (invite.maxAge === 0) {
    return 'Never';
  }

  if (
    typeof invite.maxAge === 'number' &&
    invite.maxAge > 0
  ) {
    return formatDurationSeconds(invite.maxAge);
  }

  return 'Unknown';
}

function formatMaximumUses(maxUses) {
  if (maxUses === 0) return 'Unlimited';

  if (typeof maxUses !== 'number') {
    return 'Unknown';
  }

  return String(maxUses);
}

function formatCurrentUses(uses) {
  if (typeof uses !== 'number') {
    return 'Unknown';
  }

  return String(uses);
}

function formatTemporary(temporary) {
  if (typeof temporary !== 'boolean') {
    return 'Unknown';
  }

  return temporary ? 'Yes' : 'No';
}

function formatInviteTarget(invite) {
  if (invite.guildScheduledEvent) {
    return (
      `Scheduled event: ${invite.guildScheduledEvent.name}\n` +
      `ID: ${invite.guildScheduledEvent.id}`
    );
  }

  if (invite.targetUser) {
    return (
      `<@${invite.targetUser.id}>\n` +
      `Username: ${invite.targetUser.tag}`
    );
  }

  if (invite.targetApplication) {
    return (
      `${invite.targetApplication.name}\n` +
      `Application ID: ${invite.targetApplication.id}`
    );
  }

  return null;
}

function formatDurationSeconds(seconds) {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    if (remainingSeconds === 0) {
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }

    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    if (remainingMinutes === 0) {
      return `${hours} hour${hours === 1 ? '' : 's'}`;
    }

    return `${hours}h ${remainingMinutes}m`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (remainingHours === 0) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  return `${days}d ${remainingHours}h`;
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
