import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import {
  getCase,
  permanentlyDeleteCase
} from '../../services/moderationService.js';

const BUTTON_PREFIX = 'deletecase';

export const data = new SlashCommandBuilder()
  .setName('deletecase')
  .setDescription('Permanently delete a moderation case and its linked data.')
  .addIntegerOption((option) =>
    option
      .setName('number')
      .setDescription('The case number to permanently delete')
      .setMinValue(1)
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

export async function execute(interaction) {
  const caseNumber = interaction.options.getInteger('number', true);
  const moderationCase = getCase({ guildId: interaction.guildId, caseNumber });

  if (!moderationCase) {
    return interaction.reply({
      content: `Error: Case #${caseNumber} could not be found.`,
      flags: MessageFlags.Ephemeral
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}:confirm:${interaction.user.id}:${caseNumber}`)
      .setLabel(`Delete Case #${caseNumber}`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}:cancel:${interaction.user.id}:${caseNumber}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({
    content:
      `Warning: This will permanently delete **Case #${caseNumber}** (${formatType(moderationCase.caseType)}) ` +
      `for <@${moderationCase.userId}> and all linked edit history.\n\n` +
      'This only removes Pank\'s record. It does not reverse an active timeout or ban.',
    components: [row],
    allowedMentions: { parse: [] },
    flags: MessageFlags.Ephemeral
  });
}

export async function handleButton(interaction) {
  if (!interaction.customId.startsWith(`${BUTTON_PREFIX}:`)) return false;
  const [, action, requesterId, caseNumberValue] = interaction.customId.split(':');
  const caseNumber = Number(caseNumberValue);

  if (interaction.user.id !== requesterId) {
    await interaction.reply({
      content: 'Error: Only the administrator who opened this confirmation can use it.',
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (action === 'cancel') {
    await interaction.update({ content: `Cancelled deletion of Case #${caseNumber}.`, components: [] });
    return true;
  }

  if (action !== 'confirm') return false;

  const deletedCase = permanentlyDeleteCase({ guildId: interaction.guildId, caseNumber });
  if (!deletedCase) {
    await interaction.update({ content: `Error: Case #${caseNumber} could not be found.`, components: [] });
    return true;
  }

  await interaction.update({
    content:
      `Permanently deleted Case #${caseNumber} (${formatType(deletedCase.caseType)}) ` +
      `for <@${deletedCase.userId}> and all linked case data.`,
    components: [],
    allowedMentions: { parse: [] }
  });
  return true;
}

function formatType(value) {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
