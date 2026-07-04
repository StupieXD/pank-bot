import { AuditLogEvent, EmbedBuilder } from 'discord.js';

import { config } from '../../config/config.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';

const ADDED_COLOUR = 0x2ecc71;
const REMOVED_COLOUR = 0xe74c3c;

export async function handleRoleChange(oldMember, newMember) {
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  const addedRoles = newRoles.filter((role) => !oldRoles.has(role.id));
  const removedRoles = oldRoles.filter((role) => !newRoles.has(role.id));

  if (addedRoles.size === 0 && removedRoles.size === 0) return;

  const logChannel = await newMember.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find member log channel.');
    return;
  }

  const auditEntry = await waitForAuditLogEntry({
    guild: newMember.guild,
    type: AuditLogEvent.MemberRoleUpdate,
    timeout: 3000,
    match: (log) => {
      const recent = Date.now() - log.createdTimestamp < 10000;
      const sameTarget =
        log.target?.id === newMember.id ||
        log.targetId === newMember.id;

      return recent && sameTarget;
    }
  });

  const changedBy = auditEntry?.executor ?? null;

  if (addedRoles.size > 0) {
    await sendRoleLog({
      logChannel,
      member: newMember,
      roles: addedRoles,
      changedBy,
      type: 'added'
    });
  }

  if (removedRoles.size > 0) {
    await sendRoleLog({
      logChannel,
      member: newMember,
      roles: removedRoles,
      changedBy,
      type: 'removed'
    });
  }
}

async function sendRoleLog({ logChannel, member, roles, changedBy, type }) {
  const changedTimestamp = Math.floor(Date.now() / 1000);
  const isAdded = type === 'added';

  const embed = new EmbedBuilder()
    .setColor(isAdded ? ADDED_COLOUR : REMOVED_COLOUR)
    .setTitle(isAdded ? '🏷️ Role Added' : '🏷️ Role Removed')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: '👤 User',
        value:
          `<@${member.id}>\n` +
          `Display name: ${member.displayName}\n` +
          `Username: ${member.user.tag}`,
        inline: false
      },
      {
        name: isAdded ? '🏷️ Role',
        value: formatRoles(roles),
        inline: false
      },
      {
        name: '🕒 Changed',
        value: `<t:${changedTimestamp}:R> (<t:${changedTimestamp}:F>)`,
        inline: false
      },
      {
        name: '🛡️ Changed By',
        value: formatChangedBy(changedBy, member),
        inline: false
      }
    )
    .setFooter({ text: `🆔 User ID: ${member.id}` });

  await logChannel.send({ embeds: [embed] });
}

function formatRoles(roles) {
  return [...roles.values()]
    .sort((a, b) => b.position - a.position)
    .map((role) => `<@&${role.id}>`)
    .join('\n');
}

function formatChangedBy(changedBy, member) {
  if (!changedBy) {
    return 'Unknown\nUnable to determine who changed these roles.';
  }

  if (changedBy.id === member.id) {
    return (
      `<@${member.id}>\n` +
      `Display name: ${member.displayName}\n` +
      `Username: ${member.user.tag}\n\n` +
      `**Self changed**`
    );
  }

  if (changedBy.bot) {
    return (
      `<@${changedBy.id}>\n` +
      `Display name: ${changedBy.globalName ?? changedBy.username}\n` +
      `Username: ${changedBy.tag}\n\n` +
      `**Changed by bot**`
    );
  }

  return (
    `<@${changedBy.id}>\n` +
    `Display name: ${changedBy.globalName ?? changedBy.username}\n` +
    `Username: ${changedBy.tag}\n\n` +
    `**Changed by moderator**`
  );
}
