import { listClosedTicketsPendingArchive, markTicketChannelsArchived } from '../database/repositories/ticketRepository.js';
import { GUILD_CONFIG_KEYS, getConfigValue } from './guildConfigService.js';
import { logError, logInfo } from '../core/logger.js';

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
  if (running) return { archived: 0, skipped: 0, alreadyRunning: true };
  running = true;

  let archived = 0;
  let skipped = 0;

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

  return { archived, skipped, alreadyRunning: false };
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
