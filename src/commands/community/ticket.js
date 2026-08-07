import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { registerModalHandler } from '../../services/interactionRouterService.js';
import { isLockdownActive } from '../../database/repositories/lockdownRepository.js';
import { getOpenTicketByCreator } from '../../database/repositories/ticketRepository.js';
import { createLinkedTicket } from '../../services/ticketService.js';

const OPEN_MODAL_PREFIX = 'ticket:open:';
const OPEN_BUTTON_ID = 'ticket-public:open';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Open a private support ticket.')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('open')
      .setDescription('Open a private ticket with the moderation team.')
  )
  .setDMPermission(false);

export async function execute(interaction) {
  return showOpenModal(interaction);
}

export async function handleButton(interaction) {
  if (interaction.customId !== OPEN_BUTTON_ID) return false;
  await showOpenModal(interaction);
  return true;
}

async function showOpenModal(interaction) {
  if (isLockdownActive(interaction.guildId)) {
    return replyEphemeral(
      interaction,
      'New tickets are temporarily unavailable during emergency lockdown.'
    );
  }

  const existing = getOpenTicketByCreator(
    interaction.guildId,
    interaction.user.id
  );

  if (existing) {
    return replyEphemeral(
      interaction,
      `You already have an open ticket: <#${existing.user_channel_id}>`
    );
  }

  const modal = new ModalBuilder()
    .setCustomId(`${OPEN_MODAL_PREFIX}${interaction.guildId}`)
    .setTitle('Open a Private Ticket');

  const subject = new TextInputBuilder()
    .setCustomId('subject')
    .setLabel('Subject')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const details = new TextInputBuilder()
    .setCustomId('details')
    .setLabel('How can the moderation team help?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(subject),
    new ActionRowBuilder().addComponents(details)
  );

  return interaction.showModal(modal);
}

async function handleOpenModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (isLockdownActive(interaction.guildId)) {
    await interaction.editReply(
      'New tickets are temporarily unavailable during emergency lockdown.'
    );
    return;
  }

  const existing = getOpenTicketByCreator(
    interaction.guildId,
    interaction.user.id
  );

  if (existing) {
    await interaction.editReply(
      `You already have an open ticket: <#${existing.user_channel_id}>`
    );
    return;
  }

  try {
    const result = await createLinkedTicket({
      guild: interaction.guild,
      creator: interaction.user,
      subject: interaction.fields.getTextInputValue('subject'),
      details: interaction.fields.getTextInputValue('details')
    });

    await interaction.editReply(
      `Your private ticket has been created: <#${result.userChannel.id}>`
    );
  } catch (error) {
    console.error('Failed to create linked ticket:', error);
    await interaction.editReply(
      'Pank could not create the ticket channels. Please tell an administrator to check Pank\'s Manage Channels permission and ticket configuration.'
    );
  }
}

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

export function buildOpenTicketButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(OPEN_BUTTON_ID)
      .setLabel('Open a Ticket')
      .setStyle(ButtonStyle.Primary)
  );
}

registerModalHandler(OPEN_MODAL_PREFIX, handleOpenModal);
