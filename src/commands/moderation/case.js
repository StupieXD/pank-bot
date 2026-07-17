import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import {
  getAdjacentCase,
  getCase
} from '../../services/moderationService.js';
import {
  buildModerationCaseEmbed
} from '../../utils/moderationEmbedBuilder.js';

const BUTTON_PREFIX = 'case_navigate';

export const data = new SlashCommandBuilder()
  .setName('case')
  .setDescription('View the full details of a moderation case.')
  .addIntegerOption((option) =>
    option
      .setName('number')
      .setDescription('The moderation case number to view')
      .setRequired(true)
      .setMinValue(1)
  )
  .setDefaultMemberPermissions(
    PermissionFlagsBits.ModerateMembers
  )
  .setDMPermission(false);

export async function execute(interaction) {
  const caseNumber = interaction.options.getInteger(
    'number',
    true
  );

  const moderationCase = getCase({
    guildId: interaction.guildId,
    caseNumber
  });

  if (!moderationCase) {
    return interaction.reply({
      content: `\u274C Case #${caseNumber} could not be found.`,
      flags: MessageFlags.Ephemeral
    });
  }

  const response = await buildCaseResponse({
    interaction,
    moderationCase,
    requesterId: interaction.user.id
  });

  return interaction.reply({
    ...response,
    flags: MessageFlags.Ephemeral
  });
}

export async function handleButton(interaction) {
  if (!interaction.customId.startsWith(`${BUTTON_PREFIX}:`)) {
    return false;
  }

  const parsed = parseButtonId(interaction.customId);

  if (!parsed) {
    await interaction.reply({
      content: '\u274C This case navigation button is invalid.',
      flags: MessageFlags.Ephemeral
    });

    return true;
  }

  if (interaction.user.id !== parsed.requesterId) {
    await interaction.reply({
      content:
        '\u274C Only the moderator who opened this case can use these buttons.',
      flags: MessageFlags.Ephemeral
    });

    return true;
  }

  const moderationCase = getCase({
    guildId: interaction.guildId,
    caseNumber: parsed.caseNumber
  });

  if (!moderationCase) {
    await interaction.update({
      content: `\u274C Case #${parsed.caseNumber} could not be found.`,
      embeds: [],
      components: []
    });

    return true;
  }

  const response = await buildCaseResponse({
    interaction,
    moderationCase,
    requesterId: parsed.requesterId
  });

  await interaction.update(response);
  return true;
}

export async function buildCaseResponse({
  interaction,
  moderationCase,
  requesterId
}) {
  const embed = await buildModerationCaseEmbed({
    client: interaction.client,
    moderationCase
  });

  const previousCase = getAdjacentCase({
    guildId: moderationCase.guildId,
    caseNumber: moderationCase.caseNumber,
    direction: 'previous'
  });

  const nextCase = getAdjacentCase({
    guildId: moderationCase.guildId,
    caseNumber: moderationCase.caseNumber,
    direction: 'next'
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        buildButtonId({
          requesterId,
          caseNumber:
            previousCase?.caseNumber ?? moderationCase.caseNumber
        })
      )
      .setLabel(
        previousCase
          ? `Previous #${previousCase.caseNumber}`
          : 'Previous'
      )
      .setEmoji('\u25C0\uFE0F')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!previousCase),
    new ButtonBuilder()
      .setCustomId(
        buildButtonId({
          requesterId,
          caseNumber:
            nextCase?.caseNumber ?? moderationCase.caseNumber
        })
      )
      .setLabel(
        nextCase
          ? `Next #${nextCase.caseNumber}`
          : 'Next'
      )
      .setEmoji('\u25B6\uFE0F')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!nextCase)
  );

  return {
    content: null,
    embeds: [embed],
    components: [row],
    allowedMentions: {
      parse: []
    }
  };
}

function buildButtonId({ requesterId, caseNumber }) {
  return `${BUTTON_PREFIX}:${requesterId}:${caseNumber}`;
}

function parseButtonId(customId) {
  const parts = customId.split(':');

  if (parts.length !== 3) {
    return null;
  }

  const requesterId = parts[1];
  const caseNumber = Number(parts[2]);

  if (
    !requesterId ||
    !Number.isInteger(caseNumber) ||
    caseNumber < 1
  ) {
    return null;
  }

  return {
    requesterId,
    caseNumber
  };
}
