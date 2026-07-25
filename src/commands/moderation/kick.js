import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { createKick } from '../../services/moderationService.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Remove a member from the server.')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Member to kick')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for the kick')
      .setRequired(true)
      .setMaxLength(1000)
  )
  .addBooleanOption((option) =>
    option
      .setName('dm')
      .setDescription('DM the member before kicking them')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  try {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
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
          `You were kicked from **${interaction.guild.name}**.\n` +
          `Reason: ${reason}`
        )
        .then(() => true)
        .catch(() => false);
    }

    await targetMember.kick(reason);

    const moderationCase = createKick({
      guildId: interaction.guildId,
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason
    });

    return interaction.editReply({
      content:
        `Success: Kicked <@${targetUser.id}>.\n` +
        `Case: **#${moderationCase.caseNumber}**` +
        (sendDm
          ? `\nDM: ${dmSent ? 'sent' : 'could not be delivered'}`
          : '') +
        `\n\nUse \`/case number:${moderationCase.caseNumber}\` to view the full case.`
    });
  } catch (error) {
    console.error('Failed to kick member:', error);

    return interaction.editReply({
      content:
        'Error: The member could not be kicked. Check role positions, ' +
        'permissions and the bot logs.'
    });
  }
}

function validateTarget(interaction, targetMember) {
  if (targetMember.id === interaction.user.id) {
    return 'You cannot kick yourself.';
  }

  if (targetMember.id === interaction.guild.ownerId) {
    return 'The server owner cannot be kicked.';
  }

  if (targetMember.user.bot) {
    return 'Bots cannot be kicked with this command.';
  }

  if (!targetMember.kickable) {
    return "Pank cannot kick this member. Check Pank's role position and permissions.";
  }

  if (
    interaction.user.id !== interaction.guild.ownerId &&
    interaction.member.roles.highest.comparePositionTo(
      targetMember.roles.highest
    ) <= 0
  ) {
    return 'You cannot kick a member with an equal or higher role than your highest role.';
  }

  return null;
}
