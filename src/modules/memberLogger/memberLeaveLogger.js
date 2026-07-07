import { AuditLogEvent, EmbedBuilder } from 'discord.js';

import { config } from '../../config/config.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';

const LEAVE_COLOUR = 0xe67e22;
const KICK_COLOUR = 0xe74c3c;
const MAX_FIELD_LENGTH = 1000;

export async function handleMemberLeave(member) {
  const logChannel = await member.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find member log channel.');
    return;
  }

  const kickAuditEntry = await waitForAuditLogEntry({
    guild: member.guild,
    type: AuditLogEvent.MemberKick,
    timeout: 3000,
    match: (log) => {
      const recent = Date.now() - log.createdTimestamp < 10000;
      const sameTarget =
        log.target?.id === member.user.id ||
        log.targetId === member.user.id;

      return recent && sameTarget;
    }
  });

  const embed = kickAuditEntry
    ? buildKickEmbed(member, kickAuditEntry)
    : buildLeaveEmbed(member);

  await logChannel.send({ embeds: [embed] });
}

function buildLeaveEmbed(member) {
  const timestamps = getMemberTimestamps(member);

  return new EmbedBuilder()
    .setColor(LEAVE_COLOUR)
    .setTitle('🚪 Member Left')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(...buildBaseFields(member, timestamps))
    .setFooter({ text: `🆔 User ID: ${member.user.id}` });
}

function buildKickEmbed(member, auditEntry) {
  const timestamps = getMemberTimestamps(member);
  const kickedBy = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? 'No reason provided';

  return new EmbedBuilder()
    .setColor(KICK_COLOUR)
    .setTitle('👢 Member Kicked')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      ...buildBaseFields(member, timestamps),
      {
        name: '👢 Kicked',
        value: `<t:${timestamps.left}:R> (<t:${timestamps.left}:F>)`,
        inline: false
      },
      {
        name: '🛡️ Kicked By',
        value: formatChangedBy(kickedBy),
        inline: false
      },
      {
        name: '📝 Reason',
        value: reason,
        inline: false
      }
    )
    .setFooter({ text: `🆔 User ID: ${member.user.id}` });
}

function buildBaseFields(member, timestamps) {
  return [
    {
      name: '👤 User',
      value:
        `<@${member.user.id}>\n` +
        `Username: ${member.user.tag}`,
      inline: false
    },
    {
      name: '📅 Account Created',
      value: `<t:${timestamps.created}:R> (<t:${timestamps.created}:F>)`,
      inline: false
    },
    {
      name: '📥 Joined Server',
      value: timestamps.joined
        ? `<t:${timestamps.joined}:R> (<t:${timestamps.joined}:F>)`
        : 'Unknown',
      inline: false
    },
    {
      name: '⏳ Time in Server',
      value: member.joinedTimestamp
        ? formatDuration(Date.now() - member.joinedTimestamp)
        : 'Unknown',
      inline: false
    },
    {
      name: '🎭 Roles',
      value: formatRoles(member),
      inline: false
    }
  ];
}

function getMemberTimestamps(member) {
  return {
    created: Math.floor(member.user.createdTimestamp / 1000),
    joined: member.joinedTimestamp
      ? Math.floor(member.joinedTimestamp / 1000)
      : null,
    left: Math.floor(Date.now() / 1000)
  };
}

function formatChangedBy(changedBy) {
  if (!changedBy) {
    return 'Unknown\nUnable to determine who kicked this member.';
  }

  if (changedBy.bot) {
    return (
      `<@${changedBy.id}>\n` +
      `Username: ${changedBy.tag}\n\n` +
      `**Changed by bot**`
    );
  }

  return (
    `<@${changedBy.id}>\n` +
    `Username: ${changedBy.tag}\n\n` +
    `**Changed by moderator**`
  );
}

function formatRoles(member) {
  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => `<@&${role.id}>`);

  if (roles.length === 0) return 'None';

  return roles.join(', ').slice(0, MAX_FIELD_LENGTH);
}

function formatDuration(ms) {
  const days = Math.floor(ms / 86400000);

  if (days < 1) return 'Less than 1 day';
  if (days === 1) return '1 day';

  return `${days} days`;
}
