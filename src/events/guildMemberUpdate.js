import { Events } from 'discord.js';
import { handleNicknameChange } from '../modules/memberLogger/nicknameChangeLogger.js';
import { handleRoleChange } from '../modules/memberLogger/roleChangeLogger.js';

export const name = Events.GuildMemberUpdate;
export const once = false;

export async function execute(oldMember, newMember) {
  await handleNicknameChange(oldMember, newMember);
  await handleRoleChange(oldMember, newMember);
}
