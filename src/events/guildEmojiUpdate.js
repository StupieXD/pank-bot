import { Events } from 'discord.js';
import { handleEmojiUpdate } from '../modules/serverLogger/emojiLogger.js';

export const name = Events.GuildEmojiUpdate;
export const once = false;

export async function execute(oldEmoji, newEmoji) {
  await handleEmojiUpdate(oldEmoji, newEmoji);
}
