import { Events } from 'discord.js';
import { handleMemberJoin } from '../modules/memberLogger/memberJoinLogger.js';

export const name = Events.GuildMemberAdd;
export const once = false;

export async function execute(member) {
  await handleMemberJoin(member);
}
