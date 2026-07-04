import { EmbedBuilder } from 'discord.js';
import { config } from '../../config/config.js';

const EMBED_COLOUR = 0x2ecc71;

export async function handleMemberJoin(member) {
  const logChannel = await member.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find member log channel.');
    return;
  }

  const createdTimestamp = Math.floor(member.user.createdTimestamp / 1000);
  const joinedTimestamp = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setTitle('👋 Member Joined')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: '👤 User',
        value:
          `<@${member.user.id}>\n` +
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
        value: `<t:${joinedTimestamp}:R> (<t:${joinedTimestamp}:F>)`,
        inline: false
      },
      {
        name: '⏳ Account Age',
        value: formatDuration(Date.now() - member.user.createdTimestamp),
        inline: false
      }
    )
    .setFooter({ text: `🆔 User ID: ${member.user.id}` });

  await logChannel.send({ embeds: [embed] });
}

function formatDuration(ms) {
  const days = Math.floor(ms / 86400000);

  if (days < 1) return 'Less than 1 day';
  if (days === 1) return '1 day';

  return `${days} days`;
}
