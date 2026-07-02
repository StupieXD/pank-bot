import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';

import { config } from '../../config/config.js';

const EMBED_COLOUR = 0xf1c40f;
const MAX_CONTENT_LENGTH = 1000;

export async function handleMessageUpdate(oldMessage, newMessage) {
  if (newMessage.author?.bot) return;

  if (oldMessage.partial) {
    try {
      oldMessage = await oldMessage.fetch();
    } catch {
      return;
    }
  }

  if (newMessage.partial) {
    try {
      newMessage = await newMessage.fetch();
    } catch {
      return;
    }
  }

  const before = oldMessage.content?.trim() || '';
  const after = newMessage.content?.trim() || '';

  if (before === after) return;

  const logChannel = await newMessage.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find message log channel.');
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setTitle('✏️ Message Edited')
    .addFields(
      {
        name: '👤 User',
        value: `${getDisplayName(newMessage)}\n${newMessage.author.tag}\n${newMessage.author.id}`,
        inline: false
      },
      {
        name: '📍 Channel',
        value: `<#${newMessage.channel.id}>`,
        inline: true
      },
      {
        name: '🕒 Edited At',
        value: new Date().toISOString(),
        inline: true
      },
      {
        name: 'Before',
        value: formatContent(before),
        inline: false
      },
      {
        name: 'After',
        value: formatContent(after),
        inline: false
      },
      {
        name: '📎 Attachments',
        value: formatAttachments(newMessage),
        inline: false
      }
    )
    .setFooter({ text: `Message ID: ${newMessage.id}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Jump to Message')
      .setStyle(ButtonStyle.Link)
      .setURL(newMessage.url)
  );

  await logChannel.send({
    embeds: [embed],
    components: [row]
  });
}

function getDisplayName(message) {
  return message.member?.displayName ?? message.author.globalName ?? message.author.username;
}

function formatContent(content) {
  if (!content) return '[No text content]';

  const trimmed =
    content.length > MAX_CONTENT_LENGTH
      ? `${content.slice(0, MAX_CONTENT_LENGTH - 3)}...`
      : content;

  return `\`\`\`\n${trimmed}\n\`\`\``;
}

function formatAttachments(message) {
  if (!message.attachments || message.attachments.size === 0) {
    return 'None';
  }

  return [...message.attachments.values()]
    .map((attachment) => attachment.url)
    .join('\n')
    .slice(0, MAX_CONTENT_LENGTH);
}
