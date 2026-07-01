import { AttachmentBuilder } from 'discord.js';
import { getCachedMessage, deleteCachedMessage } from '../../utils/messageCache.js';
import { findBulkDeleteModerator } from '../../services/auditLogs.js';
import { config } from '../../config.js';

export async function handleBulkPurge(messages, channel, client) {
  const logChannel = await client.channels.fetch(config.purgeLogChannelId).catch(() => null);
  if (!logChannel) return console.log('❌ Could not find purge log channel.');

  const moderator = channel.guild
    ? await findBulkDeleteModerator(channel.guild, channel.id, messages.size)
    : null;

  let loggedCount = 0;
  let uncachedCount = 0;
  const lines = [];

  lines.push('PURGE LOG');
  lines.push(`Channel: #${channel.name} (${channel.id})`);
  lines.push(`Deleted messages: ${messages.size}`);

  for (const deletedMessage of [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)) {
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
      cached.attachments.forEach((url) => lines.push(`- ${url}`));
    }

    deleteCachedMessage(deletedMessage.id);
  }

  lines.splice(3, 0, `Cached messages logged: ${loggedCount}`);
  lines.splice(4, 0, `Uncached messages: ${uncachedCount}`);
  lines.splice(5, 0, `Moderator: ${moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown'}`);
  lines.splice(6, 0, `Time: ${new Date().toISOString()}`);

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
        `Full log attached.`,
      files: [file]
    });
  }
}
