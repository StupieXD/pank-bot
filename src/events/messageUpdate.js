import { Events } from 'discord.js';
import { handleMessageUpdate } from '../modules/messageLogger/messageUpdateLogger.js';

export const name = Events.MessageUpdate;
export const once = false;

export async function execute(oldMessage, newMessage) {
  await handleMessageUpdate(oldMessage, newMessage);
}
