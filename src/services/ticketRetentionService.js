import {
  addTicketAudit,
  listClosedTicketsPendingArchive,
  markTicketChannelsArchived,
  setTicketTranscriptArchive,
  setTicketTranscriptLogMessage
} from '../database/repositories/ticketRepository.js';
import { GUILD_CONFIG_KEYS, getConfigValue } from './guildConfigService.js';
import {
  buildStoredTranscriptAttachment,
  ensurePermanentTicketTranscript
} from './ticketTranscriptService.js';
import { logError, logInfo, logWarn } from '../core/logger.js';

export const DEFAULT_TICKET_RETENTION_DAYS = 30;
export const TICKET_RETENTION_OPTIONS = Object.freeze([0, 7, 14, 30, 60, 90, 365]);

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
let timer = null;
let running = false;

export function getTicketRetentionDays(guildId) {
  const raw = getConfigValue(
    guildId,
    GUILD_CONFIG_KEYS.TICKET_RETENTION_DAYS,
    String(DEFAULT_TICKET_RETENTION_DAYS)
  );
  const days = Number(raw);
  return TICKET_RETENTION_OPTIONS.includes(days) ? days : DEFAULT_TICKET_RETENTION_DAYS;
}

export function initialiseTicketRetentionService(client) {
  if (timer) clearInterval(timer);
  void runTicketRetentionCleanup(client);
  timer = setInterval(() => void runTicketRetentionCleanup(client), CHECK_INTERVAL_MS);
  timer.unref?.();
  logInfo('Ticket retention service initialised.');
}

export async function runTicketRetentionCleanup(client, { guildId = null } = {}) {
  if (running) return { archived: 0, skipped: 0, transcripts: 0, alreadyRunning: true };
  running = true;

  let archived = 0;
  let skipped = 0;
  let transcripts = 0;

  try {
    const now = Date.now();
    const tickets = listClosedTicketsPendingArchive()
      .filter((ticket) => !guildId || ticket.guild_id === guildId);

    for (const ticket of tickets) {
      const retentionDays = getTicketRetentionDays(ticket.guild_id);
      if (retentionDays === 0) {
        skipped += 1;
        continue;
      }

      const closedAt = parseSqliteTimestamp(ticket.closed_at);
      if (!closedAt) {
        skipped += 1;
        continue;
      }

      const expiresAt = closedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000;
      if (expiresAt > now) continue;

      const guild = client.guilds.cache.get(ticket.guild_id)
        ?? await client.guilds.fetch(ticket.guild_id).catch(() => null);
      if (!guild) {
        skipped += 1;
        continue;
      }

      try {
        // The permanent transcript is created before either Discord channel is removed.
        // If local transcript creation fails, the ticket is left intact for a later retry.
        const transcript = ensurePermanentTicketTranscript(ticket);
        let currentTicket = ticket;

        if (!ticket.transcript_path || transcript.created) {
          currentTicket = setTicketTranscriptArchive({
            guildId: ticket.guild_id,
            ticketId: ticket.id,
            actorId: client.user.id,
            transcriptPath: transcript.relativePath
          });
          transcripts += 1;
        }

        if (!currentTicket.transcript_log_message_id) {
          const logMessageId = await postTranscriptToTicketLog(guild, currentTicket, transcript.relativePath);
          if (logMessageId) {
            currentTicket = setTicketTranscriptLogMessage({
              guildId: ticket.guild_id,
              ticketId: ticket.id,
              logMessageId
            });
          }
        }

        await deleteChannelIfPresent(guild, ticket.user_channel_id, ticket.ticket_number);
        await deleteChannelIfPresent(guild, ticket.staff_channel_id, ticket.ticket_number);

        markTicketChannelsArchived({
          guildId: ticket.guild_id,
          ticketId: ticket.id,
          actorId: client.user.id
        });
        archived += 1;
      } catch (error) {
        skipped += 1;
        logError(`Failed to archive expired Ticket #${ticket.ticket_number} in guild ${ticket.guild_id}.`, error);
      }
    }
  } finally {
    running = false;
  }

  return { archived, skipped, transcripts, alreadyRunning: false };
}

async function postTranscriptToTicketLog(guild, ticket, transcriptPath) {
  const logChannelId = getConfigValue(
    guild.id,
    GUILD_CONFIG_KEYS.TICKET_LOG_CHANNEL_ID
  );
  if (!logChannelId) {
    logWarn(`Ticket #${ticket.ticket_number} transcript was saved locally, but no ticket log channel is configured.`);
    return null;
  }

  const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
  if (!logChannel?.isTextBased()) {
    logWarn(`Ticket #${ticket.ticket_number} transcript was saved locally, but the configured ticket log channel is unavailable.`);
    return null;
  }

  const attachment = buildStoredTranscriptAttachment(transcriptPath, ticket);
  if (!attachment) {
    throw new Error(`Stored transcript for Ticket #${ticket.ticket_number} could not be read.`);
  }

  const message = await logChannel.send({
    content: [
      `**Permanent archive for Ticket #${ticket.ticket_number}**`,
      `Subject: ${ticket.subject || 'No subject'}`,
      `Creator: <@${ticket.creator_id}> (${ticket.creator_id})`,
      `Closed: ${ticket.closed_at || 'Unknown'}`,
      ticket.close_reason ? `Close reason: ${ticket.close_reason}` : null,
      'The Discord ticket channels are being removed under the configured retention policy.'
    ].filter(Boolean).join('\n'),
    files: [attachment]
  }).catch((error) => {
    logWarn(`Ticket #${ticket.ticket_number} transcript was saved locally but could not be uploaded to #ticket-logs.`);
    logError('Ticket transcript upload error.', error);
    return null;
  });

  if (message) {
    addTicketAudit({
      guildId: ticket.guild_id,
      ticketId: ticket.id,
      actorId: guild.client.user.id,
      action: 'transcript_logged',
      details: `Discord message ${message.id}`
    });
  }

  return message?.id ?? null;
}

async function deleteChannelIfPresent(guild, channelId, ticketNumber) {
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  await channel.delete(`Ticket #${ticketNumber} expired under the configured retention policy.`);
}

function parseSqliteTimestamp(value) {
  if (!value) return null;
  const normalized = /Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
