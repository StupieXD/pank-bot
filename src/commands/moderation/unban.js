import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { removeLatestBan } from '../../services/moderationService.js';

export const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Unban a user by their Discord user ID.')
  .addStringOption((option) =>
    option
      .setName('user_id')
      .setDescription('Discord user ID to unban')
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(20)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for removing the ban')
      .setMaxLength(1000)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  try {
    const userId = interaction.options
      .getString('user_id', true)
      .trim();
    const reason =
      interaction.options.getString('reason') ??
      'Ban removed by a moderator.';

    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.editReply({
        content: 'Error: Enter a valid Discord user ID.'
      });
    }

    const ban = await interaction.guild.bans
      .fetch(userId)
      .catch(() => null);

    if (!ban) {
      return interaction.editReply({
        content: 'Error: That user is not currently banned.'
      });
    }

    await interaction.guild.members.unban(userId, reason);

    const moderationCase = removeLatestBan({
      guildId: interaction.guildId,
      userId,
      moderatorId: interaction.user.id,
      reason
    });

    return interaction.editReply({
      content:
        `Success: Unbanned <@${userId}>.` +
        (moderationCase
          ? `\nExisting case **#${moderationCase.caseNumber}** has been marked as removed.`
          : '\nNo matching active Pank ban case was found.')
    });
  } catch (error) {
    console.error('Failed to unban user:', error);

    return interaction.editReply({
      content:
        "Error: The user could not be unbanned. Check Pank's " +
        'permissions and the bot logs.'
    });
  }
}
