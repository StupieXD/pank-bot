import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder
} from 'discord.js';

import { resetCases } from '../../services/moderationService.js';

const BUTTON_PREFIX = 'resetcases';

export const data = new SlashCommandBuilder()
  .setName('resetcases')
  .setDescription('Owner only: delete every moderation case and restart numbering.')
  .setDMPermission(false);

export async function execute(interaction) {
  if (interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({
      content: 'Error: Only the server owner can reset all moderation cases.',
      flags: MessageFlags.Ephemeral
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}:confirm:${interaction.user.id}`)
      .setLabel('Permanently Reset All Cases')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}:cancel:${interaction.user.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({
    content:
      '**DANGER: This will permanently delete every moderation case in this server.**\n\n' +
      'Warnings, notes, timeout records, kick records, ban records, softban records and all case edit history will be removed. ' +
      'The next new case will be Case #1.\n\n' +
      'Active Discord timeouts and bans will not be reversed.',
    components: [row],
    flags: MessageFlags.Ephemeral
  });
}

export async function handleButton(interaction) {
  if (!interaction.customId.startsWith(`${BUTTON_PREFIX}:`)) return false;
  const [, action, requesterId] = interaction.customId.split(':');

  if (interaction.user.id !== requesterId || interaction.user.id !== interaction.guild.ownerId) {
    await interaction.reply({
      content: 'Error: Only the server owner who opened this confirmation can use it.',
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (action === 'cancel') {
    await interaction.update({ content: 'Case reset cancelled.', components: [] });
    return true;
  }

  if (action !== 'confirm') return false;

  const deletedCount = resetCases({ guildId: interaction.guildId });
  await interaction.update({
    content:
      `Reset complete. Permanently deleted **${deletedCount}** moderation case${deletedCount === 1 ? '' : 's'}.\n` +
      'The next moderation case created will be Case #1.',
    components: []
  });
  return true;
}
