import { AttachmentBuilder, AuditLogEvent } from 'discord.js';
import { findRecentPurgeAction } from '../../services/purgeContext.js';
import {
  getCachedMessage,
  deleteCachedMessage
} from '../../utils/messageCache.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';
import { config } from '../../config/config.js';

export async function handleBulkPurge(messages, channel, client) {
  const logChannel = await client.channels
    .fetch(config.purgeLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find purge log channel.');
    return;
  }

  const auditEntry = channel.guild
    ? await waitForAuditLogEntry({
        guild: channel.guild,
        type: AuditLogEvent.MessageBulkDelete,
        match: (log) => {
          const recent = Date.now() - log.createdTimestamp < 10000;
          const sameChannel =
            log.extra?.channel?.id === channel.id ||
            log.extra?.channelId === channel.id ||
            log.target?.id === channel.id;

          return recent && sameChannel;
        }
      })
    : null;

  const purgeAction = findRecentPurgeAction({
    guildId: channel.guild?.id,
    channelId: channel.id,
    count: messages.size
  });

  const moderator = purgeAction?.moderator ?? auditEntry?.executor ?? null;
  const filters = purgeAction?.filters;

  let loggedCount = 0;
  let uncachedCount = 0;

  const lines = [];

  lines.push('PURGE LOG');
  lines.push('');
  lines.push(`Channel: #${channel.name} (${channel.id})`);
  lines.push(`Deleted messages: ${messages.size}`);
  lines.push(`Cached messages logged: 0`);
  lines.push(`Uncached messages: 0`);
  lines.push(`Moderator: ${moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown'}`);
  lines.push(`Reason: ${purgeAction?.reason ?? 'No reason provided'}`);
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('Filters:');
  lines.push(`- Requested amount: ${filters?.requestedAmount ?? 'Unknown'}`);
  lines.push(
    `- User: ${filters?.user ? `${filters.user.tag ?? filters.user.username} (${filters.user.id})` : 'Any'}`
  );
  lines.push(`- Contains: ${filters?.contains ?? 'None'}`);
  lines.push(`- Bots only: ${filters?.botsOnly ? 'Yes' : 'No'}`);
  lines.push(`- Attachments only: ${filters?.attachmentsOnly ? 'Yes' : 'No'}`);
  lines.push(`- Links only: ${filters?.linksOnly ? 'Yes' : 'No'}`);

  const sortedMessages = [...messages.values()].sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  );

  for (const deletedMessage of sortedMessages) {
    const cached = getCachedMessage(deletedMessage.id);

    lines.push('');
    lines.push('------------------------------');

    if (!cached) {
      uncachedCount++;
      lines.push(`Message ID: ${deletedMessage.id}`);
      lines.push('Status: Not cached, so content and author details are unavailable.');
      continue;
    }

    loggedCount++;

    lines.push(`User: ${cached.username}`);
    lines.push(`Display name: ${cached.displayName}`);
    lines.push(`User ID: ${cached.userId}`);
    lines.push(`Channel: #${cached.channelName} (${cached.channelId})`);
    lines.push(`Timestamp: ${cached.timestamp}`);
    lines.push(`Message: ${cached.content}`);

    if (cached.attachments.length > 0) {
      lines.push('Attachments:');

      cached.attachments.forEach((url) => {
        lines.push(`- ${url}`);
      });
    }

    deleteCachedMessage(deletedMessage.id);
  }

  lines[4] = `Cached messages logged: ${loggedCount}`;
  lines[5] = `Uncached messages: ${uncachedCount}`;

  const logText = lines.join('\n');

  if (logText.length <= 1900) {
    await logChannel.send({
      content: `🧹 **Bulk purge detected in #${channel.name}**\n\`\`\`\n${logText}\n\`\`\``
    });
  } else {
    const file = new AttachmentBuilder(Buffer.from(logText, 'utf8'), {
      name: `purge-log-${Date.now()}.txt`
    });

    await logChannel.send({
      content:
        `🧹 **Bulk purge detected in #${channel.name}**\n` +
        `Deleted messages: **${messages.size}**\n` +
        `Cached messages logged: **${loggedCount}**\n` +
        `Uncached messages: **${uncachedCount}**\n` +
        `Moderator: **${moderator ? moderator.tag : 'Unknown'}**\n` +
        `Reason: **${purgeAction?.reason ?? 'No reason provided'}**\n` +
        `Full log attached.`,
      files: [file]
    });
  }
}
