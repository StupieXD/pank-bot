import { config } from '../config/config.js';

const messageCache = new Map();

export function cacheMessage(message) {
  if (!message.guildId || message.author?.bot) return;

  messageCache.set(message.id, {
    id: message.id,
    guildId: message.guildId,
    username: message.author.tag,
    displayName:
      message.member?.displayName ??
      message.author.globalName ??
      message.author.username,
    avatarUrl: message.author.displayAvatarURL({ size: 256 }),
    userId: message.author.id,
    channelName: message.channel?.name ?? 'Unknown channel',
    channelId: message.channel?.id ?? 'Unknown channel ID',
    timestamp: message.createdAt?.toISOString() ?? new Date().toISOString(),
    content: message.content?.trim() || '[No text content]',
    attachments: [...message.attachments.values()].map((attachment) => ({
      url: attachment.url,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size
    })),
    stickers: [...message.stickers.values()].map((sticker) => ({
      id: sticker.id,
      name: sticker.name,
      url: sticker.url
    })),
    reply: buildReplyData(message),
    url: message.url
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

function buildReplyData(message) {
  const reference = message.reference;

  if (!reference?.messageId) return null;

  const repliedMessage = message.channel?.messages?.cache?.get(
    reference.messageId
  );

  if (!repliedMessage) {
    return {
      unavailable: true,
      messageId: reference.messageId
    };
  }

  return {
    unavailable: false,
    messageId: repliedMessage.id,
    userId: repliedMessage.author?.id ?? null,
    displayName:
      repliedMessage.member?.displayName ??
      repliedMessage.author?.globalName ??
      repliedMessage.author?.username ??
      'Unknown user',
    username: repliedMessage.author?.tag ?? 'Unknown user',
    content: repliedMessage.content?.trim() || '[No text content]'
  };
}
