import { setWebhookStates } from '../utils/webhookStateCache.js';

export async function initialiseWebhookStateCache(client) {
  console.log('🔄 Initialising webhook state cache...');

  let cachedChannelCount = 0;
  let cachedWebhookCount = 0;

  for (const guild of client.guilds.cache.values()) {
    const channels = guild.channels.cache.filter(
      (channel) =>
        typeof channel.fetchWebhooks === 'function'
    );

    for (const channel of channels.values()) {
      try {
        const webhooks = await channel.fetchWebhooks();

        setWebhookStates(
          guild.id,
          channel.id,
          webhooks
        );

        cachedChannelCount++;
        cachedWebhookCount += webhooks.size;
      } catch (error) {
        console.error(
          `❌ Failed to cache webhooks for #${channel.name}:`,
          error
        );
      }
    }
  }

  console.log(
    `✅ Cached ${cachedWebhookCount} webhooks across ` +
    `${cachedChannelCount} channels.`
  );
}
