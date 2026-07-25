import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { createBan } from '../../services/moderationService.js';
import {
  formatDuration,
  parseDuration
} from '../../utils/duration.js';

const MINIMUM_TEMPORARY_BAN_MS = 60_000;

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user permanently or temporarily.')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('User to ban')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for the ban')
      .setRequired(true)
      .setMaxLength(1000)
  )
  .addStringOption((option) =>
    option
      .setName('duration')
      .setDescription('Optional temporary-ban duration, for example: 7d')
      .setMaxLength(20)
  )
  .addIntegerOption((option) =>
    option
      .setName('delete_days')
      .setDescription('Days of recent messages to delete')
      .setMinValue(0)
      .setMaxValue(7)
  )
  .addBooleanOption((option) =>
    option
      .setName('dm')
      .setDescription('DM the user before banning them')
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
    const durationText = interaction.options.getString('duration');
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
    const sendDm = interaction.options.getBoolean('dm') ?? false;
    const targetMember = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    const validationError = validateTarget(
      interaction,
      targetMember,
      targetUser
    );

    if (validationError) {
      return interaction.editReply({
        content: `Error: ${validationError}`
      });
    }

    let durationMs = null;
    let expiresAt = null;

    if (durationText) {
      durationMs = parseDuration(durationText);

      if (durationMs < MINIMUM_TEMPORARY_BAN_MS) {
        throw new Error('Temporary bans must last at least 1 minute.');
      }

      expiresAt = new Date(Date.now() + durationMs).toISOString();
    }

    let dmSent = false;

    if (sendDm) {
      dmSent = await targetUser
        .send(
          `You were banned from **${interaction.guild.name}**` +
          (durationMs ? ` for ${formatDuration(durationMs)}` : '') +
          `.\nReason: ${reason}`
        )
        .then(() => true)
        .catch(() => false);
    }

    await interaction.guild.members.ban(targetUser.id, {
      deleteMessageSeconds: deleteDays * 86_400,
      reason
    });

    let moderationCase;

    try {
      moderationCase = createBan({
        guildId: interaction.guildId,
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        reason,
        expiresAt
      });
    } catch (caseError) {
      await interaction.guild.members
        .unban(targetUser.id, 'Ban case creation failed; action rolled back.')
        .catch(() => null);
      throw caseError;
    }

    return interaction.editReply({
      content:
        `Success: Banned <@${targetUser.id}>` +
        (durationMs ? ` for **${formatDuration(durationMs)}**` : '') +
        `.\nCase: **#${moderationCase.caseNumber}**` +
        (sendDm
          ? `\nDM: ${dmSent ? 'sent' : 'could not be delivered'}`
          : '') +
        `\n\nUse \`/case number:${moderationCase.caseNumber}\` to view the full case.`
    });
  } catch (error) {
    console.error('Failed to ban user:', error);

    return interaction.editReply({
      content: `Error: ${getPublicError(error)}`
    });
  }
}

function validateTarget(interaction, targetMember, targetUser) {
  if (targetUser.id === interaction.user.id) {
    return 'You cannot ban yourself.';
  }

  if (targetUser.id === interaction.guild.ownerId) {
    return 'The server owner cannot be banned.';
  }

  if (targetUser.id === interaction.client.user.id) {
    return 'Pank cannot ban itself.';
  }

  if (targetMember) {
    if (!targetMember.bannable) {
      return "Pank cannot ban this member. Check Pank's role position and permissions.";
    }

    if (
      interaction.user.id !== interaction.guild.ownerId &&
      interaction.member.roles.highest.comparePositionTo(
        targetMember.roles.highest
      ) <= 0
    ) {
      return 'You cannot ban a member with an equal or higher role than your highest role.';
    }
  }

  return null;
}

function getPublicError(error) {
  const message = String(error?.message ?? '');

  if (
    message.includes('Invalid duration') ||
    message.includes('at least 1 minute') ||
    message.includes('too large')
  ) {
    return message;
  }

  return (
    'The user could not be banned. Check role positions, permissions ' +
    'and the bot logs.'
  );
}
