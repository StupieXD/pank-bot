import { Events } from 'discord.js';
import { handleReactionRemove } from '../modules/messageLogger/reactionLogger.js';

export const name = Events.MessageReactionRemove;
export const once = false;

export async function execute(reaction, user) {
  await handleReactionRemove(reaction, user);
}
