import { Events } from 'discord.js';

import { initialiseDatabase } from '../database/initialiseDatabase.js';
import { initialiseMemberStateCache } from '../services/memberStateCacheService.js';
import { registerSlashCommands } from '../services/registerSlashCommands.js';
import { initialiseWebhookStateCache } from '../services/webhookStateCacheService.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
  console.log(`✅ Pank is online as ${client.user.tag}`);

  initialiseDatabase();

  await registerSlashCommands(client);
  await initialiseMemberStateCache(client);
  await initialiseWebhookStateCache(client);
}
