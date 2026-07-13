import { Events } from 'discord.js';
import { handleStickerDelete } from '../modules/serverLogger/stickerLogger.js';

export const name = Events.GuildStickerDelete;
export const once = false;

export async function execute(sticker) {
  await handleStickerDelete(sticker);
}
