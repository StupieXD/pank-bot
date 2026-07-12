import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import { diffLines } from 'diff';

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

  const changes = diffLines(normalisedBefore, normalisedAfter);

  const removedLines = [];
  const addedLines = [];

  for (const change of changes) {
    if (!change.added && !change.removed) continue;

    const lines = splitIntoLines(change.value);

    if (change.removed) {
      removedLines.push(...lines);
    }

    if (change.added) {
      addedLines.push(...lines);
    }
  }

  const removedText =
    removedLines.length > 0
      ? removedLines.join('\n')
      : 'Nothing removed';

  const addedText =
    addedLines.length > 0
      ? addedLines.join('\n')
      : 'Nothing added';

  const removedEmbedText = formatChangeSection(
    removedText,
    'Nothing removed'
  );

  const addedEmbedText = formatChangeSection(
    addedText,
    'Nothing added'
  );

  const requiresAttachment =
    removedEmbedText.length > MAX_FIELD_LENGTH ||
    addedEmbedText.length > MAX_FIELD_LENGTH;

  return {
    removedEmbedText: requiresAttachment
      ? createSectionPreview(removedText, 'Nothing removed')
      : removedEmbedText,
    addedEmbedText: requiresAttachment
      ? createSectionPreview(addedText, 'Nothing added')
      : addedEmbedText,
    fileText: buildDiffFile(before, after, removedText, addedText),
    requiresAttachment
  };
}

function formatChangeSection(text, emptyMessage) {
  if (text === emptyMessage) {
    return `*${emptyMessage}*`;
  }

  const safeText = sanitiseForCodeBlock(text);

  return `\`\`\`\n${safeText}\n\`\`\``;
}

function createSectionPreview(text, emptyMessage) {
  if (text === emptyMessage) {
    return `*${emptyMessage}*`;
  }

  const safeText = sanitiseForCodeBlock(text);
  const availableLength = MAX_FIELD_LENGTH - 40;
  const shortened = shortenText(safeText, availableLength);

  return `\`\`\`\n${shortened}\n\`\`\``;
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
