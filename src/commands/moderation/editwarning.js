import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { config } from '../../config/config.js';
import {
  editWarning,
  getCase
} from '../../services/moderationService.js';
import {
  formatDiscordTimestamp
} from '../../utils/moderationEmbedBuilder.js';

const EMBED_COLOUR = 0x3498db;

export const data = new SlashCommandBuilder()
  .setName('editwarning')
  .setDescription('Update the reason recorded for a warning case.')
  .addIntegerOption((option) =>
    option
      .setName('case')
      .setDescription('The warning case number to edit')
      .setRequired(true)
      .setMinValue(1)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('The corrected warning reason')
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

    const reason = interaction.options.getString(
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

    const updatedCase = editWarning({
      guildId: interaction.guildId,
      caseNumber,
      moderatorId: interaction.user.id,
      reason
    });

    const latestEdit = updatedCase.edits.at(-1);

    await sendWarningEditLog({
      interaction,
      updatedCase,
      latestEdit
    });

    return interaction.editReply({
      content:
        `\u2705 Warning Case **#${caseNumber}** has been updated.\n\n` +
        `Use \`/case number:${caseNumber}\` to view the edit history.`
    });
  } catch (error) {
    console.error('Failed to edit warning:', error);

    return interaction.editReply({
      content:
        getKnownErrorMessage(error) ??
        '\u274C The warning could not be updated. Check the bot logs for more information.'
    });
  }
}

async function sendWarningEditLog({
  interaction,
  updatedCase,
  latestEdit
}) {
  const logChannel = await interaction.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel?.isTextBased()) {
    console.log('Could not find moderation log channel.');
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setTitle(
      `\u270F\uFE0F Warning Edited \u2022 Case #${updatedCase.caseNumber}`
    )
    .addFields(
      {
        name: '\uD83D\uDC64 Member',
        value: `<@${updatedCase.userId}>\n\`${updatedCase.userId}\``,
        inline: false
      },
      {
        name: '\uD83D\uDEE1\uFE0F Edited By',
        value:
          `<@${interaction.user.id}>\n` +
          `${interaction.user.tag}\n` +
          `\`${interaction.user.id}\``,
        inline: false
      },
      {
        name: '\uD83D\uDCDD Previous Reason',
        value: latestEdit.previousReason,
        inline: false
      },
      {
        name: '\u2705 Updated Reason',
        value: latestEdit.newReason,
        inline: false
      },
      {
        name: '\uD83D\uDD52 Edited',
        value: formatDiscordTimestamp(latestEdit.editedAt),
        inline: false
      }
    )
    .setFooter({
      text: `Warning case #${updatedCase.caseNumber}`
    });

  const targetUser = await interaction.client.users
    .fetch(updatedCase.userId)
    .catch(() => null);

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
    'same as the current reason',
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
