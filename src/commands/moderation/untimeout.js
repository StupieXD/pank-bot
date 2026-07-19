import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { removeLatestTimeout } from '../../services/moderationService.js';

export const data = new SlashCommandBuilder()
  .setName('untimeout')
  .setDescription('Remove a member’s active timeout.')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The member whose timeout should be removed')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for removing the timeout')
      .setRequired(false)
      .setMaxLength(1000)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  try {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'Timeout removed by a moderator.';
    const targetMember = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!targetMember) {
      return interaction.editReply({
        content: '❌ That user is not currently in this server.'
      });
    }

    const validationError = validateTarget(interaction, targetMember);

    if (validationError) {
      return interaction.editReply({
        content: `❌ ${validationError}`
      });
    }

    if (!targetMember.isCommunicationDisabled()) {
      return interaction.editReply({
        content: '❌ That member does not currently have an active timeout.'
      });
    }

    await targetMember.timeout(null, reason);

    const removedCase = removeLatestTimeout({
      guildId: interaction.guildId,
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason
    });

    return interaction.editReply({
      content:
        `✅ Removed the timeout from <@${targetUser.id}>.` +
        (removedCase
          ? `\nCase **#${removedCase.caseNumber}** has been marked as removed.`
          : '\nNo matching Pank timeout case was found, so only the Discord timeout was removed.')
    });
  } catch (error) {
    console.error('❌ Failed to remove timeout:', error);

    return interaction.editReply({
      content: '❌ The timeout could not be removed. Check Pank’s permissions and the bot logs.'
    });
  }
}

function validateTarget(interaction, targetMember) {
  if (targetMember.id === interaction.user.id) {
    return 'You cannot remove your own timeout.';
  }

  if (targetMember.id === interaction.guild.ownerId) {
    return 'The server owner cannot be timed out.';
  }

  if (!targetMember.moderatable) {
    return 'Pank cannot modify this member. Check Pank’s role position and permissions.';
  }

  if (
    interaction.user.id !== interaction.guild.ownerId &&
    interaction.member.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0
  ) {
    return 'You cannot modify a member with an equal or higher role than your highest role.';
  }

  return null;
}
