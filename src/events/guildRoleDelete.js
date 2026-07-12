import { Events } from 'discord.js';
import { handleRoleDelete } from '../modules/serverLogger/roleLogger.js';

export const name = Events.GuildRoleDelete;
export const once = false;

export async function execute(role) {
  await handleRoleDelete(role);
}
