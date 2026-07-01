import { Events } from 'discord.js';
import { cacheMessage } from '../utils/messageCache.js';

export const name = Events.MessageCreate;
export const once = false;

export function execute(message) {
  cacheMessage(message);
}
