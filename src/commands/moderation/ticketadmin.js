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
import {
  claimTicket,
  countOpenTickets,
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
import {
  setTicketClosed,
  setTicketReopened
} from '../../services/ticketService.js';
import {
  DEFAULT_TICKET_PANEL_BODY,
  DEFAULT_TICKET_PANEL_TITLE,
  deleteTicketPanel,
  ensureTicketInfrastructure,
  ensureTicketPanel
} from '../../services/ticketInfrastructureService.js';
import { createNote, getCase } from '../../services/moderationService.js';
import { GUILD_CONFIG_KEYS, getConfigValue, setConfigValue } from '../../services/guildConfigService.js';
import { registerModalHandler } from '../../services/interactionRouterService.js';

const BUTTON_PREFIX = 'ticket-admin';
const PANEL_MODAL_PREFIX = 'ticket-admin:panel-edit:';

export const data = new SlashCommandBuilder()
  .setName('ticketadmin')
  .setDescription('Manage Pank support tickets.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('setup').setDescription('Create or repair all ticket categories, logs and the public ticket panel.'))
  .addSubcommand((s) => s.setName('panel').setDescription('Create or edit the public Open a Ticket panel.'))
  .addSubcommand((s) => s.setName('panel-delete').setDescription('Delete the current public ticket panel message.'))
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
  .addSubcommand((s) => s.setName('create-case').setDescription('Create a moderator note case linked to this ticket.').addStringOption((o) => o.setName('reason').setDescription('Reason for the case').setRequired(true).setMaxLength(1000)));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'setup') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const infrastructure = await ensureTicketInfrastructure(
      interaction.guild,
      interaction.user.id
    );
    const panel = await ensureTicketPanel(
      interaction.guild,
      interaction.user.id
    );
    await interaction.editReply(
      `Ticket system is ready.\nPublic panel: <#${panel.channel.id}>\nActive tickets: <#${infrastructure.tickets.id}>\nStaff workspaces: <#${infrastructure.staff.id}>\nClosed tickets: <#${infrastructure.closed.id}>\nLogs: <#${infrastructure.log.id}>`
    );
    return;
  }

  if (sub === 'panel') {
    const title = getConfigValue(
      interaction.guildId,
      GUILD_CONFIG_KEYS.TICKET_PANEL_TITLE,
      DEFAULT_TICKET_PANEL_TITLE
    );
    const body = getConfigValue(
      interaction.guildId,
      GUILD_CONFIG_KEYS.TICKET_PANEL_BODY,
      DEFAULT_TICKET_PANEL_BODY
    );

    const modal = new ModalBuilder()
      .setCustomId(`${PANEL_MODAL_PREFIX}${interaction.guildId}`)
      .setTitle('Edit Ticket Panel');

    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Panel title')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setValue(title.slice(0, 100));

    const bodyInput = new TextInputBuilder()
      .setCustomId('body')
      .setLabel('Panel message')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000)
      .setValue(body.slice(0, 2000));

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(bodyInput)
    );

    await interaction.showModal(modal);
    return;
  }

  if (sub === 'panel-delete') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const deleted = await deleteTicketPanel(
      interaction.guild,
      interaction.user.id
    );
    await interaction.editReply(
      deleted
        ? 'The public ticket panel message was deleted. Run `/ticketadmin panel` whenever you want to create it again.'
        : 'There is no saved public ticket panel message to delete. Run `/ticketadmin panel` to create one.'
    );
    return;
  }

  if (sub === 'delete') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return deny(interaction, 'Administrator permission is required to delete tickets.');
    }
    const number = interaction.options.getInteger('number', true);
    const ticket = getTicketByNumber(interaction.guildId, number);
    if (!ticket) return deny(interaction, `Ticket #${number} could not be found.`);
    return interaction.reply({
      content: `**DANGER:** This permanently deletes Ticket #${number}, its messages, audit history, case links, and both linked channels.`,
      components: [confirmationRow(`delete:${interaction.user.id}:${number}`, 'Delete Ticket')],
      flags: MessageFlags.Ephemeral
    });
  }

  if (sub === 'reset') {
    if (interaction.user.id !== interaction.guild.ownerId) {
      return deny(interaction, 'Only the server owner can reset all tickets.');
    }
    const active = countOpenTickets(interaction.guildId);
    if (active > 0) {
      return deny(interaction, `Close all active tickets before resetting. ${active} active ticket${active === 1 ? '' : 's'} remain.`);
    }
    return interaction.reply({
      content: '**DANGER:** This permanently deletes every ticket, transcript record, message, audit entry, and case link for this server. Linked ticket channels will also be deleted. The next ticket will be #1.',
      components: [confirmationRow(`reset:${interaction.user.id}`, 'Reset All Tickets')],
      flags: MessageFlags.Ephemeral
    });
  }

  const ticket = getTicketByChannel(interaction.guildId, interaction.channelId);
  if (!ticket) return deny(interaction, 'This command must be used inside a Pank ticket channel.');

  if (sub === 'close') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await setTicketClosed({ interaction, ticket, reason: interaction.options.getString('reason') });
    await interaction.editReply('Ticket closed and moved to Closed Tickets.');
    return;
  }

  if (sub === 'reopen') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await setTicketReopened({ interaction, ticket, reason: interaction.options.getString('reason') });
    await interaction.editReply('Ticket reopened.');
    return;
  }

  if (sub === 'claim') {
    claimTicket({ ticketId: ticket.id, guildId: ticket.guild_id, moderatorId: interaction.user.id });
    await interaction.reply({ content: 'Ticket claimed. The user only sees that a moderator has claimed it.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'rename') {
    const safe = interaction.options.getString('name', true).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `ticket-${ticket.ticket_number}`;
    const user = await interaction.guild.channels.fetch(ticket.user_channel_id).catch(() => null);
    const staff = await interaction.guild.channels.fetch(ticket.staff_channel_id).catch(() => null);
    await user?.setName(safe);
    await staff?.setName(`staff-${safe}`);
    renameTicket({ ticketId: ticket.id, guildId: ticket.guild_id, actorId: interaction.user.id, name: safe });
    await interaction.reply({ content: `Renamed to ${safe}.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'transcript') {
    await interaction.reply({ files: [buildInternalTicketTranscript(ticket)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'audit') {
    const rows = listTicketAudit(ticket.guild_id, ticket.id).slice(-20);
    const cases = listCasesForTicket(ticket.guild_id, ticket.id);
    const description = rows.map((r) => `<t:${Math.floor(new Date(`${r.created_at}Z`).getTime() / 1000)}:R> - **${r.action}** by <@${r.actor_id}>${r.details ? ` - ${r.details}` : ''}`).join('\n') || 'No audit entries.';
    const embed = new EmbedBuilder().setTitle(`Ticket #${ticket.ticket_number} Audit`).setDescription(description.slice(0, 4000));
    if (cases.length) embed.addFields({ name: 'Linked cases', value: cases.map((item) => `Case #${item.case_number}`).join(', ') });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'link-case' || sub === 'unlink-case') {
    const caseNumber = interaction.options.getInteger('case', true);
    const moderationCase = getCase({ guildId: interaction.guildId, caseNumber });
    if (!moderationCase) return deny(interaction, `Case #${caseNumber} could not be found.`);
    if (sub === 'link-case') {
      linkTicketToCase({ guildId: interaction.guildId, ticketId: ticket.id, moderationCaseId: moderationCase.id, linkedBy: interaction.user.id });
      await interaction.reply({ content: `Linked Ticket #${ticket.ticket_number} to Case #${caseNumber}.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const removed = unlinkTicketFromCase({ guildId: interaction.guildId, ticketId: ticket.id, moderationCaseId: moderationCase.id, actorId: interaction.user.id });
    await interaction.reply({ content: removed ? `Unlinked Case #${caseNumber} from Ticket #${ticket.ticket_number}.` : `Case #${caseNumber} was not linked to this ticket.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'create-case') {
    const reason = interaction.options.getString('reason', true);
    const moderationCase = createNote({ guildId: interaction.guildId, userId: ticket.creator_id, moderatorId: interaction.user.id, reason: `[Ticket #${ticket.ticket_number}] ${reason}` });
    linkTicketToCase({ guildId: interaction.guildId, ticketId: ticket.id, moderationCaseId: moderationCase.id, linkedBy: interaction.user.id });
    await interaction.reply({ content: `Created and linked Note Case #${moderationCase.caseNumber}.`, flags: MessageFlags.Ephemeral });
  }
}

export async function handleButton(interaction) {
  if (interaction.customId.startsWith('ticket-user:close:')) {
    const [, , ticketId, creatorId] = interaction.customId.split(':');
    if (interaction.user.id !== creatorId) {
      await deny(interaction, 'Only the person who opened this ticket can use this button.');
      return true;
    }
    const ticket = getTicketByChannel(interaction.guildId, interaction.channelId);
    if (!ticket || String(ticket.id) !== ticketId || ticket.status !== 'open') {
      await deny(interaction, 'This ticket is no longer open.');
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await setTicketClosed({ interaction, ticket, reason: 'Closed by the ticket creator.' });
    await interaction.editReply('Your ticket has been closed.');
    return true;
  }

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
    if (!ticket) {
      await interaction.editReply({ content: `Ticket #${value} no longer exists.`, components: [] });
      return true;
    }
    await deleteTicketChannels(interaction.guild, ticket);
    permanentlyDeleteTicket({ guildId: interaction.guildId, ticketNumber: Number(value) });
    await interaction.editReply({ content: `Ticket #${value} was permanently deleted.`, components: [] });
    return true;
  }
  if (action === 'reset') {
    if (countOpenTickets(interaction.guildId) > 0) {
      await interaction.editReply({ content: 'Reset cancelled because an active ticket now exists.', components: [] });
      return true;
    }
    const tickets = resetTicketsForGuild(interaction.guildId);
    for (const ticket of tickets) await deleteTicketChannels(interaction.guild, ticket);
    await interaction.editReply({ content: `Deleted ${tickets.length} ticket${tickets.length === 1 ? '' : 's'}. The next ticket will be #1.`, components: [] });
    return true;
  }
  return false;
}


registerModalHandler(PANEL_MODAL_PREFIX, async (interaction) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const title = interaction.fields.getTextInputValue('title').trim();
  const body = interaction.fields.getTextInputValue('body').trim();

  if (!title || !body) {
    await interaction.editReply('The panel title and message cannot be empty.');
    return;
  }

  setConfigValue({
    guildId: interaction.guildId,
    key: GUILD_CONFIG_KEYS.TICKET_PANEL_TITLE,
    value: title,
    updatedBy: interaction.user.id
  });
  setConfigValue({
    guildId: interaction.guildId,
    key: GUILD_CONFIG_KEYS.TICKET_PANEL_BODY,
    value: body,
    updatedBy: interaction.user.id
  });

  const panel = await ensureTicketPanel(
    interaction.guild,
    interaction.user.id,
    { refresh: true }
  );

  await interaction.editReply(
    `The public ticket panel has been updated in <#${panel.channel.id}> and pinned.`
  );
});

function confirmationRow(confirmSuffix, label) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}:${confirmSuffix}`).setLabel(label).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}:cancel:${confirmSuffix.split(':')[1]}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );
}

async function deleteTicketChannels(guild, ticket) {
  for (const channelId of [ticket.user_channel_id, ticket.staff_channel_id]) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel) await channel.delete(`Ticket #${ticket.ticket_number} permanently deleted`).catch(() => null);
  }
}

function deny(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
