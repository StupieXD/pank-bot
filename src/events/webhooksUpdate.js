import { Events } from 'discord.js';
import { handleWebhooksUpdate } from '../modules/serverLogger/webhookLogger.js';

export const name = Events.WebhooksUpdate;
export const once = false;

export async function execute(channel) {
  await handleWebhooksUpdate(channel);
}
