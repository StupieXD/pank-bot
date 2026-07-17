import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { config } from '../../config/config.js';
import {
  getCase,
  removeWarning
} from '../../services/moderationService.js';

const EMBED_COLOUR = 0x2ecc71;

export const data = new SlashCommandBuilder()
  .setName('deletewarning')
  .setDescription('Remove a warning while preserving its audit history.')
  .addIntegerOption((option) =>
    option
      .setName('case')
      .setDescription('The warning case number to remove')
      .setRequired(true)
      .setMinValue(1)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for removing the warning')
      .setRequired(true)
      .setMaxLength(1000)
  )
  .setDefaultMemberPermissions(
    PermissionFlagsBits.ModerateMembers
  )
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  try {
    const caseNumber = interaction.options.getInteger(
      'case',
      true
    );

    const removalReason = interaction.options.getString(
      'reason',
      true
    );

    const existingCase = getCase({
      guildId: interaction.guildId,
      caseNumber
    });

    if (!existingCase) {
      return interaction.editReply({
        content: `\u274C Case #${caseNumber} could not be found.`
      });
    }

    const removedCase = removeWarning({
      guildId: interaction.guildId,
      caseNumber,
      moderatorId: interaction.user.id,
      reason: removalReason
    });

    const targetUser = await interaction.client.users
      .fetch(removedCase.userId)
      .catch(() => null);

    const dmSent = targetUser
      ? await targetUser
          .send('Your warning has been removed.')
          .then(() => true)
          .catch(() => false)
      : false;

    await sendWarningRemovalLog({
      interaction,
      removedCase,
      targetUser,
      dmSent
    });

    return interaction.editReply({
      content:
        `\u2705 Warning Case **#${caseNumber}** has been removed.\n` +
        `DM sent: **${dmSent ? 'Yes' : 'No'}**\n\n` +
        `Use \`/case number:${caseNumber}\` to view the full case.`
    });
  } catch (error) {
    console.error('\u274C Failed to remove warning:', error);

    const knownMessage = getKnownErrorMessage(error);

    return interaction.editReply({
      content:
        knownMessage ??
        '\u274C The warning could not be removed. Check the bot logs for more information.'
    });
  }
}

async function sendWarningRemovalLog({
  interaction,
  removedCase,
  targetUser,
  dmSent
}) {
  const logChannel = await interaction.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel?.isTextBased()) {
    console.log('\u274C Could not find moderation log channel.');
    return;
  }

  const removedTimestamp = Math.floor(
    new Date(removedCase.removedAt).getTime() / 1000
  );

  const userDisplay = targetUser
    ? `<@${targetUser.id}>\nUsername: ${targetUser.tag}`
    : `<@${removedCase.userId}>\nUser ID: ${removedCase.userId}`;

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setTitle(
      `\u2705 Warning Removed \u2022 Case #${removedCase.caseNumber}`
    )
    .addFields(
      {
        name: '\uD83D\uDC64 User',
        value: userDisplay,
        inline: false
      },
      {
        name: '\uD83D\uDEE1\uFE0F Removed By',
        value:
          `<@${interaction.user.id}>\n` +
          `Username: ${interaction.user.tag}`,
        inline: false
      },
      {
        name: '\u26A0\uFE0F Originally Issued By',
        value: `<@${removedCase.moderatorId}>`,
        inline: false
      },
      {
        name: '\uD83D\uDCDD Original Reason',
        value: removedCase.reason,
        inline: false
      },
      {
        name: '\uD83D\uDDD1\uFE0F Removal Reason',
        value: removedCase.removalReason,
        inline: false
      },
      {
        name: '\u2709\uFE0F DM Sent',
        value: dmSent ? 'Yes' : 'No',
        inline: true
      },
      {
        name: '\uD83D\uDD52 Removed',
        value:
          `<t:${removedTimestamp}:R> ` +
          `(<t:${removedTimestamp}:F>)`,
        inline: false
      }
    )
    .setFooter({
      text:
        `\uD83C\uDD94 User ID: ${removedCase.userId} \u2022 ` +
        `Case #${removedCase.caseNumber}`
    });

  if (targetUser) {
    embed.setThumbnail(
      targetUser.displayAvatarURL({
        size: 256
      })
    );
  }

  await logChannel.send({
    embeds: [embed],
    allowedMentions: {
      parse: []
    }
  });
}

function getKnownErrorMessage(error) {
  if (!(error instanceof Error)) {
    return null;
  }

  const recognisedMessages = [
    'could not be found',
    'is not a warning',
    'has already been removed',
    'Reasons cannot exceed'
  ];

  if (
    recognisedMessages.some((message) =>
      error.message.includes(message)
    )
  ) {
    return `\u274C ${error.message}`;
  }

  return null;
}
