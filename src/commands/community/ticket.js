import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { registerModalHandler } from '../../services/interactionRouterService.js';
import { isLockdownActive } from '../../database/repositories/lockdownRepository.js';
import {
  addTicketAudit,
  claimTicket,
  countOpenTickets,
  getOpenTicketByCreator,
  getTicketByChannel,
  getTicketByNumber,
  linkTicketToCase,
  listCasesForTicket,
  listTicketAudit,
  permanentlyDeleteTicket,
  renameTicket,
  resetTicketsForGuild,
  unlinkTicketFromCase
} from '../../database/repositories/ticketRepository.js';
import { buildInternalTicketTranscript } from '../../services/ticketTranscriptService.js';
import { createLinkedTicket, setTicketClosed, setTicketReopened } from '../../services/ticketService.js';
import { createNote, getCase } from '../../services/moderationService.js';

const OPEN_MODAL = 'ticket:open';
const BUTTON_PREFIX = 'ticket-admin';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Open or manage a private support ticket.')
  .addSubcommand((s) => s.setName('open').setDescription('Open a private ticket.'))
  .addSubcommand((s) => s.setName('close').setDescription('Close the current ticket.').addStringOption((o) => o.setName('reason').setDescription('Closing reason').setMaxLength(500)))
  .addSubcommand((s) => s.setName('reopen').setDescription('Reopen the current ticket.').addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(500)))
  .addSubcommand((s) => s.setName('claim').setDescription('Claim the current ticket.'))
  .addSubcommand((s) => s.setName('rename').setDescription('Rename both ticket channels.').addStringOption((o) => o.setName('name').setDescription('New short name').setRequired(true).setMaxLength(50)))
  .addSubcommand((s) => s.setName('transcript').setDescription('Download the internal ticket transcript.'))
  .addSubcommand((s) => s.setName('audit').setDescription('View the internal ticket audit.'))
  .addSubcommand((s) => s.setName('delete').setDescription('Permanently delete one ticket and its linked channels.').addIntegerOption((o) => o.setName('number').setDescription('Ticket number').setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName('reset').setDescription('Delete all tickets and reset numbering to 1.'))
  .addSubcommand((s) => s.setName('link-case').setDescription('Link the current ticket to an existing moderation case.').addIntegerOption((o) => o.setName('case').setDescription('Case number').setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName('unlink-case').setDescription('Remove a case link from the current ticket.').addIntegerOption((o) => o.setName('case').setDescription('Case number').setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName('create-case').setDescription('Create a moderator note case linked to this ticket.').addStringOption((o) => o.setName('reason').setDescription('Reason for the case').setRequired(true).setMaxLength(1000)))
  .setDMPermission(false);

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'open') return open(interaction);

  const isStaff = interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages) || interaction.memberPermissions.has(PermissionFlagsBits.Administrator);

  if (sub === 'delete') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) return deny(interaction, 'Administrator permission is required to delete tickets.');
    const number = interaction.options.getInteger('number', true);
    const ticket = getTicketByNumber(interaction.guildId, number);
    if (!ticket) return deny(interaction, `Ticket #${number} could not be found.`);
    return interaction.reply({ content: `**DANGER:** This permanently deletes Ticket #${number}, its messages, audit history, case links, and both linked channels.`, components: [confirmationRow(`delete:${interaction.user.id}:${number}`, 'Delete Ticket')], flags: MessageFlags.Ephemeral });
  }

  if (sub === 'reset') {
    if (interaction.user.id !== interaction.guild.ownerId) return deny(interaction, 'Only the server owner can reset all tickets.');
    const active = countOpenTickets(interaction.guildId);
    if (active > 0) return deny(interaction, `Close all active tickets before resetting. ${active} active ticket${active === 1 ? '' : 's'} remain.`);
    return interaction.reply({ content: '**DANGER:** This permanently deletes every ticket, transcript record, message, audit entry, and case link for this server. Linked ticket channels will also be deleted. The next ticket will be #1.', components: [confirmationRow(`reset:${interaction.user.id}`, 'Reset All Tickets')], flags: MessageFlags.Ephemeral });
  }

  const ticket = getTicketByChannel(interaction.guildId, interaction.channelId);
  if (!ticket) return deny(interaction, 'This command must be used inside a Pank ticket channel.');

  if (sub === 'close') {
    if (!isStaff && interaction.user.id !== ticket.creator_id) return deny(interaction, 'You cannot close this ticket.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await setTicketClosed({ interaction, ticket, reason: interaction.options.getString('reason') });
    return interaction.editReply('Ticket closed and moved to Closed Tickets.');
  }

  if (!isStaff) return deny(interaction, 'This ticket action is for moderators only.');

  if (sub === 'reopen') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await setTicketReopened({ interaction, ticket, reason: interaction.options.getString('reason') });
    return interaction.editReply('Ticket reopened.');
  }
  if (sub === 'claim') {
    claimTicket({ ticketId: ticket.id, guildId: ticket.guild_id, moderatorId: interaction.user.id });
    return interaction.reply({ content: 'Ticket claimed. The user only sees that a moderator has claimed it.', flags: MessageFlags.Ephemeral });
  }
  if (sub === 'rename') {
    const safe = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `ticket-${ticket.ticket_number}`;
    const user = await interaction.guild.channels.fetch(ticket.user_channel_id).catch(() => null);
    const staff = await interaction.guild.channels.fetch(ticket.staff_channel_id).catch(() => null);
    await user?.setName(safe);
    await staff?.setName(`staff-${safe}`);
    renameTicket({ ticketId: ticket.id, guildId: ticket.guild_id, actorId: interaction.user.id, name: safe });
    return interaction.reply({ content: `Renamed to ${safe}.`, flags: MessageFlags.Ephemeral });
  }
  if (sub === 'transcript') return interaction.reply({ files: [buildInternalTicketTranscript(ticket)], flags: MessageFlags.Ephemeral });
  if (sub === 'audit') {
    const rows = listTicketAudit(ticket.guild_id, ticket.id).slice(-20);
    const cases = listCasesForTicket(ticket.guild_id, ticket.id);
    const description = rows.map((r) => `<t:${Math.floor(new Date(`${r.created_at}Z`).getTime() / 1000)}:R> - **${r.action}** by <@${r.actor_id}>${r.details ? ` - ${r.details}` : ''}`).join('\n') || 'No audit entries.';
    const embed = new EmbedBuilder().setTitle(`Ticket #${ticket.ticket_number} Audit`).setDescription(description.slice(0, 4000));
    if (cases.length) embed.addFields({ name: 'Linked cases', value: cases.map((item) => `Case #${item.case_number}`).join(', ') });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
  if (sub === 'link-case') {
    const caseNumber = interaction.options.getInteger('case', true);
    const moderationCase = getCase({ guildId: interaction.guildId, caseNumber });
    if (!moderationCase) return deny(interaction, `Case #${caseNumber} could not be found.`);
    linkTicketToCase({ guildId: interaction.guildId, ticketId: ticket.id, moderationCaseId: moderationCase.id, linkedBy: interaction.user.id });
    return interaction.reply({ content: `Linked Ticket #${ticket.ticket_number} to Case #${caseNumber}.`, flags: MessageFlags.Ephemeral });
  }
  if (sub === 'unlink-case') {
    const caseNumber = interaction.options.getInteger('case', true);
    const moderationCase = getCase({ guildId: interaction.guildId, caseNumber });
    if (!moderationCase) return deny(interaction, `Case #${caseNumber} could not be found.`);
    const removed = unlinkTicketFromCase({ guildId: interaction.guildId, ticketId: ticket.id, moderationCaseId: moderationCase.id, actorId: interaction.user.id });
    return interaction.reply({ content: removed ? `Unlinked Case #${caseNumber} from Ticket #${ticket.ticket_number}.` : `Case #${caseNumber} was not linked to this ticket.`, flags: MessageFlags.Ephemeral });
  }
  if (sub === 'create-case') {
    const reason = interaction.options.getString('reason', true);
    const moderationCase = createNote({ guildId: interaction.guildId, userId: ticket.creator_id, moderatorId: interaction.user.id, reason: `[Ticket #${ticket.ticket_number}] ${reason}` });
    linkTicketToCase({ guildId: interaction.guildId, ticketId: ticket.id, moderationCaseId: moderationCase.id, linkedBy: interaction.user.id });
    return interaction.reply({ content: `Created and linked Note Case #${moderationCase.caseNumber}.`, flags: MessageFlags.Ephemeral });
  }
}

export async function handleButton(interaction) {
  if (!interaction.customId.startsWith(`${BUTTON_PREFIX}:`)) return false;
  const [, action, requesterId, value] = interaction.customId.split(':');
  if (interaction.user.id !== requesterId) {
    await deny(interaction, 'Only the person who opened this confirmation can use it.');
    return true;
  }
  await interaction.deferUpdate();
  if (action === 'cancel') {
    await interaction.editReply({ content: 'Cancelled.', components: [] });
    return true;
  }
  if (action === 'delete') {
    const ticket = getTicketByNumber(interaction.guildId, Number(value));
    if (!ticket) { await interaction.editReply({ content: `Ticket #${value} no longer exists.`, components: [] }); return true; }
    await deleteTicketChannels(interaction.guild, ticket);
    permanentlyDeleteTicket({ guildId: interaction.guildId, ticketNumber: Number(value) });
    await interaction.editReply({ content: `Ticket #${value} was permanently deleted.`, components: [] });
    return true;
  }
  if (action === 'reset') {
    if (countOpenTickets(interaction.guildId) > 0) { await interaction.editReply({ content: 'Reset cancelled because an active ticket now exists.', components: [] }); return true; }
    const tickets = resetTicketsForGuild(interaction.guildId);
    for (const ticket of tickets) await deleteTicketChannels(interaction.guild, ticket);
    await interaction.editReply({ content: `Deleted ${tickets.length} ticket${tickets.length === 1 ? '' : 's'}. The next ticket will be #1.`, components: [] });
    return true;
  }
  return false;
}

async function open(interaction) {
  if (isLockdownActive(interaction.guildId)) return deny(interaction, 'New tickets are temporarily unavailable during emergency lockdown.');
  const existing = getOpenTicketByCreator(interaction.guildId, interaction.user.id);
  if (existing) return deny(interaction, `You already have an open ticket: <#${existing.user_channel_id}>`);
  const modal = new ModalBuilder().setCustomId(`${OPEN_MODAL}:${interaction.guildId}`).setTitle('Open a Private Ticket');
  const subject = new TextInputBuilder().setCustomId('subject').setLabel('Subject').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
  const details = new TextInputBuilder().setCustomId('details').setLabel('How can the moderation team help?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000);
  modal.addComponents(new ActionRowBuilder().addComponents(subject), new ActionRowBuilder().addComponents(details));
  return interaction.showModal(modal);
}

export async function handleModal(interaction) {
  if (!interaction.customId.startsWith(`${OPEN_MODAL}:`)) return false;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const existing = getOpenTicketByCreator(interaction.guildId, interaction.user.id);
  if (existing) return interaction.editReply(`You already have an open ticket: <#${existing.user_channel_id}>`);
  const result = await createLinkedTicket({ guild: interaction.guild, creator: interaction.user, subject: interaction.fields.getTextInputValue('subject'), details: interaction.fields.getTextInputValue('details') });
  return interaction.editReply(`Your private ticket has been created: <#${result.userChannel.id}>`);
}

function confirmationRow(confirmSuffix, label) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}:${confirmSuffix}`).setLabel(label).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}:cancel:${confirmSuffix.split(':')[1]}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );
}

async function deleteTicketChannels(guild, ticket) {
  const channels = [ticket.user_channel_id, ticket.staff_channel_id];
  for (const channelId of channels) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel) await channel.delete(`Ticket #${ticket.ticket_number} permanently deleted`).catch(() => null);
  }
}

function deny(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

registerModalHandler(`${OPEN_MODAL}:`, handleModal);
