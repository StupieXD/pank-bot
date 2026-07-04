import { AuditLogEvent, EmbedBuilder } from 'discord.js';

import { config } from '../../config/config.js';
import {
  getCachedMessage,
  deleteCachedMessage
} from '../../utils/messageCache.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';

const EMBED_COLOUR = 0xe74c3c;
const MAX_CONTENT_LENGTH = 900;

export async function handleMessageDelete(message) {
  if (message.author?.bot) return;

  const cached = getCachedMessage(message.id);

  if (!cached && message.partial) return;

  const messageData = cached ?? buildMessageDataFromMessage(message);

  const logChannel = await message.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find message log channel.');
    return;
  }

  const auditEntry = message.guild
    ? await waitForAuditLogEntry({
        guild: message.guild,
        type: AuditLogEvent.MessageDelete,
        timeout: 3000,
        match: (log) => {
          const recent = Date.now() - log.createdTimestamp < 10000;

          const sameChannel =
            log.extra?.channel?.id === messageData.channelId ||
            log.extra?.channelId === messageData.channelId;

          const sameTarget =
            log.target?.id === messageData.userId ||
            log.targetId === messageData.userId;

          const singleDelete = !log.extra?.count || log.extra.count === 1;

          return recent && sameChannel && sameTarget && singleDelete;
        }
      })
    : null;

  const deletedBy = auditEntry?.executor ?? null;

  const deletedTimestamp = Math.floor(Date.now() / 1000);
  const originalTimestamp = Math.floor(new Date(messageData.timestamp).getTime() / 1000);

  const fields = [
    {
      name: '👤 User',
      value:
        `<@${messageData.userId}>\n` +
        `Username: ${messageData.username}`,
      inline: false
    },
    {
      name: '📍 Channel',
      value: `<#${messageData.channelId}>`,
      inline: true
    },
    {
      name: '📝 Originally Sent',
      value: `<t:${originalTimestamp}:R> (<t:${originalTimestamp}:F>)`,
      inline: true
    },
    {
      name: '🗑️ Deleted At',
      value: `<t:${deletedTimestamp}:R> (<t:${deletedTimestamp}:F>)`,
      inline: true
    },
    {
      name: '🛡️ Deleted By',
      value: formatDeletedBy(deletedBy, messageData),
      inline: false
    }
  ];

  const replyText = formatReplyContext(messageData.reply);

  if (replyText) {
    fields.push({
      name: '↩️ Replying To',
      value: replyText,
      inline: false
    });
  }

  const attachmentsText = formatAttachments(messageData.attachments);

  if (attachmentsText) {
    fields.push({
      name: '📎 Attachments',
      value: attachmentsText,
      inline: false
    });
  }

  fields.push({
    name: '💬 Message',
    value: formatDeletedMessageContent(messageData.content),
    inline: false
  });

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setTitle('🗑️ Message Deleted')
    .addFields(fields)
    .setFooter({ text: `🆔 Message ID: ${messageData.id}` });

  await logChannel.send({
    embeds: [embed]
  });

  deleteCachedMessage(message.id);
}

function buildMessageDataFromMessage(message) {
  return {
    id: message.id,
    username: message.author?.tag ?? 'Unknown user',
    displayName:
      message.member?.displayName ??
      message.author?.globalName ??
      message.author?.username ??
      'Unknown user',
    userId: message.author?.id ?? 'Unknown user ID',
    channelName: message.channel?.name ?? 'Unknown channel',
    channelId: message.channel?.id ?? 'Unknown channel ID',
    timestamp: message.createdAt?.toISOString() ?? new Date().toISOString(),
    content: message.content?.trim() || '[No text content]',
    attachments: [...(message.attachments?.values() ?? [])].map((attachment) => ({
      url: attachment.url,
      name: attachment.name,
      contentType: attachment.contentType
    })),
    reply: buildReplyData(message),
    url: message.url
  };
}

function buildReplyData(message) {
  const reference = message.reference;

  if (!reference?.messageId) return null;

  const repliedMessage = message.channel?.messages?.cache?.get(reference.messageId);

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

function formatDeletedBy(deletedBy, messageData) {
  if (deletedBy) {
    return (
      `<@${deletedBy.id}>\n` +
      `Display name: ${deletedBy.globalName ?? deletedBy.username}\n` +
      `Username: ${deletedBy.tag}\n\n` +
      `**Moderator deletion**`
    );
  }

  if (messageData.userId && messageData.userId !== 'Unknown user ID') {
    return (
      `<@${messageData.userId}>\n` +
      `Display name: ${messageData.displayName}\n` +
      `Username: ${messageData.username}\n\n` +
      `**Self deleted**`
    );
  }

  return 'Unknown\nNo audit log entry found';
}

function formatReplyContext(reply) {
  if (!reply) return null;

  if (reply.unavailable) {
    return `Deleted or unavailable message\nMessage ID: ${reply.messageId}`;
  }

  return (
    `${reply.userId ? `<@${reply.userId}>` : reply.displayName}\n` +
    `Display name: ${reply.displayName}\n` +
    `Username: ${reply.username}\n\n` +
    formatReplyContent(reply.content)
  );
}

function formatDeletedMessageContent(content) {
  const cleaned = cleanContent(content);

  if (!cleaned) return '> *(No text content)*';

  const trimmed = shorten(cleaned);

  return trimmed
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => `> *${escapeItalics(line.trim())}*`)
    .join('\n');
}

function formatReplyContent(content) {
  const cleaned = cleanContent(content);

  if (!cleaned) return '> *(No text content)*';

  const trimmed = shorten(cleaned);

  return trimmed
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => `> ${line.trim()}`)
    .join('\n');
}

function cleanContent(content) {
  if (!content || content === '[No text content]') return '';

  return content
    .replace(/^\s+$/gm, '')
    .replace(/^\s*\*\s*$/gm, '')
    .trim();
}

function shorten(content) {
  return content.length > MAX_CONTENT_LENGTH
    ? `${content.slice(0, MAX_CONTENT_LENGTH - 3)}...`
    : content;
}

function formatAttachments(attachments = []) {
  if (!attachments || attachments.length === 0) return null;

  const grouped = {
    images: [],
    videos: [],
    audio: [],
    files: []
  };

  for (const attachment of attachments) {
    const name = attachment.name || 'Attachment';
    const url = attachment.url ?? attachment;
    const type = getAttachmentType(attachment);
    const icon = getAttachmentIcon(attachment);

    grouped[type].push(`${icon} [${name}](${url})`);
  }

  const sections = [];

  if (grouped.images.length > 0) {
    sections.push(`**🖼️ Images**\n${grouped.images.join('\n')}`);
  }

  if (grouped.videos.length > 0) {
    sections.push(`**🎥 Videos**\n${grouped.videos.join('\n')}`);
  }

  if (grouped.audio.length > 0) {
    sections.push(`**🎵 Audio**\n${grouped.audio.join('\n')}`);
  }

  if (grouped.files.length > 0) {
    sections.push(`**📄 Files**\n${grouped.files.join('\n')}`);
  }

  return sections.join('\n\n').slice(0, MAX_CONTENT_LENGTH);
}

function getAttachmentType(attachment) {
  const contentType = attachment.contentType || '';
  const url = attachment.url || attachment || '';

  if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(url)) {
    return 'images';
  }

  if (contentType.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(url)) {
    return 'videos';
  }

  if (contentType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(url)) {
    return 'audio';
  }

  return 'files';
}

function getAttachmentIcon(attachment) {
  const type = getAttachmentType(attachment);

  if (type === 'images') return '🖼️';
  if (type === 'videos') return '🎥';
  if (type === 'audio') return '🎵';

  return '📄';
}

function escapeItalics(text) {
  return text.replace(/\*/g, '\\*');
}
