import { Events } from 'discord.js';
import { handleChannelDelete } from '../modules/serverLogger/channelLogger.js';

export const name = Events.ChannelDelete;
export const once = false;

export async function execute(channel) {
  await handleChannelDelete(channel);
}
