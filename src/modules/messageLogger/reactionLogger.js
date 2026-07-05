import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';

import { config } from '../../config/config.js';

const ADD_COLOUR = 0x2ecc71;
const REMOVE_COLOUR = 0xe74c3c;
const MAX_CONTENT_LENGTH = 500;
const REACTION_LOG_COOLDOWN_MS = 15000;
const recentReactionLogs = new Map();

export async function handleReactionAdd(reaction, user) {
  await handleReactionLog({
    reaction,
    user,
    type: 'added'
  });
}

export async function handleReactionRemove(reaction, user) {
  await handleReactionLog({
    reaction,
    user,
    type: 'removed'
  });
}

async function handleReactionLog({ reaction, user, type }) {
  if (user.bot) return;

  const fullReaction = await fetchReactionIfPartial(reaction);
  if (!fullReaction) return;

  const message = fullReaction.message;
  const cooldownKey = [
  user.id,
  message.id,
  fullReaction.emoji.id ?? fullReaction.emoji.name
].join(':');

const lastLoggedAt = recentReactionLogs.get(cooldownKey);

if (
  lastLoggedAt &&
  Date.now() - lastLoggedAt < REACTION_LOG_COOLDOWN_MS
) {
  return;
}

recentReactionLogs.set(cooldownKey, Date.now());

setTimeout(() => {
  recentReactionLogs.delete(cooldownKey);
}, REACTION_LOG_COOLDOWN_MS);

  const logChannel = await message.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find message log channel.');
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const isAdded = type === 'added';

  const embed = new EmbedBuilder()
    .setColor(isAdded ? ADD_COLOUR : REMOVE_COLOUR)
    .setTitle(isAdded ? '➕ Reaction Added' : '➖ Reaction Removed')
    .addFields(
      {
        name: '👤 User',
        value:
          `<@${user.id}>\n` +
          `Username: ${user.tag}`,
        inline: false
      },
      {
        name: '😀 Reaction',
        value: formatEmoji(fullReaction),
        inline: true
      },
      {
        name: '📍 Channel',
        value: `<#${message.channel.id}>`,
        inline: true
      },
      {
        name: isAdded ? '🕒 Added' : '🕒 Removed',
        value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
        inline: false
      },
      {
        name: '💬 Message',
        value: formatMessageContent(message),
        inline: false
      }
    )
    .setFooter({ text: `🆔 Message ID: ${message.id}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Jump to Message')
      .setStyle(ButtonStyle.Link)
      .setURL(message.url)
  );

  await logChannel.send({
    embeds: [embed],
    components: [row]
  });
}

async function fetchReactionIfPartial(reaction) {
  if (!reaction.partial) return reaction;

  try {
    return await reaction.fetch();
  } catch {
    return null;
  }
}

function formatEmoji(reaction) {
  const emoji = reaction.emoji;

  if (emoji.id) {
    return `<:${emoji.name}:${emoji.id}>\n${emoji.name}`;
  }

  return emoji.name;
}

function formatMessageContent(message) {
  const content = message.content?.trim();

  if (!content) return '> *(No text content)*';

  const trimmed =
    content.length > MAX_CONTENT_LENGTH
      ? `${content.slice(0, MAX_CONTENT_LENGTH - 3)}...`
      : content;

  return trimmed
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}
