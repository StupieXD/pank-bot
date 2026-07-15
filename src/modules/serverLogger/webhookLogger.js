import {
  AuditLogEvent,
  EmbedBuilder,
  WebhookType
} from 'discord.js';

import { config } from '../../config/config.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';
import {
  getWebhookStates,
  setWebhookStates
} from '../../utils/webhookStateCache.js';

const CREATE_COLOUR = 0x2ecc71;
const UPDATE_COLOUR = 0x3498db;
const DELETE_COLOUR = 0xe74c3c;

const MAX_FIELD_VALUE_LENGTH = 1000;

export async function handleWebhooksUpdate(channel) {
  if (!channel?.guild) return;
  if (typeof channel.fetchWebhooks !== 'function') return;

  const guildId = channel.guild.id;
  const channelId = channel.id;

  const previousStates = getWebhookStates(guildId, channelId);

  const currentWebhooks = await channel
    .fetchWebhooks()
    .catch((error) => {
      console.error(
        `❌ Failed to fetch webhooks for #${channel.name}:`,
        error
      );

      return null;
    });

  if (!currentWebhooks) return;

  const currentStates = createWebhookStateMap(currentWebhooks);

  const createdIds = [...currentStates.keys()].filter(
    (webhookId) => !previousStates.has(webhookId)
  );

  const deletedIds = [...previousStates.keys()].filter(
    (webhookId) => !currentStates.has(webhookId)
  );

  const updatedIds = [...currentStates.keys()].filter((webhookId) => {
    const previousState = previousStates.get(webhookId);
    const currentState = currentStates.get(webhookId);

    return (
      previousState &&
      webhookStateSignature(previousState) !==
        webhookStateSignature(currentState)
    );
  });

  setWebhookStates(guildId, channelId, currentWebhooks);

  if (
    createdIds.length === 0 &&
    deletedIds.length === 0 &&
    updatedIds.length === 0
  ) {
    return;
  }

  const logChannel = await getLogChannel(channel.guild.client);
  if (!logChannel) return;

  for (const webhookId of createdIds) {
    const webhook = currentWebhooks.get(webhookId);
    const state = currentStates.get(webhookId);

    if (!state) continue;

    await sendWebhookCreateLog({
      logChannel,
      channel,
      webhook,
      state
    });
  }

  for (const webhookId of updatedIds) {
    const webhook = currentWebhooks.get(webhookId);
    const previousState = previousStates.get(webhookId);
    const currentState = currentStates.get(webhookId);

    if (!previousState || !currentState) continue;

    await sendWebhookUpdateLog({
      logChannel,
      channel,
      webhook,
      previousState,
      currentState
    });
  }

  for (const webhookId of deletedIds) {
    const state = previousStates.get(webhookId);

    if (!state) continue;

    await sendWebhookDeleteLog({
      logChannel,
      channel,
      state
    });
  }
}

async function sendWebhookCreateLog({
  logChannel,
  channel,
  webhook,
  state
}) {
  const auditEntry = await findWebhookAuditEntry({
    guild: channel.guild,
    webhookId: state.id,
    type: AuditLogEvent.WebhookCreate
  });

  const moderator = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(Date.now() / 1000);

  const fields = [
    {
      name: '🪝 Webhook',
      value: state.name,
      inline: false
    },
    {
      name: '📍 Channel',
      value: formatChannel(state.channelId, channel),
      inline: false
    },
    {
      name: '🏷️ Type',
      value: formatWebhookType(state.type),
      inline: true
    },
    {
      name: '👤 Owner',
      value: formatOwner(state.ownerId),
      inline: true
    },
    {
      name: '🕒 Created',
      value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
      inline: false
    },
    {
      name: '🛡️ Moderator',
      value: formatModerator(
        moderator,
        'Unable to determine who created this webhook.'
      ),
      inline: false
    }
  ];

  if (reason) {
    fields.push({
      name: '📝 Reason',
      value: shortenText(reason, MAX_FIELD_VALUE_LENGTH),
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setColor(CREATE_COLOUR)
    .setTitle('➕ Webhook Created')
    .addFields(fields)
    .setFooter({ text: `🆔 Webhook ID: ${state.id}` });

  const avatarUrl = getWebhookAvatarUrl(webhook);

  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  await logChannel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
}

async function sendWebhookUpdateLog({
  logChannel,
  channel,
  webhook,
  previousState,
  currentState
}) {
  const changes = buildWebhookChanges(
    previousState,
    currentState,
    channel
  );

  if (changes.length === 0) return;

  const auditEntry = await findWebhookAuditEntry({
    guild: channel.guild,
    webhookId: currentState.id,
    type: AuditLogEvent.WebhookUpdate
  });

  const moderator = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(Date.now() / 1000);

  const fields = [
    {
      name: '🪝 Webhook',
      value: currentState.name,
      inline: false
    },
    {
      name: '📍 Channel',
      value: formatChannel(currentState.channelId, channel),
      inline: false
    },
    {
      name: '🕒 Updated',
      value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
      inline: false
    },
    ...changes,
    {
      name: '🛡️ Moderator',
      value: formatModerator(
        moderator,
        'Unable to determine who updated this webhook.'
      ),
      inline: false
    }
  ];

  if (reason) {
    fields.push({
      name: '📝 Reason',
      value: shortenText(reason, MAX_FIELD_VALUE_LENGTH),
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setColor(UPDATE_COLOUR)
    .setTitle('✏️ Webhook Updated')
    .addFields(fields)
    .setFooter({ text: `🆔 Webhook ID: ${currentState.id}` });

  const avatarUrl = getWebhookAvatarUrl(webhook);

  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  await logChannel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
}

async function sendWebhookDeleteLog({
  logChannel,
  channel,
  state
}) {
  const auditEntry = await findWebhookAuditEntry({
    guild: channel.guild,
    webhookId: state.id,
    type: AuditLogEvent.WebhookDelete
  });

  const moderator = auditEntry?.executor ?? null;
  const reason = auditEntry?.reason ?? null;
  const timestamp = Math.floor(Date.now() / 1000);

  const fields = [
    {
      name: '🪝 Webhook',
      value: state.name,
      inline: false
    },
    {
      name: '📍 Channel',
      value: formatChannel(state.channelId, channel),
      inline: false
    },
    {
      name: '🏷️ Type',
      value: formatWebhookType(state.type),
      inline: true
    },
    {
      name: '👤 Owner',
      value: formatOwner(state.ownerId),
      inline: true
    },
    {
      name: '🕒 Deleted',
      value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
      inline: false
    },
    {
      name: '🛡️ Moderator',
      value: formatModerator(
        moderator,
        'Unable to determine who deleted this webhook.'
      ),
      inline: false
    }
  ];

  if (reason) {
    fields.push({
      name: '📝 Reason',
      value: shortenText(reason, MAX_FIELD_VALUE_LENGTH),
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setColor(DELETE_COLOUR)
    .setTitle('🗑️ Webhook Deleted')
    .addFields(fields)
    .setFooter({ text: `🆔 Webhook ID: ${state.id}` });

  await logChannel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
}

function buildWebhookChanges(
  previousState,
  currentState,
  fallbackChannel
) {
  const changes = [];

  addChange(
    changes,
    '🏷️ Name',
    previousState.name,
    currentState.name
  );

  addChange(
    changes,
    '📍 Channel',
    formatChannel(previousState.channelId, fallbackChannel),
    formatChannel(currentState.channelId, fallbackChannel)
  );

  addChange(
    changes,
    '🖼️ Avatar',
    previousState.avatar ? 'Custom avatar' : 'Default avatar',
    currentState.avatar ? 'Custom avatar' : 'Default avatar'
  );

  addChange(
    changes,
    '🏷️ Type',
    formatWebhookType(previousState.type),
    formatWebhookType(currentState.type)
  );

  addChange(
    changes,
    '👤 Owner',
    formatOwner(previousState.ownerId),
    formatOwner(currentState.ownerId)
  );

  addChange(
    changes,
    '🤖 Application',
    formatApplication(previousState.applicationId),
    formatApplication(currentState.applicationId)
  );

  return changes;
}

function addChange(changes, name, before, after) {
  if (before === after) return;

  changes.push({
    name,
    value: shortenText(
      `**Before**\n${before}\n\n**After**\n${after}`,
      MAX_FIELD_VALUE_LENGTH
    ),
    inline: false
  });
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

function webhookStateSignature(state) {
  return JSON.stringify({
    name: state.name,
    channelId: state.channelId,
    avatar: state.avatar,
    type: state.type,
    applicationId: state.applicationId,
    ownerId: state.ownerId
  });
}

async function getLogChannel(client) {
  const logChannel = await client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find server log channel.');
    return null;
  }

  return logChannel;
}

async function findWebhookAuditEntry({
  guild,
  webhookId,
  type
}) {
  return waitForAuditLogEntry({
    guild,
    type,
    timeout: 3000,
    match: (log) => {
      const recent =
        Date.now() - log.createdTimestamp < 10000;

      const sameTarget =
        log.target?.id === webhookId ||
        log.targetId === webhookId;

      return recent && sameTarget;
    }
  });
}

function formatWebhookType(type) {
  const webhookTypes = {
    [WebhookType.Incoming]: 'Incoming',
    [WebhookType.ChannelFollower]: 'Channel Follower',
    [WebhookType.Application]: 'Application'
  };

  return webhookTypes[type] ?? `Unknown (${type})`;
}

function formatChannel(channelId, fallbackChannel) {
  if (!channelId) return 'Unknown';

  if (fallbackChannel?.guild?.channels?.cache?.has(channelId)) {
    return `<#${channelId}>`;
  }

  return `Channel ID: ${channelId}`;
}

function formatOwner(ownerId) {
  if (!ownerId) return 'Unknown';

  return `<@${ownerId}>`;
}

function formatApplication(applicationId) {
  if (!applicationId) return 'None';

  return `Application ID: ${applicationId}`;
}

function getWebhookAvatarUrl(webhook) {
  if (!webhook || typeof webhook.avatarURL !== 'function') {
    return null;
  }

  return webhook.avatarURL({ size: 256 });
}

function formatModerator(moderator, unknownMessage) {
  if (!moderator) {
    return `Unknown\n${unknownMessage}`;
  }

  return (
    `<@${moderator.id}>\n` +
    `Username: ${moderator.tag}`
  );
}

function shortenText(text, maxLength) {
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 3)}...`;
}
