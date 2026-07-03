import { Events } from 'discord.js';
import { handleMessageDelete } from '../modules/messageLogger/messageDeleteLogger.js';

export const name = Events.MessageDelete;
export const once = false;

export async function execute(message) {
  await handleMessageDelete(message);
}
