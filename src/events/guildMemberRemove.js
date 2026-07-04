import { Events } from 'discord.js';
import { handleMemberLeave } from '../modules/memberLogger/memberLeaveLogger.js';

export const name = Events.GuildMemberRemove;
export const once = false;

export async function execute(member) {
  await handleMemberLeave(member);
}
