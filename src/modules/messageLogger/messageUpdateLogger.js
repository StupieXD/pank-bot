import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import { diffWordsWithSpace } from 'diff';

import { config } from '../../config/config.js';

const EMBED_COLOUR = 0xf1c40f;
const MAX_FIELD_LENGTH = 900;
const MAX_ATTACHMENT_FIELD_LENGTH = 900;

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

  const before = oldMessage.content ?? '';
  const after = newMessage.content ?? '';

  if (before === after) return;

  const logChannel = await newMessage.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find message log channel.');
    return;
  }

  const editedTimestamp = Math.floor(
    (newMessage.editedTimestamp ?? Date.now()) / 1000
  );

  const diffResult = buildMessageDiff(before, after);

  const fields = [
    {
      name: '👤 User',
      value:
        `<@${newMessage.author.id}>\n` +
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
      name: '🗑️ Removed',
      value: diffResult.removedEmbedText,
      inline: false
    },
    {
      name: '➕ Added',
      value: diffResult.addedEmbedText,
      inline: false
    }
  ];

  if (diffResult.requiresAttachment) {
    fields.push({
      name: '📄 Full Edit Details',
      value: 'The complete edit details are attached as a text file.',
      inline: false
    });
  }

  const attachments = formatAttachments(newMessage);

  if (attachments) {
    fields.push({
      name: '📎 Message Attachments',
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

  const files = [];

  if (diffResult.requiresAttachment) {
    files.push(
      new AttachmentBuilder(
        Buffer.from(diffResult.fileText, 'utf8')
      ).setName(`message-edit-${newMessage.id}.txt`)
    );
  }

  await logChannel.send({
    embeds: [embed],
    components: [row],
    files
  });
}

function buildMessageDiff(before, after) {
  const normalisedBefore = before || '[No text content]';
  const normalisedAfter = after || '[No text content]';

  const changes = diffWordsWithSpace(
    normalisedBefore,
    normalisedAfter
  );

  const removedPlainParts = [];
  const addedPlainParts = [];
  const removedFormattedParts = [];
  const addedFormattedParts = [];
  let hasRemovedContent = false;
  let hasAddedContent = false;

  for (const change of changes) {
    const safeValue = escapeDiscordMarkdown(change.value);

    if (change.removed) {
      hasRemovedContent = true;
      removedPlainParts.push(change.value);
      removedFormattedParts.push(formatRemovedText(safeValue));
      continue;
    }

    if (change.added) {
      hasAddedContent = true;
      addedPlainParts.push(change.value);
      addedFormattedParts.push(formatAddedText(safeValue));
      continue;
    }

    removedFormattedParts.push(safeValue);
    addedFormattedParts.push(safeValue);
  }

  const removedText = hasRemovedContent
    ? removedPlainParts.join('')
    : 'Nothing removed';

  const addedText = hasAddedContent
    ? addedPlainParts.join('')
    : 'Nothing added';

  const removedEmbedText = hasRemovedContent
    ? removedFormattedParts.join('')
    : '*Nothing removed*';

  const addedEmbedText = hasAddedContent
    ? addedFormattedParts.join('')
    : '*Nothing added*';

  const requiresAttachment =
    removedEmbedText.length > MAX_FIELD_LENGTH ||
    addedEmbedText.length > MAX_FIELD_LENGTH;

  return {
    removedEmbedText: requiresAttachment
      ? createFormattedPreview(
          removedEmbedText,
          'Full removed text is attached.'
        )
      : removedEmbedText,
    addedEmbedText: requiresAttachment
      ? createFormattedPreview(
          addedEmbedText,
          'Full added text is attached.'
        )
      : addedEmbedText,
    fileText: buildDiffFile(before, after, removedText, addedText),
    requiresAttachment
  };
}

function formatRemovedText(text) {
  if (!text) return '';

  return `~~${text}~~`;
}

function formatAddedText(text) {
  if (!text) return '';

  return `**${text}**`;
}

function createFormattedPreview(text, suffix) {
  const availableLength = MAX_FIELD_LENGTH - suffix.length - 8;
  const shortened = shortenText(text, availableLength);

  return `${shortened}\n\n*${suffix}*`;
}

function escapeDiscordMarkdown(text) {
  return text.replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, '\\$1');
}

function buildDiffFile(before, after, removedText, addedText) {
  return [
    'MESSAGE EDIT DETAILS',
    '====================',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'REMOVED',
    '=======',
    '',
    removedText,
    '',
    'ADDED',
    '=====',
    '',
    addedText,
    '',
    'FULL BEFORE',
    '===========',
    '',
    before || '[No text content]',
    '',
    'FULL AFTER',
    '==========',
    '',
    after || '[No text content]',
    ''
  ].join('\n');
}

function splitIntoLines(value) {
  const lines = value
    .replace(/\r\n/g, '\n')
    .split('\n');

  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines.length > 0 ? lines : [''];
}

function sanitiseForCodeBlock(text) {
  return text.replace(/```/g, '`\u200b``');
}

function formatAttachments(message) {
  if (!message.attachments || message.attachments.size === 0) {
    return null;
  }

  const attachmentText = [...message.attachments.values()]
    .map((attachment) => {
      const name = attachment.name || 'Attachment';

      return `[${name}](${attachment.url})`;
    })
    .join('\n');

  return shortenText(
    attachmentText,
    MAX_ATTACHMENT_FIELD_LENGTH
  );
}

function getFirstImageAttachment(message) {
  if (!message.attachments || message.attachments.size === 0) {
    return null;
  }

  const imageAttachment = [...message.attachments.values()].find(
    (attachment) => {
      const contentType = attachment.contentType || '';
      const url = attachment.url || '';

      return (
        contentType.startsWith('image/') ||
        /\.(png|jpe?g|gif|webp)$/i.test(url)
      );
    }
  );

  return imageAttachment?.url ?? null;
}

function shortenText(text, maxLength) {
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 3)}...`;
}
