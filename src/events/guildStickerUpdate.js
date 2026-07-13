import { Events } from 'discord.js';
import { handleStickerUpdate } from '../modules/serverLogger/stickerLogger.js';

export const name = Events.GuildStickerUpdate;
export const once = false;

export async function execute(oldSticker, newSticker) {
  await handleStickerUpdate(oldSticker, newSticker);
}
