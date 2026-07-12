import { Events } from 'discord.js';
import { handleChannelUpdate } from '../modules/serverLogger/channelLogger.js';

export const name = Events.ChannelUpdate;
export const once = false;

export async function execute(oldChannel, newChannel) {
  await handleChannelUpdate(oldChannel, newChannel);
}
