const webhookStateCache = new Map();

function getChannelCacheKey(guildId, channelId) {
  return `${guildId}:${channelId}`;
}

export function getWebhookStates(guildId, channelId) {
  return (
    webhookStateCache.get(
      getChannelCacheKey(guildId, channelId)
    ) ?? new Map()
  );
}

export function setWebhookStates(guildId, channelId, webhooks) {
  webhookStateCache.set(
    getChannelCacheKey(guildId, channelId),
    createWebhookStateMap(webhooks)
  );
}

export function deleteWebhookStates(guildId, channelId) {
  webhookStateCache.delete(
    getChannelCacheKey(guildId, channelId)
  );
}

function createWebhookStateMap(webhooks) {
  return new Map(
    [...webhooks.values()].map((webhook) => [
      webhook.id,
      {
        id: webhook.id,
        name: webhook.name ?? 'Unknown',
        channelId: webhook.channelId ?? null,
        avatar: webhook.avatar ?? null,
        type: webhook.type,
        applicationId: webhook.applicationId ?? null,
        ownerId: webhook.owner?.id ?? null
      }
    ])
  );
}
