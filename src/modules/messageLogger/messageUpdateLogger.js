import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';

import { config } from '../../config/config.js';

const EMBED_COLOUR = 0xf1c40f;
const MAX_CONTENT_LENGTH = 900;

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

  const fields = [
    {
      name: '👤 User',
      value:
        `Display name: ${getDisplayName(newMessage)}\n` +
        `Username: ${newMessage.author.tag}\n` +
        `ID: ${newMessage.author.id}`,
      inline: false
    },
    {
      name: '📍 Channel',
      value: `<#${newMessage.channel.id}>`,
      inline: true
    },
    {
      name: '✏️ Edited',
      value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
      inline: true
    },
    {
      name: '🔍 Change',
      value: formatDiff(before, after),
      inline: false
    }
  ];

  const attachments = formatAttachments(newMessage);

  if (attachments) {
    fields.push({
      name: '📎 Attachments',
      value: attachments,
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setTitle('✏️ Message Edited')
    .addFields(fields)
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

function formatDiff(before, after) {
  const beforeTrimmed = shortenText(before || '[No text content]', MAX_CONTENT_LENGTH / 2);
  const afterTrimmed = shortenText(after || '[No text content]', MAX_CONTENT_LENGTH / 2);

  return (
    '```diff\n' +
    `- ${beforeTrimmed}\n` +
    `+ ${afterTrimmed}\n` +
    '```'
  );
}

function formatAttachments(message) {
  if (!message.attachments || message.attachments.size === 0) {
    return null;
  }

  return [...message.attachments.values()]
    .map((attachment) => attachment.url)
    .join('\n')
    .slice(0, MAX_CONTENT_LENGTH);
}

function shortenText(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
