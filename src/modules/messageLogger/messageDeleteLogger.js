import {
  ActionRowBuilder,
  AttachmentBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';

import { config } from '../../config/config.js';
import {
  deleteCachedMessage,
  getCachedMessage
} from '../../utils/messageCache.js';
import { waitForAuditLogEntry } from '../../services/auditLogService.js';

const EMBED_COLOUR = 0xe74c3c;
const MAX_FIELD_LENGTH = 900;
const MAX_LIST_LENGTH = 900;

export async function handleMessageDelete(message) {
  const cached = getCachedMessage(message.id);

  try {
    if (!message.guildId || message.author?.bot || cached?.userId === message.client.user.id) {
      return;
    }

    if (!cached && message.partial) return;

    const messageData = cached ?? buildMessageDataFromMessage(message);

    if (messageData.channelId === config.messageLogChannelId) return;

    const logChannel = await message.client.channels
      .fetch(config.messageLogChannelId)
      .catch(() => null);

    if (!logChannel?.isTextBased() || typeof logChannel.send !== 'function') {
      console.warn('Could not find a sendable message log channel.');
      return;
    }

    const auditEntry = await findMessageDeleteAuditEntry({
      message,
      messageData
    });

    const deletedTimestamp = Math.floor(Date.now() / 1000);
    const originalTimestamp = toDiscordTimestamp(messageData.timestamp);
    const contentResult = formatMessageContent(messageData.content);

    const fields = [
      {
        name: '\u{1F464} Member',
        value:
          `<@${messageData.userId}>\n` +
          `${messageData.displayName}\n` +
          `User ID: \`${messageData.userId}\``,
        inline: false
      },
      {
        name: '\u{1F4CD} Channel',
        value: `<#${messageData.channelId}>`,
        inline: true
      },
      {
        name: '\u{1F6E1}\uFE0F Deleted By',
        value: formatDeletionActor(auditEntry, messageData),
        inline: true
      },
      {
        name: '\u{1F552} Originally Sent',
        value: formatTimestamp(originalTimestamp),
        inline: false
      },
      {
        name: '\u{1F5D1}\uFE0F Deleted',
        value: formatTimestamp(deletedTimestamp),
        inline: false
      }
    ];

    const replyText = formatReplyContext(messageData.reply);

    if (replyText) {
      fields.push({
        name: '\u21A9\uFE0F Reply Context',
        value: replyText,
        inline: false
      });
    }

    fields.push({
      name: '\u{1F4AC} Deleted Message',
      value: contentResult.preview,
      inline: false
    });

    const attachmentsText = formatAttachments(messageData.attachments);

    if (attachmentsText) {
      fields.push({
        name: '\u{1F4CE} Attachments',
        value: attachmentsText,
        inline: false
      });
    }

    const stickersText = formatStickers(messageData.stickers);

    if (stickersText) {
      fields.push({
        name: '\u{1F3F7}\uFE0F Stickers',
        value: stickersText,
        inline: false
      });
    }

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOUR)
      .setTitle('\u{1F5D1}\uFE0F Message Deleted')
      .addFields(fields)
      .setFooter({
        text: `Message ID: ${messageData.id}`
      })
      .setTimestamp();

    if (messageData.avatarUrl) {
      embed.setThumbnail(messageData.avatarUrl);
    }

    const firstImage = getFirstImage(messageData.attachments);

    if (firstImage) {
      embed.setImage(firstImage);
    }

    const components = buildLinkButtons(messageData);
    const files = [];

    if (contentResult.requiresFile) {
      files.push(
        new AttachmentBuilder(
          Buffer.from(buildMessageTextFile(messageData), 'utf8')
        ).setName(`deleted-message-${messageData.id}.txt`)
      );
    }

    await logChannel.send({
      embeds: [embed],
      components,
      files,
      allowedMentions: {
        parse: []
      }
    });
  } catch (error) {
    console.error('Failed to log deleted message:', error);
  } finally {
    deleteCachedMessage(message.id);
  }
}

async function findMessageDeleteAuditEntry({ message, messageData }) {
  if (!message.guild) return null;

  return waitForAuditLogEntry({
    guild: message.guild,
    type: AuditLogEvent.MessageDelete,
    timeout: 3000,
    match: (entry) => {
      const recent = Date.now() - entry.createdTimestamp < 10000;
      const sameChannel =
        entry.extra?.channel?.id === messageData.channelId ||
        entry.extra?.channelId === messageData.channelId;
      const sameTarget =
        entry.target?.id === messageData.userId ||
        entry.targetId === messageData.userId;
      const singleDelete = !entry.extra?.count || entry.extra.count === 1;

      return recent && sameChannel && sameTarget && singleDelete;
    }
  });
}

function buildMessageDataFromMessage(message) {
  return {
    id: message.id,
    guildId: message.guildId,
    username: message.author?.tag ?? 'Unknown user',
    displayName:
      message.member?.displayName ??
      message.author?.globalName ??
      message.author?.username ??
      'Unknown user',
    avatarUrl: message.author?.displayAvatarURL({ size: 256 }) ?? null,
    userId: message.author?.id ?? 'Unknown user ID',
    channelName: message.channel?.name ?? 'Unknown channel',
    channelId: message.channel?.id ?? 'Unknown channel ID',
    timestamp: message.createdAt?.toISOString() ?? new Date().toISOString(),
    content: message.content?.trim() || '[No text content]',
    attachments: [...(message.attachments?.values() ?? [])].map(
      (attachment) => ({
        url: attachment.url,
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size
      })
    ),
    stickers: [...(message.stickers?.values() ?? [])].map((sticker) => ({
      id: sticker.id,
      name: sticker.name,
      url: sticker.url
    })),
    reply: buildReplyData(message),
    url: message.url
  };
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

function formatDeletionActor(auditEntry, messageData) {
  const executor = auditEntry?.executor;

  if (executor) {
    return (
      `<@${executor.id}>\n` +
      `${executor.globalName ?? executor.username}\n` +
      `User ID: \`${executor.id}\`\n` +
      '**Moderator deletion**'
    );
  }

  return (
    `<@${messageData.userId}>\n` +
    '**Likely self-deleted**\n' +
    '*No matching audit-log entry was found.*'
  );
}

function formatReplyContext(reply) {
  if (!reply) return null;

  if (reply.unavailable) {
    return (
      '*The referenced message was unavailable.*\n' +
      `Message ID: \`${reply.messageId}\``
    );
  }

  const author = reply.userId
    ? `<@${reply.userId}>`
    : reply.displayName;

  return (
    `${author}\n` +
    `${reply.displayName}\n` +
    `Message ID: \`${reply.messageId}\`\n\n` +
    formatCodeBlock(reply.content, 500)
  );
}

function formatMessageContent(content) {
  const normalised = normaliseContent(content);

  if (!normalised) {
    return {
      preview: '*No text content*',
      requiresFile: false
    };
  }

  const preview = formatCodeBlock(normalised, MAX_FIELD_LENGTH - 20);

  return {
    preview,
    requiresFile: normalised.length > MAX_FIELD_LENGTH - 20
  };
}

function formatCodeBlock(content, maximumLength) {
  const safe = sanitiseCodeBlock(normaliseContent(content));

  if (!safe) return '*No text content*';

  const shortened = shorten(safe, maximumLength);
  return `\`\`\`\n${shortened}\n\`\`\``;
}

function normaliseContent(content) {
  if (!content || content === '[No text content]') return '';
  return content.trim();
}

function sanitiseCodeBlock(content) {
  return content.replace(/```/g, '`\u200b``');
}

function shorten(content, maximumLength) {
  if (content.length <= maximumLength) return content;
  return `${content.slice(0, Math.max(0, maximumLength - 3))}...`;
}

function formatAttachments(attachments = []) {
  if (!attachments.length) return null;

  const lines = attachments.map((attachment, index) => {
    const name = attachment.name || `Attachment ${index + 1}`;
    const icon = getAttachmentIcon(attachment);
    const size = formatFileSize(attachment.size);
    const sizeText = size ? ` (${size})` : '';

    return `${icon} [${escapeMarkdown(name)}](${attachment.url})${sizeText}`;
  });

  return shorten(lines.join('\n'), MAX_LIST_LENGTH);
}

function formatStickers(stickers = []) {
  if (!stickers.length) return null;

  const lines = stickers.map((sticker, index) => {
    const name = sticker.name || `Sticker ${index + 1}`;

    return sticker.url
      ? `\u{1F3F7}\uFE0F [${escapeMarkdown(name)}](${sticker.url})`
      : `\u{1F3F7}\uFE0F ${escapeMarkdown(name)} (ID: \`${sticker.id}\`)`;
  });

  return shorten(lines.join('\n'), MAX_LIST_LENGTH);
}

function buildLinkButtons(messageData) {
  if (!messageData.guildId || !messageData.channelId) return [];

  const channelUrl =
    `https://discord.com/channels/${messageData.guildId}/` +
    messageData.channelId;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Open Channel')
      .setStyle(ButtonStyle.Link)
      .setURL(channelUrl),
    new ButtonBuilder()
      .setLabel('Open User Profile')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/users/${messageData.userId}`)
  );

  return [row];
}

function getFirstImage(attachments = []) {
  return attachments.find((attachment) => isImage(attachment))?.url ?? null;
}

function isImage(attachment) {
  const contentType = attachment.contentType || '';
  const url = attachment.url || '';

  return (
    contentType.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp)(?:\?.*)?$/i.test(url)
  );
}

function getAttachmentIcon(attachment) {
  const contentType = attachment.contentType || '';
  const url = attachment.url || '';

  if (isImage(attachment)) return '\u{1F5BC}\uFE0F';
  if (contentType.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(url)) {
    return '\u{1F3A5}';
  }
  if (contentType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(url)) {
    return '\u{1F3B5}';
  }

  return '\u{1F4C4}';
}

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) return null;

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeMarkdown(text) {
  return String(text).replace(/([\\`*_{}\[\]()<>#+\-.!|])/g, '\\$1');
}

function toDiscordTimestamp(value) {
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds)
    ? Math.floor(milliseconds / 1000)
    : Math.floor(Date.now() / 1000);
}

function formatTimestamp(timestamp) {
  return `<t:${timestamp}:R>\n<t:${timestamp}:F>`;
}

function buildMessageTextFile(messageData) {
  const attachmentLines = (messageData.attachments ?? []).map(
    (attachment) =>
      `- ${attachment.name || 'Attachment'}: ${attachment.url}`
  );

  const stickerLines = (messageData.stickers ?? []).map(
    (sticker) =>
      `- ${sticker.name || 'Sticker'}: ${sticker.url || sticker.id}`
  );

  return [
    `Deleted message ID: ${messageData.id}`,
    `Author: ${messageData.username} (${messageData.userId})`,
    `Channel: ${messageData.channelName} (${messageData.channelId})`,
    `Originally sent: ${messageData.timestamp}`,
    '',
    'Message:',
    normaliseContent(messageData.content) || '[No text content]',
    '',
    'Attachments:',
    attachmentLines.length ? attachmentLines.join('\n') : '[None]',
    '',
    'Stickers:',
    stickerLines.length ? stickerLines.join('\n') : '[None]'
  ].join('\n');
}
