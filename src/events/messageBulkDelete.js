import { Events } from 'discord.js';
import { handleBulkPurge } from '../modules/purgeLogger/purgeLogger.js';

export const name = Events.MessageBulkDelete;
export const once = false;

export async function execute(messages, channel, client) {
  await handleBulkPurge(messages, channel, client);
}
