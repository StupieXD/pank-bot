import { EmbedBuilder } from 'discord.js';

import { config } from '../../config/config.js';
import {
  getCachedMessage,
  deleteCachedMessage
} from '../../utils/messageCache.js';

const EMBED_COLOUR = 0xe74c3c;
const MAX_CONTENT_LENGTH = 900;

export async function handleMessageDelete(message) {
  if (message.author?.bot) return;

  const cached = getCachedMessage(message.id);

  if (!cached && message.partial) {
    return;
  }

  const messageData = cached ?? buildMessageDataFromMessage(message);

  const logChannel = await message.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find message log channel.');
    return;
  }

  const deletedTimestamp = Math.floor(Date.now() / 1000);

  const fields = [
    {
      name: '👤 User',
      value:
        `Display name: ${messageData.displayName}\n` +
        `Username: ${messageData.username}\n` +
        `ID: ${messageData.userId}`,
      inline: false
    },
    {
      name: '📍 Channel',
      value: `<#${messageData.channelId}>`,
      inline: true
    },
    {
      name: '🗑️ Deleted',
      value: `<t:${deletedTimestamp}:R> (<t:${deletedTimestamp}:F>)`,
      inline: true
    },
    {
      name: '💬 Message',
      value: formatContent(messageData.content),
      inline: false
    }
  ];

  const attachmentsText = formatAttachments(messageData.attachments);

  if (attachmentsText) {
    fields.push({
      name: '📎 Attachments',
      value: attachmentsText,
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setTitle('🗑️ Message Deleted')
    .addFields(fields)
    .setFooter({ text: `🆔 Message ID: ${messageData.id}` })
    .setTimestamp();

  const firstImage = getFirstImageAttachment(messageData.attachments);

  if (firstImage) {
    embed.setImage(firstImage);
  }

  await logChannel.send({
    embeds: [embed]
  });

  deleteCachedMessage(message.id);
}

function buildMessageDataFromMessage(message) {
  return {
    id: message.id,
    username: message.author?.tag ?? 'Unknown user',
    displayName: message.member?.displayName ?? message.author?.username ?? 'Unknown user',
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
    url: message.url
  };
}

function formatContent(content) {
  if (!content) return '[No text content]';

  const trimmed =
    content.length > MAX_CONTENT_LENGTH
      ? `${content.slice(0, MAX_CONTENT_LENGTH - 3)}...`
      : content;

  return trimmed;
}

function formatAttachments(attachments = []) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return attachments
    .map((attachment) => attachment.url ?? attachment)
    .join('\n')
    .slice(0, MAX_CONTENT_LENGTH);
}

function getFirstImageAttachment(attachments = []) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  const imageAttachment = attachments.find((attachment) => {
    const contentType = attachment.contentType || '';
    const url = attachment.url || attachment;

    return contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(url);
  });

  return imageAttachment?.url ?? imageAttachment ?? null;
}
