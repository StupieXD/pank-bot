import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { createTimeout } from '../../services/moderationService.js';
import {
  formatDuration,
  parseDuration,
  validateTimeoutDuration
} from '../../utils/duration.js';

export const data = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('Temporarily prevent a member from interacting in the server.')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The member to time out')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('duration')
      .setDescription('How long the timeout should last (for example: 30m, 12h or 7d)')
      .setRequired(true)
      .setMaxLength(20)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for the timeout')
      .setRequired(true)
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
    const durationText = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason', true);
    const targetMember = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!targetMember) {
      return interaction.editReply({
        content: 'â That user is not currently in this server.'
      });
    }

    const validationError = validateTarget(interaction, targetMember);

    if (validationError) {
      return interaction.editReply({
        content: `â ${validationError}`
      });
    }

    const durationMs = parseDuration(durationText);
    validateTimeoutDuration(durationMs);

    const expiresAt = new Date(Date.now() + durationMs);

    await targetMember.timeout(durationMs, reason);

    let moderationCase;

    try {
      moderationCase = createTimeout({
        guildId: interaction.guildId,
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        reason,
        expiresAt: expiresAt.toISOString()
      });
    } catch (caseError) {
      await targetMember.timeout(null, 'Timeout case creation failed; action rolled back.')
        .catch(() => null);
      throw caseError;
    }

    const expiryTimestamp = Math.floor(expiresAt.getTime() / 1000);

    return interaction.editReply({
      content:
        `â Timed out <@${targetUser.id}> for **${formatDuration(durationMs)}**.\n` +
        `Case: **#${moderationCase.caseNumber}**\n` +
        `Expires: <t:${expiryTimestamp}:R> (<t:${expiryTimestamp}:F>)\n\n` +
        `Use \`/case number:${moderationCase.caseNumber}\` to view the full case.`
    });
  } catch (error) {
    console.error('â Failed to time out member:', error);

    return interaction.editReply({
      content: `â ${getPublicError(error)}`
    });
  }
}

function validateTarget(interaction, targetMember) {
  if (targetMember.id === interaction.user.id) {
    return 'You cannot time yourself out.';
  }

  if (targetMember.id === interaction.guild.ownerId) {
    return 'The server owner cannot be timed out.';
  }

  if (targetMember.user.bot) {
    return 'Bots cannot be timed out.';
  }

  if (!targetMember.moderatable) {
    return 'Pank cannot time out this member. Check Pankâs role position and permissions.';
  }

  if (
    interaction.user.id !== interaction.guild.ownerId &&
    interaction.member.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0
  ) {
    return 'You cannot time out a member with an equal or higher role than your highest role.';
  }

  return null;
}

function getPublicError(error) {
  const message = String(error?.message ?? '');

  if (
    message.includes('Invalid duration') ||
    message.includes('at least 5 seconds') ||
    message.includes('longer than 28 days')
  ) {
    return message;
  }

  return 'The timeout could not be applied. Check Pankâs permissions and the bot logs.';
}
