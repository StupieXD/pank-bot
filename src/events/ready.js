import { Events } from 'discord.js';

import { initialiseDatabase } from '../database/initialiseDatabase.js';
import { initialiseTemporaryBanScheduler } from '../modules/moderation/temporaryBanScheduler.js';
import { initialiseConfirmationService } from '../services/confirmationService.js';
import { initialiseMemberStateCache } from '../services/memberStateCacheService.js';
import { registerSlashCommands } from '../services/registerSlashCommands.js';
import { initialiseWebhookStateCache } from '../services/webhookStateCacheService.js';
import { logInfo, logSuccess } from '../core/logger.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
  logSuccess(`Pank is online as ${client.user.tag}`);
  logInfo(`Connected to ${client.guilds.cache.size} server(s).`);

  initialiseDatabase();
  initialiseConfirmationService();

  await registerSlashCommands(client);
  await initialiseMemberStateCache(client);
  await initialiseWebhookStateCache(client);
  initialiseTemporaryBanScheduler(client);

  logSuccess('Startup initialisation complete.');
}
