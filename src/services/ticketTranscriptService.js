import { AttachmentBuilder } from 'discord.js';
import { listCasesForTicket, listTicketAudit, listTicketMessages } from '../database/repositories/ticketRepository.js';

export function buildInternalTicketTranscript(ticket) {
  const lines = [
    `TICKET #${ticket.ticket_number}`,
    '====================',
    `Creator ID: ${ticket.creator_id}`,
    `Subject: ${ticket.subject}`,
    `Status: ${ticket.status}`,
    `Linked cases: ${listCasesForTicket(ticket.guild_id, ticket.id).map((item) => `#${item.case_number}`).join(', ') || 'None'}`,
    '',
    'MESSAGES',
    '========'
  ];
  for (const row of listTicketMessages(ticket.guild_id, ticket.id)) {
    lines.push(`[${row.created_at}] ${row.author_type.toUpperCase()} ${row.author_id}: ${row.content || '[attachment only]'}`);
    for (const url of JSON.parse(row.attachments_json || '[]')) lines.push(`Attachment: ${url}`);
  }
  lines.push('', 'AUDIT', '=====');
  for (const row of listTicketAudit(ticket.guild_id, ticket.id)) lines.push(`[${row.created_at}] ${row.action} by ${row.actor_id}${row.details ? ` - ${row.details}` : ''}`);
  return new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8')).setName(`ticket-${String(ticket.ticket_number).padStart(4,'0')}-internal.txt`);
}
