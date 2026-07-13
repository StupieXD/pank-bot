import { Events } from 'discord.js';
import { handleEmojiCreate } from '../modules/serverLogger/emojiLogger.js';

export const name = Events.EmojiCreate;
export const once = false;

export async function execute(emoji) {
  await handleEmojiCreate(emoji);
}
