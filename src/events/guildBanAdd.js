import { Events } from 'discord.js';
import { handleMemberBan } from '../modules/memberLogger/banLogger.js';

export const name = Events.GuildBanAdd;
export const once = false;

export async function execute(ban) {
  await handleMemberBan(ban);
}
