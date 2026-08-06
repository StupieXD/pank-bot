import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';
import { getCase } from '../../services/moderationService.js';
import {
  getTicketByNumber,
  linkTicketToCase,
  unlinkTicketFromCase
} from '../../database/repositories/ticketRepository.js';

export const data = new SlashCommandBuilder()
  .setName('caseticket')
  .setDescription('Link or unlink a moderation case and a ticket.')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('link')
      .setDescription('Link a moderation case to a ticket.')
      .addIntegerOption((option) =>
        option.setName('case').setDescription('Case number').setRequired(true).setMinValue(1)
      )
      .addIntegerOption((option) =>
        option.setName('ticket').setDescription('Ticket number').setRequired(true).setMinValue(1)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('unlink')
      .setDescription('Remove a link between a case and ticket.')
      .addIntegerOption((option) =>
        option.setName('case').setDescription('Case number').setRequired(true).setMinValue(1)
      )
      .addIntegerOption((option) =>
        option.setName('ticket').setDescription('Ticket number').setRequired(true).setMinValue(1)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setDMPermission(false);

export async function execute(interaction) {
  const caseNumber = interaction.options.getInteger('case', true);
  const ticketNumber = interaction.options.getInteger('ticket', true);
  const moderationCase = getCase({ guildId: interaction.guildId, caseNumber });
  const ticket = getTicketByNumber(interaction.guildId, ticketNumber);

  if (!moderationCase) {
    return interaction.reply({ content: `Case #${caseNumber} could not be found.`, flags: MessageFlags.Ephemeral });
  }
  if (!ticket) {
    return interaction.reply({ content: `Ticket #${ticketNumber} could not be found.`, flags: MessageFlags.Ephemeral });
  }

  if (interaction.options.getSubcommand() === 'link') {
    linkTicketToCase({
      guildId: interaction.guildId,
      ticketId: ticket.id,
      moderationCaseId: moderationCase.id,
      linkedBy: interaction.user.id
    });
    return interaction.reply({
      content: `Linked Case #${caseNumber} to Ticket #${ticketNumber}.`,
      flags: MessageFlags.Ephemeral
    });
  }

  const removed = unlinkTicketFromCase({
    guildId: interaction.guildId,
    ticketId: ticket.id,
    moderationCaseId: moderationCase.id,
    actorId: interaction.user.id
  });

  return interaction.reply({
    content: removed
      ? `Unlinked Case #${caseNumber} from Ticket #${ticketNumber}.`
      : 'That case and ticket were not linked.',
    flags: MessageFlags.Ephemeral
  });
}
