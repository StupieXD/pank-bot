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

  const editedTimestamp = Math.floor(newMessage.editedTimestamp / 1000);

  const fields = [
    {
      name: '👤 User',
      value:
        `<@${newMessage.author.id}>\n` +
        `Display name: ${getDisplayName(newMessage)}\n` +
        `Username: ${newMessage.author.tag}`,
      inline: false
    },
    {
      name: '📍 Channel',
      value: `<#${newMessage.channel.id}>`,
      inline: true
    },
    {
      name: '✏️ Edited',
      value: `<t:${editedTimestamp}:R> (<t:${editedTimestamp}:F>)`,
      inline: true
    },
    {
      name: '📝 Changes',
      value: formatHighlightedChange(before, after),
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
    .setFooter({ text: `🆔 Message ID: ${newMessage.id}` })
    .setTimestamp();

  const firstImage = getFirstImageAttachment(newMessage);

  if (firstImage) {
    embed.setImage(firstImage);
  }

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

function formatHighlightedChange(before, after) {
  const beforeText = shortenText(before || '[No text content]', MAX_CONTENT_LENGTH / 2);
  const afterText = shortenText(after || '[No text content]', MAX_CONTENT_LENGTH / 2);

  const { beforeHighlighted, afterHighlighted } = highlightChangedWords(beforeText, afterText);

  return `**Before**\n${beforeHighlighted}\n\n**After**\n${afterHighlighted}`;
}

function highlightChangedWords(before, after) {
  const beforeWords = before.split(/\s+/);
  const afterWords = after.split(/\s+/);

  let start = 0;

  while (
    start < beforeWords.length &&
    start < afterWords.length &&
    beforeWords[start] === afterWords[start]
  ) {
    start++;
  }

  let beforeEnd = beforeWords.length - 1;
  let afterEnd = afterWords.length - 1;

  while (
    beforeEnd >= start &&
    afterEnd >= start &&
    beforeWords[beforeEnd] === afterWords[afterEnd]
  ) {
    beforeEnd--;
    afterEnd--;
  }

  const beforeHighlighted = beforeWords
    .map((word, index) => {
      if (index >= start && index <= beforeEnd) {
        return `~~**${word}**~~`;
      }

      return word;
    })
    .join(' ');

  const afterHighlighted = afterWords
    .map((word, index) => {
      if (index >= start && index <= afterEnd) {
        return `**${word}**`;
      }

      return word;
    })
    .join(' ');

  return {
    beforeHighlighted,
    afterHighlighted
  };
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

function getFirstImageAttachment(message) {
  if (!message.attachments || message.attachments.size === 0) {
    return null;
  }

  const imageAttachment = [...message.attachments.values()].find((attachment) => {
    const contentType = attachment.contentType || '';
    return contentType.startsWith('image/');
  });

  return imageAttachment?.url ?? null;
}

function shortenText(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
