import { config } from '../config.js';

const messageCache = new Map();

export function cacheMessage(message) {
  if (message.author?.bot) return;

  messageCache.set(message.id, {
    id: message.id,
    username: message.author.tag,
    displayName: message.member?.displayName ?? message.author.username,
    userId: message.author.id,
    channelName: message.channel?.name ?? 'Unknown channel',
    channelId: message.channel?.id ?? 'Unknown channel ID',
    timestamp: message.createdAt?.toISOString() ?? new Date().toISOString(),
    content: message.content?.trim() || '[No text content]',
    attachments: [...message.attachments.values()].map((attachment) => attachment.url)
  });

  if (messageCache.size > config.maxCachedMessages) {
    const oldestMessageId = messageCache.keys().next().value;
    messageCache.delete(oldestMessageId);
  }
}

export function getCachedMessage(messageId) {
  return messageCache.get(messageId);
}

export function deleteCachedMessage(messageId) {
  messageCache.delete(messageId);
}
