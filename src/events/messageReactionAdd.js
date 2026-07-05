import { Events } from 'discord.js';
import { handleReactionAdd } from '../modules/messageLogger/reactionLogger.js';

export const name = Events.MessageReactionAdd;
export const once = false;

export async function execute(reaction, user) {
  await handleReactionAdd(reaction, user);
}
