import { Events } from 'discord.js';
import { handleRoleUpdate } from '../modules/serverLogger/roleLogger.js';

export const name = Events.GuildRoleUpdate;
export const once = false;

export async function execute(oldRole, newRole) {
  await handleRoleUpdate(oldRole, newRole);
}
