import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { getNotesForUser } from '../../services/moderationService.js';

const PAGE_SIZE = 5;
const BUTTON_PREFIX = 'notes-page';

export const data = new SlashCommandBuilder()
  .setName('notes')
  .setDescription('View private moderator notes for a member.')
  .addUserOption((option) =>
    option.setName('user').setDescription('The member to view').setRequired(true)
  )
  .addBooleanOption((option) =>
    option.setName('include_removed').setDescription('Include removed notes')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setDMPermission(false);

export async function execute(interaction) {
  const user = interaction.options.getUser('user', true);
  const includeRemoved = interaction.options.getBoolean('include_removed') ?? false;
  const response = buildResponse({
    interaction,
    userId: user.id,
    includeRemoved,
    page: 0,
    requesterId: interaction.user.id
  });

  return interaction.reply({ ...response, flags: MessageFlags.Ephemeral });
}

export async function handleButton(interaction) {
  if (!interaction.customId.startsWith(`${BUTTON_PREFIX}:`)) return false;
  const [, requesterId, userId, includeRemovedValue, pageValue] = interaction.customId.split(':');

  if (interaction.user.id !== requesterId) {
    await interaction.reply({ content: 'Error: Only the moderator who opened this list can use these buttons.', flags: MessageFlags.Ephemeral });
    return true;
  }

  const response = buildResponse({
    interaction,
    userId,
    includeRemoved: includeRemovedValue === '1',
    page: Number(pageValue),
    requesterId
  });
  await interaction.update(response);
  return true;
}

function buildResponse({ interaction, userId, includeRemoved, page, requesterId }) {
  const notes = getNotesForUser({ guildId: interaction.guildId, userId, includeRemoved, limit: 100 });
  const totalPages = Math.max(1, Math.ceil(notes.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageNotes = notes.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const description = pageNotes.length
    ? pageNotes.map(formatNote).join('\n\n')
    : 'No moderator notes were found for this member.';

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`Moderator Notes for ${userId}`)
    .setDescription(description)
    .setFooter({ text: `Page ${safePage + 1} of ${totalPages} | ${notes.length} note${notes.length === 1 ? '' : 's'}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}:${requesterId}:${userId}:${includeRemoved ? '1' : '0'}:${safePage - 1}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}:${requesterId}:${userId}:${includeRemoved ? '1' : '0'}:${safePage + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1)
  );

  return { embeds: [embed], components: totalPages > 1 ? [row] : [], allowedMentions: { parse: [] } };
}

function formatNote(note) {
  const timestamp = Math.floor(new Date(normaliseTimestamp(note.createdAt)).getTime() / 1000);
  return (
    `**Case #${note.caseNumber}** | ${toTitleCase(note.status)} | <t:${timestamp}:R>\n` +
    `${truncate(note.reason, 350)}\n` +
    `Added by <@${note.moderatorId}>`
  );
}

function truncate(value, max) {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function normaliseTimestamp(value) {
  return typeof value === 'string' && !value.includes('T') ? `${value.replace(' ', 'T')}Z` : value;
}

function toTitleCase(value) {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
