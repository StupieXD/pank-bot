import 'dotenv/config';
import {
  AttachmentBuilder,
  AuditLogEvent,
  Client,
  Events,
  GatewayIntentBits,
  Partials
} from 'discord.js';

const MAX_CACHED_MESSAGES = 5000;
const messageCache = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.User
  ]
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Pank is online as ${client.user.tag}`);
});

client.on(Events.MessageCreate, (message) => {
  if (message.author?.bot) return;

  messageCache.set(message.id, {
    id: message.id,
    username: message.author.tag,
    displayName: message.member?.displayName ?? message.author.username,
    userId: message.author.id,
    channelName: message.channel?.name ?? 'Unknown channel',
    channelId: message.channel?.id ?? 'Unknown channel ID',
    timestamp: message.createdAt?.toISOString() ?? new Date().toISOString(),
    content: message.content?.trim() || '[No text content]',
    attachments: [...message.attachments.values()].map((attachment) => attachment.url)
  });

  if (messageCache.size > MAX_CACHED_MESSAGES) {
    const oldestMessageId = messageCache.keys().next().value;
    messageCache.delete(oldestMessageId);
  }
});

async function findModerator(guild, deletedChannelId, deletedCount) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MessageBulkDelete,
        limit: 10
      });

      const entry = logs.entries.find((log) => {
        const recent = Date.now() - log.createdTimestamp < 15000;
        const sameChannel = log.extra?.channel?.id === deletedChannelId;

        const similarCount =
          typeof log.extra?.count === 'number'
            ? Math.abs(log.extra.count - deletedCount) <= 2
            : true;

        return recent && sameChannel && similarCount;
      });

      if (entry?.executor) {
        return entry.executor;
      }
    } catch (error) {
      console.log(`Could not fetch audit logs: ${error.message}`);
      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return null;
}

client.on(Events.MessageBulkDelete, async (messages, channel) => {
  try {
    const logChannelId = process.env.PURGE_LOG_CHANNEL_ID;

    if (!logChannelId) {
      console.log('❌ PURGE_LOG_CHANNEL_ID is missing from .env');
      return;
    }

    const logChannel = await client.channels.fetch(logChannelId).catch(() => null);

    if (!logChannel) {
      console.log('❌ Could not find purge log channel.');
      return;
    }

    const moderator = channel.guild
      ? await findModerator(channel.guild, channel.id, messages.size)
      : null;

    const lines = [];

    lines.push('PURGE LOG');
    lines.push(`Channel: #${channel.name} (${channel.id})`);
    lines.push(`Deleted messages: ${messages.size}`);

    let loggedCount = 0;
    let uncachedCount = 0;
    const deletedMessageBlocks = [];

    const sortedMessages = [...messages.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp
    );

    for (const deletedMessage of sortedMessages) {
      const cached = messageCache.get(deletedMessage.id);

      if (!cached) {
        uncachedCount++;

        deletedMessageBlocks.push([
          `Message ID: ${deletedMessage.id}`,
          'Status: Not cached, so content and author details are unavailable.',
          `Channel: #${channel.name}`,
          '',
          '------------------------------',
          ''
        ].join('\n'));

        continue;
      }

      loggedCount++;

      const block = [];

      block.push(`User: ${cached.username}`);
      block.push(`Display name: ${cached.displayName}`);
      block.push(`User ID: ${cached.userId}`);
      block.push(`Channel: #${cached.channelName} (${cached.channelId})`);
      block.push(`Timestamp: ${cached.timestamp}`);
      block.push(`Message: ${cached.content}`);

      if (cached.attachments.length > 0) {
        block.push('Attachments:');

        for (const url of cached.attachments) {
          block.push(`- ${url}`);
        }
      }

      block.push('');
      block.push('------------------------------');
      block.push('');

      deletedMessageBlocks.push(block.join('\n'));
      messageCache.delete(deletedMessage.id);
    }

    lines.push(`Cached messages logged: ${loggedCount}`);
    lines.push(`Uncached messages: ${uncachedCount}`);
    lines.push(`Moderator: ${moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown'}`);
    lines.push(`Time: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('------------------------------');
    lines.push('');
    lines.push(...deletedMessageBlocks);

    const logText = lines.join('\n');

    if (logText.length <= 1900) {
      await logChannel.send({
        content: `🧹 **Bulk purge detected in #${channel.name}**\n\`\`\`\n${logText}\n\`\`\``
      });
    } else {
      const file = new AttachmentBuilder(Buffer.from(logText, 'utf8'), {
        name: `purge-log-${Date.now()}.txt`
      });

      await logChannel.send({
        content:
          `🧹 **Bulk purge detected in #${channel.name}**\n` +
          `Deleted messages: **${messages.size}**\n` +
          `Cached messages logged: **${loggedCount}**\n` +
          `Uncached messages: **${uncachedCount}**\n` +
          `Moderator: **${moderator ? moderator.tag : 'Unknown'}**\n` +
          `Full log attached.`,
        files: [file]
      });
    }
  } catch (error) {
    console.log(`❌ Error handling bulk delete: ${error.message}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
