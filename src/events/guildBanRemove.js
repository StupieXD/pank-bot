import { Events } from 'discord.js';
import { handleMemberUnban } from '../modules/memberLogger/banLogger.js';

export const name = Events.GuildBanRemove;
export const once = false;

export async function execute(ban) {
  await handleMemberUnban(ban);
}
