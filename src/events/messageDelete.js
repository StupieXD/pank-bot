import { Events } from 'discord.js';
import { handleMessageDelete } from '../handlers/logging/handleMessageDelete.js';

export const name = Events.MessageDelete;
export const once = false;

export function execute(message) {
  handleMessageDelete(message);
}
