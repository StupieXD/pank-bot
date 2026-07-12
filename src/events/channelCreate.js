import { Events } from 'discord.js';
import { handleChannelCreate } from '../modules/serverLogger/channelLogger.js';

export const name = Events.ChannelCreate;
export const once = false;

export async function execute(channel) {
  await handleChannelCreate(channel);
}
