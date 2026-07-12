import { Events } from 'discord.js';
import { handleRoleCreate } from '../modules/serverLogger/roleLogger.js';

export const name = Events.GuildRoleCreate;
export const once = false;

export async function execute(role) {
  await handleRoleCreate(role);
}
