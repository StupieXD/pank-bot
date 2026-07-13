import { Events } from 'discord.js';
import { handleEmojiDelete } from '../modules/serverLogger/emojiLogger.js';

export const name = Events.EmojiDelete;
export const once = false;

export async function execute(emoji) {
  await handleEmojiDelete(emoji);
}
