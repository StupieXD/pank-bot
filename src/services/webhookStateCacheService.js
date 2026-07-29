import { DiscordAPIError } from 'discord.js';

import { logInfo, logSuccess, logWarn } from '../core/logger.js';
import { setWebhookStates } from '../utils/webhookStateCache.js';

export async function initialiseWebhookStateCache(client) {
  logInfo('Initialising webhook state cache...');

  let cachedChannelCount = 0;
  let cachedWebhookCount = 0;
  let skippedPermissionCount = 0;
  let failedCount = 0;

  for (const guild of client.guilds.cache.values()) {
    const channels = guild.channels.cache.filter(
      (channel) => typeof channel.fetchWebhooks === 'function'
    );

    for (const channel of channels.values()) {
      try {
        const webhooks = await channel.fetchWebhooks();

        setWebhookStates(guild.id, channel.id, webhooks);
        cachedChannelCount++;
        cachedWebhookCount += webhooks.size;
      } catch (error) {
        if (isMissingPermissions(error)) {
          skippedPermissionCount++;
          continue;
        }

        failedCount++;
        logWarn(
          `Could not cache webhooks for #${channel.name} (${channel.id}): ` +
          `${error?.message ?? 'Unknown error'}`
        );
      }
    }
  }

  logSuccess(
    `Cached ${cachedWebhookCount} webhooks across ${cachedChannelCount} channels.`
  );

  if (skippedPermissionCount > 0) {
    logWarn(
      `Skipped webhook caching in ${skippedPermissionCount} channel(s) ` +
      'where Pank lacks Manage Webhooks.'
    );
  }

  if (failedCount > 0) {
    logWarn(`Webhook caching finished with ${failedCount} unexpected failure(s).`);
  }
}

function isMissingPermissions(error) {
  return error instanceof DiscordAPIError && error.code === 50013;
}
