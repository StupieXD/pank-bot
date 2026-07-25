import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { createSoftban } from '../../services/moderationService.js';

export const data = new SlashCommandBuilder()
  .setName('softban')
  .setDescription('Ban and immediately unban a member to remove recent messages.')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Member to softban')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for the softban')
      .setRequired(true)
      .setMaxLength(1000)
  )
  .addIntegerOption((option) =>
    option
      .setName('delete_days')
      .setDescription('Days of recent messages to delete')
      .setMinValue(1)
      .setMaxValue(7)
  )
  .addBooleanOption((option) =>
    option
      .setName('dm')
      .setDescription('DM the member before the softban')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  try {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const deleteDays = interaction.options.getInteger('delete_days') ?? 1;
    const sendDm = interaction.options.getBoolean('dm') ?? false;
    const targetMember = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!targetMember) {
      return interaction.editReply({
        content: 'Error: That user is not currently in this server.'
      });
    }

    const validationError = validateTarget(interaction, targetMember);

    if (validationError) {
      return interaction.editReply({
        content: `Error: ${validationError}`
      });
    }

    let dmSent = false;

    if (sendDm) {
      dmSent = await targetUser
        .send(
          `You were removed from **${interaction.guild.name}** and may rejoin.\n` +
          `Reason: ${reason}`
        )
        .then(() => true)
        .catch(() => false);
    }

    await interaction.guild.members.ban(targetUser.id, {
      deleteMessageSeconds: deleteDays * 86_400,
      reason
    });

    try {
      await interaction.guild.members.unban(targetUser.id, 'Softban completed.');
    } catch (unbanError) {
      console.error('Softban ban succeeded but unban failed:', unbanError);
      throw new Error(
        'The user was banned, but Pank could not complete the immediate unban.'
      );
    }

    const moderationCase = createSoftban({
      guildId: interaction.guildId,
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason
    });

    return interaction.editReply({
      content:
        `Success: Softbanned <@${targetUser.id}> and removed up to ` +
        `**${deleteDays} day${deleteDays === 1 ? '' : 's'}** of recent messages.\n` +
        `Case: **#${moderationCase.caseNumber}**` +
        (sendDm
          ? `\nDM: ${dmSent ? 'sent' : 'could not be delivered'}`
          : '')
    });
  } catch (error) {
    console.error('Failed to softban member:', error);

    return interaction.editReply({
      content:
        `Error: ${String(error?.message ?? '').includes('immediate unban')
          ? error.message
          : 'The member could not be softbanned. Check role positions, permissions and the bot logs.'}`
    });
  }
}

function validateTarget(interaction, targetMember) {
  if (targetMember.id === interaction.user.id) {
    return 'You cannot softban yourself.';
  }

  if (targetMember.id === interaction.guild.ownerId) {
    return 'The server owner cannot be softbanned.';
  }

  if (targetMember.user.bot) {
    return 'Bots cannot be softbanned with this command.';
  }

  if (!targetMember.bannable) {
    return "Pank cannot softban this member. Check Pank's role position and permissions.";
  }

  if (
    interaction.user.id !== interaction.guild.ownerId &&
    interaction.member.roles.highest.comparePositionTo(
      targetMember.roles.highest
    ) <= 0
  ) {
    return 'You cannot softban a member with an equal or higher role than your highest role.';
  }

  return null;
}
