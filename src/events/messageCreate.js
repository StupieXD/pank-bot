import { Events } from 'discord.js';
import { cacheMessage } from '../utils/messageCache.js';
import { handleTicketMessage } from '../services/ticketService.js';

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message) {
  cacheMessage(message);

  try {
    await handleTicketMessage(message);
  } catch (error) {
    console.error('Failed to process ticket message relay:', error);
  }
}
