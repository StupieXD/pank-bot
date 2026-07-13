import { Events } from 'discord.js';
import { handleInviteDelete } from '../modules/serverLogger/inviteLogger.js';

export const name = Events.InviteDelete;
export const once = false;

export async function execute(invite) {
  await handleInviteDelete(invite);
}
