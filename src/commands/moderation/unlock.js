import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import {
  deleteChannelLock,
  getChannelLock
} from '../../database/repositories/channelLockRepository.js';

const INHERIT = -1;
const DENY = 0;
const ALLOW = 1;

export const data = new SlashCommandBuilder()
  .setName('unlock')
  .setDescription('Restore the channel permissions saved by Pank when it was locked.')
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for unlocking the channel')
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

    if (!channel?.guild || !channel.permissionOverwrites) {
      return interaction.editReply({
        content: 'Error: This command can only be used in a supported server channel.'
      });
    }

    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.editReply({
        content: 'Error: Pank needs the Manage Channels permission.'
      });
    }

    if (!channel.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.editReply({
        content: 'Error: Pank cannot manage permissions in this channel.'
      });
    }

    const savedLock = getChannelLock(interaction.guildId, channel.id);
    if (!savedLock) {
      return interaction.editReply({
        content: 'Error: Pank has no saved lock state for this channel.'
      });
    }

    await channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      {
        SendMessages: toPermissionValue(savedLock.sendMessagesState),
        SendMessagesInThreads: toPermissionValue(savedLock.sendMessagesInThreadsState)
      },
      reason
    );

    deleteChannelLock(interaction.guildId, channel.id);

    return interaction.editReply({
      content:
        `Success: Restored the saved permissions for <#${channel.id}>.\n` +
        `Reason: ${reason}`
    });
  } catch (error) {
    console.error('Error: Failed to unlock channel:', error);
    return interaction.editReply({
      content: "Error: The channel could not be unlocked. Check Pank's permissions and the bot logs."
    });
  }
}

function toPermissionValue(state) {
  if (state === ALLOW) return true;
  if (state === DENY) return false;
  if (state === INHERIT) return null;
  throw new Error(`Unknown saved permission state: ${state}`);
}
