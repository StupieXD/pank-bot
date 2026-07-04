import { EmbedBuilder } from 'discord.js';
import { config } from '../../config/config.js';

const EMBED_COLOUR = 0xe67e22;
const MAX_FIELD_LENGTH = 1000;

export async function handleMemberLeave(member) {
  const logChannel = await member.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find member log channel.');
    return;
  }

  const createdTimestamp = Math.floor(member.user.createdTimestamp / 1000);
  const joinedTimestamp = member.joinedTimestamp
    ? Math.floor(member.joinedTimestamp / 1000)
    : null;
  const leftTimestamp = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setTitle('🚪 Member Left')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: '👤 User',
        value:
          `<@${member.user.id}>\n` +
          `Display name: ${member.displayName}\n` +
          `Username: ${member.user.tag}`,
        inline: false
      },
      {
        name: '📅 Account Created',
        value: `<t:${createdTimestamp}:R> (<t:${createdTimestamp}:F>)`,
        inline: false
      },
      {
        name: '📥 Joined Server',
        value: joinedTimestamp
          ? `<t:${joinedTimestamp}:R> (<t:${joinedTimestamp}:F>)`
          : 'Unknown',
        inline: false
      },
      {
        name: '📤 Left Server',
        value: `<t:${leftTimestamp}:R> (<t:${leftTimestamp}:F>)`,
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
    )
    .setFooter({ text: `🆔 User ID: ${member.user.id}` });

  await logChannel.send({ embeds: [embed] });
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
