import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import {
  createChannelLock,
  deleteChannelLock,
  getChannelLock
} from '../../database/repositories/channelLockRepository.js';

const INHERIT = -1;
const DENY = 0;
const ALLOW = 1;

export const data = new SlashCommandBuilder()
  .setName('lock')
  .setDescription('Lock the current channel for regular members.')
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for locking the channel')
      .setRequired(false)
      .setMaxLength(1000)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const channel = interaction.channel;
    const reason = interaction.options.getString('reason')?.trim() || 'No reason provided.';

    const validationError = validateChannel(interaction, channel);
    if (validationError) {
      return interaction.editReply({ content: `Error: ${validationError}` });
    }

    if (getChannelLock(interaction.guildId, channel.id)) {
      return interaction.editReply({
        content: 'Error: This channel is already locked through Pank.'
      });
    }

    const everyoneOverwrite = channel.permissionOverwrites.cache.get(interaction.guildId);
    const previousSendMessages = getPermissionState(
      everyoneOverwrite,
      PermissionFlagsBits.SendMessages
    );
    const previousSendMessagesInThreads = getPermissionState(
      everyoneOverwrite,
      PermissionFlagsBits.SendMessagesInThreads
    );

    createChannelLock({
      guildId: interaction.guildId,
      channelId: channel.id,
      sendMessagesState: previousSendMessages,
      sendMessagesInThreadsState: previousSendMessagesInThreads,
      moderatorId: interaction.user.id,
      reason
    });

    try {
      await channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages: false,
          SendMessagesInThreads: false
        },
        reason
      );
    } catch (error) {
      deleteChannelLock(interaction.guildId, channel.id);
      throw error;
    }

    return interaction.editReply({
      content:
        `Success: Locked <#${channel.id}> for regular members.\n` +
        `Reason: ${reason}`
    });
  } catch (error) {
    console.error('Error: Failed to lock channel:', error);
    return interaction.editReply({
      content: "Error: The channel could not be locked. Check Pank's permissions and the bot logs."
    });
  }
}

function validateChannel(interaction, channel) {
  if (!channel?.guild || !channel.permissionOverwrites) {
    return 'This command can only be used in a supported server channel.';
  }

  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return 'Pank needs the Manage Channels permission.';
  }

  const channelPermissions = channel.permissionsFor(botMember);
  if (!channelPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    return 'Pank cannot manage permissions in this channel.';
  }

  return null;
}

function getPermissionState(overwrite, permission) {
  if (!overwrite) return INHERIT;
  if (overwrite.allow.has(permission)) return ALLOW;
  if (overwrite.deny.has(permission)) return DENY;
  return INHERIT;
}
