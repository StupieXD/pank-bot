import { AuditLogEvent, EmbedBuilder } from 'discord.js';

import { config } from '../../config/config.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';

const TIMEOUT_COLOUR = 0xe67e22;
const REMOVE_TIMEOUT_COLOUR = 0x2ecc71;

export async function handleTimeoutChange(previousState, newMember) {
  const oldTimeout = previousState.communicationDisabledUntilTimestamp;
  const newTimeout = newMember.communicationDisabledUntilTimestamp;

  if (oldTimeout === newTimeout) return;

  const logChannel = await newMember.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find member log channel.');
    return;
  }

  const auditEntry = await waitForAuditLogEntry({
    guild: newMember.guild,
    type: AuditLogEvent.MemberUpdate,
    timeout: 3000,
    match: (log) => {
      const recent = Date.now() - log.createdTimestamp < 10000;
      const sameTarget =
        log.target?.id === newMember.id ||
        log.targetId === newMember.id;

      const changedTimeout = log.changes?.some((change) =>
        change.key === 'communication_disabled_until'
      );

      return recent && sameTarget && changedTimeout;
    }
  });

  const changedBy = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? 'No reason provided';
  const timestamp = Math.floor(Date.now() / 1000);
  const isTimedOut = Boolean(newTimeout);

  const embed = new EmbedBuilder()
    .setColor(isTimedOut ? TIMEOUT_COLOUR : REMOVE_TIMEOUT_COLOUR)
    .setTitle(isTimedOut ? '⏳ Member Timed Out' : '✅ Timeout Removed')
    .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: '👤 User',
        value:
          `<@${newMember.id}>\n` +
          `Username: ${newMember.user.tag}`,
        inline: false
      },
      {
        name: isTimedOut ? '⏰ Timeout Until' : '✅ Removed At',
        value: isTimedOut
          ? `<t:${Math.floor(newTimeout / 1000)}:R> (<t:${Math.floor(newTimeout / 1000)}:F>)`
          : `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
        inline: false
      },
      {
        name: '🕒 Logged',
        value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
        inline: false
      },
      {
        name: '🛡️ Changed By',
        value: formatChangedBy(changedBy),
        inline: false
      },
      {
        name: '📝 Reason',
        value: reason,
        inline: false
      }
    )
    .setFooter({ text: `🆔 User ID: ${newMember.id}` });

  await logChannel.send({ embeds: [embed] });
}

function formatChangedBy(changedBy) {
  if (!changedBy) {
    return 'Unknown\nUnable to determine who changed this timeout.';
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
