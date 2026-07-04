import { AuditLogEvent, EmbedBuilder } from 'discord.js';

import { config } from '../../config/config.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';

const EMBED_COLOUR = 0x9b59b6;

export async function handleNicknameChange(oldMember, newMember) {
  const oldNickname = oldMember.nickname ?? oldMember.user.username;
  const newNickname = newMember.nickname ?? newMember.user.username;

  if (oldNickname === newNickname) return;

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

      const changedNickname = log.changes?.some((change) =>
        change.key === 'nick'
      );

      return recent && sameTarget && changedNickname;
    }
  });

  const changedBy = auditEntry?.executor ?? null;
  const changedTimestamp = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setTitle('🏷️ Nickname Changed')
    .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: '👤 User',
        value:
          `<@${newMember.id}>\n` +
          `Display name: ${newMember.displayName}\n` +
          `Username: ${newMember.user.tag}`,
        inline: false
      },
      {
        name: 'Before',
        value: formatNickname(oldNickname),
        inline: true
      },
      {
        name: 'After',
        value: formatNickname(newNickname),
        inline: true
      },
      {
        name: '🕒 Changed',
        value: `<t:${changedTimestamp}:R> (<t:${changedTimestamp}:F>)`,
        inline: false
      },
      {
        name: '🛡️ Changed By',
        value: formatChangedBy(changedBy, newMember),
        inline: false
      }
    )
    .setFooter({ text: `🆔 User ID: ${newMember.id}` });

  await logChannel.send({ embeds: [embed] });
}

function formatNickname(nickname) {
  if (!nickname) return '`None`';

  return `\`${nickname}\``;
}

function formatChangedBy(changedBy, member) {
  if (changedBy && changedBy.id !== member.id) {
    return (
  `<@${changedBy.id}>\n` +
  `Display name: ${changedBy.globalName ?? changedBy.username}\n` +
  `Username: ${changedBy.tag}\n\n` +
  `**Changed by moderator**`
);
  }

  return (
  `<@${member.id}>\n` +
  `Display name: ${member.displayName}\n` +
  `Username: ${member.user.tag}\n\n` +
  `**Self changed**`
);
}
