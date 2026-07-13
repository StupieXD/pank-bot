import { Events } from 'discord.js';
import { handleInviteCreate } from '../modules/serverLogger/inviteLogger.js';

export const name = Events.InviteCreate;
export const once = false;

export async function execute(invite) {
  await handleInviteCreate(invite);
}
