import { Events } from 'discord.js';
import { handleNicknameChange } from '../modules/memberLogger/nicknameChangeLogger.js';
import { handleRoleChange } from '../modules/memberLogger/roleChangeLogger.js';
import {
  cacheMemberState,
  getMemberState
} from '../utils/memberStateCache.js';

export const name = Events.GuildMemberUpdate;
export const once = false;

export async function execute(oldMember, newMember) {
  const previousState = getMemberState(newMember);

  if (!previousState) {
    cacheMemberState(newMember);
    return;
  }

  await handleNicknameChange(previousState, newMember);
  await handleRoleChange(previousState, newMember);

  cacheMemberState(newMember);
}
