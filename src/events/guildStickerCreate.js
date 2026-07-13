import { Events } from 'discord.js';
import { handleStickerCreate } from '../modules/serverLogger/stickerLogger.js';

export const name = Events.GuildStickerCreate;
export const once = false;

export async function execute(sticker) {
  await handleStickerCreate(sticker);
}
