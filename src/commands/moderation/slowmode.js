import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

const MAX_SLOWMODE_SECONDS = 21600;

export const data = new SlashCommandBuilder()
  .setName('slowmode')
  .setDescription('Set or disable slowmode in the current channel.')
  .addStringOption((option) =>
    option
      .setName('duration')
      .setDescription('Examples: 10s, 2m, 1h or off')
      .setRequired(true)
      .setMaxLength(20)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for changing slowmode')
      .setRequired(false)
      .setMaxLength(1000)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const channel = interaction.channel;
    const durationText = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason')?.trim() || 'No reason provided.';

    if (!channel?.guild || typeof channel.setRateLimitPerUser !== 'function') {
      return interaction.editReply({
        content: 'Error: Slowmode is not supported in this channel.'
      });
    }

    const botMember = interaction.guild.members.me;
    if (!channel.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.editReply({
        content: 'Error: Pank needs Manage Channels in this channel.'
      });
    }

    const seconds = parseSlowmode(durationText);
    const previousSeconds = channel.rateLimitPerUser ?? 0;

    await channel.setRateLimitPerUser(seconds, reason);

    return interaction.editReply({
      content:
        `Success: Changed slowmode in <#${channel.id}> from **${formatSeconds(previousSeconds)}** ` +
        `to **${formatSeconds(seconds)}**.\nReason: ${reason}`
    });
  } catch (error) {
    console.error('Error: Failed to change slowmode:', error);
    return interaction.editReply({
      content: `Error: ${getPublicError(error)}`
    });
  }
}

function parseSlowmode(value) {
  const normalised = value.trim().toLowerCase();
  if (['off', 'none', '0', '0s'].includes(normalised)) return 0;

  const match = normalised.match(/^(\d+)\s*([smh])$/);
  if (!match) {
    throw new Error('Use a duration such as 10s, 2m, 1h or off.');
  }

  const amount = Number.parseInt(match[1], 10);
  const multiplier = { s: 1, m: 60, h: 3600 }[match[2]];
  const seconds = amount * multiplier;

  if (seconds < 1 || seconds > MAX_SLOWMODE_SECONDS) {
    throw new Error('Slowmode must be between 1 second and 6 hours, or off.');
  }

  return seconds;
}

function formatSeconds(seconds) {
  if (!seconds) return 'off';
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function getPublicError(error) {
  const message = String(error?.message ?? '');
  if (message.includes('Use a duration') || message.includes('between 1 second')) {
    return message;
  }
  return "Slowmode could not be changed. Check Pank's permissions and the bot logs.";
}
