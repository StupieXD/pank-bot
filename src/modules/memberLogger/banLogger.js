import { AuditLogEvent, EmbedBuilder } from 'discord.js';

import { config } from '../../config/config.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';

const BAN_COLOUR = 0xe74c3c;
const UNBAN_COLOUR = 0x2ecc71;

export async function handleMemberBan(ban) {
  await sendBanLog({
    ban,
    type: 'ban'
  });
}

export async function handleMemberUnban(ban) {
  await sendBanLog({
    ban,
    type: 'unban'
  });
}

async function sendBanLog({ ban, type }) {
  const logChannel = await ban.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find member log channel.');
    return;
  }

  const isBan = type === 'ban';
  const auditType = isBan ? AuditLogEvent.MemberBanAdd : AuditLogEvent.MemberBanRemove;

  const auditEntry = await waitForAuditLogEntry({
    guild: ban.guild,
    type: auditType,
    timeout: 3000,
    match: (log) => {
      const recent = Date.now() - log.createdTimestamp < 10000;
      const sameTarget = log.target?.id === ban.user.id || log.targetId === ban.user.id;

      return recent && sameTarget;
    }
  });

  const changedBy = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? 'No reason provided';
  const timestamp = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setColor(isBan ? BAN_COLOUR : UNBAN_COLOUR)
    .setTitle(isBan ? '🔨 Member Banned' : '🔓 Member Unbanned')
    .setThumbnail(ban.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: '👤 User',
        value:
          `<@${ban.user.id}>\n` +
          `Username: ${ban.user.tag}`,
        inline: false
      },
      {
        name: isBan ? '🔨 Banned' : '🔓 Unbanned',
        value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
        inline: false
      },
      {
        name: isBan ? '🛡️ Banned By' : '🛡️ Unbanned By',
        value: formatChangedBy(changedBy, isBan ? 'banned' : 'unbanned'),
        inline: false
      },
      {
        name: '📝 Reason',
        value: reason,
        inline: false
      }
    )
    .setFooter({ text: `🆔 User ID: ${ban.user.id}` });

  await logChannel.send({ embeds: [embed] });
}

function formatChangedBy(changedBy, action) {
  if (!changedBy) {
    return `Unknown\nUnable to determine who ${action} this member.`;
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
