import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import {
  getCase,
  ModerationCaseType,
  purgeWarning
} from '../../services/moderationService.js';

const CONFIRM_PREFIX = 'purgewarning_confirm';
const CANCEL_PREFIX = 'purgewarning_cancel';
const CONFIRMATION_COLOUR = 0xe74c3c;

export const data = new SlashCommandBuilder()
  .setName('purgewarning')
  .setDescription('Permanently erase a warning case from the database.')
  .addIntegerOption((option) =>
    option
      .setName('case')
      .setDescription('The warning case number to erase permanently')
      .setRequired(true)
      .setMinValue(1)
  )
  .setDefaultMemberPermissions(
    PermissionFlagsBits.Administrator
  )
  .setDMPermission(false);

export async function execute(interaction) {
  if (interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({
      content:
        '❌ Only the server owner can permanently erase warning cases.',
      flags: MessageFlags.Ephemeral
    });
  }

  const caseNumber = interaction.options.getInteger(
    'case',
    true
  );

  const moderationCase = getCase({
    guildId: interaction.guildId,
    caseNumber
  });

  if (!moderationCase) {
    return interaction.reply({
      content: `❌ Case #${caseNumber} could not be found.`,
      flags: MessageFlags.Ephemeral
    });
  }

  if (moderationCase.caseType !== ModerationCaseType.WARNING) {
    return interaction.reply({
      content: `❌ Case #${caseNumber} is not a warning.`,
      flags: MessageFlags.Ephemeral
    });
  }

  const embed = new EmbedBuilder()
    .setColor(CONFIRMATION_COLOUR)
    .setTitle('⚠️ Permanently Delete Warning?')
    .setDescription(
      `You are about to permanently erase **Case #${caseNumber}** ` +
      'from the SQLite database.\n\n' +
      '**This cannot be undone.** The case will no longer appear in ' +
      'warning history or future case lookups.'
    )
    .addFields(
      {
        name: '👤 User',
        value: `<@${moderationCase.userId}>`,
        inline: false
      },
      {
        name: '📝 Reason',
        value: moderationCase.reason,
        inline: false
      }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${CONFIRM_PREFIX}:${interaction.user.id}:${caseNumber}`
      )
      .setLabel('Permanently Delete')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(
        `${CANCEL_PREFIX}:${interaction.user.id}:${caseNumber}`
      )
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral
  });
}

export async function handleButton(interaction) {
  const isConfirmation = interaction.customId.startsWith(
    `${CONFIRM_PREFIX}:`
  );

  const isCancellation = interaction.customId.startsWith(
    `${CANCEL_PREFIX}:`
  );

  if (!isConfirmation && !isCancellation) {
    return false;
  }

  const parsed = parseButtonId(interaction.customId);

  if (!parsed) {
    await interaction.reply({
      content: '❌ This confirmation button is invalid.',
      flags: MessageFlags.Ephemeral
    });

    return true;
  }

  if (
    interaction.user.id !== parsed.requesterId ||
    interaction.user.id !== interaction.guild.ownerId
  ) {
    await interaction.reply({
      content:
        '❌ Only the server owner who opened this confirmation can use it.',
      flags: MessageFlags.Ephemeral
    });

    return true;
  }

  if (isCancellation) {
    await interaction.update({
      content: '✅ Permanent warning deletion cancelled.',
      embeds: [],
      components: []
    });

    return true;
  }

  try {
    const deletedCase = purgeWarning({
      guildId: interaction.guildId,
      caseNumber: parsed.caseNumber
    });

    await interaction.update({
      content:
        `✅ Warning Case **#${deletedCase.caseNumber}** was ` +
        'permanently erased from the database.',
      embeds: [],
      components: []
    });
  } catch (error) {
    console.error(
      '❌ Failed to permanently delete warning:',
      error
    );

    await interaction.update({
      content:
        error instanceof Error
          ? `❌ ${error.message}`
          : '❌ The warning could not be permanently deleted.',
      embeds: [],
      components: []
    });
  }

  return true;
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
