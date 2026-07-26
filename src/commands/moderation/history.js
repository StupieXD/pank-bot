import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { getHistoryForUser } from '../../services/moderationService.js';

const PAGE_SIZE = 6;
const BUTTON_PREFIX = 'history-page';

export const data = new SlashCommandBuilder()
  .setName('history')
  .setDescription('View a member\'s complete moderation history.')
  .addUserOption((option) =>
    option.setName('user').setDescription('The member to view').setRequired(true)
  )
  .addBooleanOption((option) =>
    option.setName('include_removed').setDescription('Include removed cases').setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setDMPermission(false);

export async function execute(interaction) {
  const user = interaction.options.getUser('user', true);
  const includeRemoved = interaction.options.getBoolean('include_removed') ?? true;
  return interaction.reply({
    ...buildResponse({ interaction, userId: user.id, includeRemoved, page: 0, requesterId: interaction.user.id }),
    flags: MessageFlags.Ephemeral
  });
}

export async function handleButton(interaction) {
  if (!interaction.customId.startsWith(`${BUTTON_PREFIX}:`)) return false;
  const [, requesterId, userId, includeRemovedValue, pageValue] = interaction.customId.split(':');

  if (interaction.user.id !== requesterId) {
    await interaction.reply({ content: 'Error: Only the moderator who opened this history can use these buttons.', flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.update(buildResponse({
    interaction,
    userId,
    includeRemoved: includeRemovedValue === '1',
    page: Number(pageValue),
    requesterId
  }));
  return true;
}

function buildResponse({ interaction, userId, includeRemoved, page, requesterId }) {
  const cases = getHistoryForUser({ guildId: interaction.guildId, userId, includeRemoved, limit: 100 });
  const totalPages = Math.max(1, Math.ceil(cases.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageCases = cases.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const description = pageCases.length
    ? pageCases.map(formatCase).join('\n\n')
    : 'No moderation history was found for this member.';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Moderation History for ${userId}`)
    .setDescription(description)
    .setFooter({ text: `Page ${safePage + 1} of ${totalPages} | ${cases.length} case${cases.length === 1 ? '' : 's'}` });

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

function formatCase(moderationCase) {
  const timestamp = Math.floor(new Date(normaliseTimestamp(moderationCase.createdAt)).getTime() / 1000);
  const expiry = moderationCase.expiresAt
    ? ` | Expires <t:${Math.floor(new Date(normaliseTimestamp(moderationCase.expiresAt)).getTime() / 1000)}:R>`
    : '';
  return (
    `**Case #${moderationCase.caseNumber} | ${toTitleCase(moderationCase.caseType)}**\n` +
    `${toTitleCase(moderationCase.status)} | <t:${timestamp}:R>${expiry}\n` +
    `${truncate(moderationCase.reason, 280)}\n` +
    `Moderator: <@${moderationCase.moderatorId}> | View: \`/case number:${moderationCase.caseNumber}\``
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
