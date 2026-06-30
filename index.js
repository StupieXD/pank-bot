import 'dotenv/config';
import {
  AttachmentBuilder,
  AuditLogEvent,
  Client,
  Events,
  GatewayIntentBits,
  Partials
} from 'discord.js';

const messageCache = new Map();
const MAX_CACHED_MESSAGES = 5000;

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
  if (message.author.bot) return;

  messageCache.set(message.id, {
    id: message.id,
    username: message.author.tag,
    displayName: message.member?.displayName ?? message.author.username,
    userId: message.author.id,
    channelName: message.channel?.name ?? 'Unknown channel',
    channelId: message.channel?.id ?? 'Unknown channel ID',
    timestamp: message.createdAt?.toISOString() ?? new Date().toISOString(),
    content: message.content?.trim() || '[No text content]',
    attachments: [...message.attachments.values()].map(a => a.url)
  });

  if (messageCache.size > MAX_CACHED_MESSAGES) {
    const oldestKey = messageCache.keys().next().value;
    messageCache.delete(oldestKey);
  }
});

async function findModerator(guild, deletedChannelId) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MessageBulkDelete,
      limit: 5
    });

    const entry = logs.entries.find(log => {
      const recent = Date.now() - log.createdTimestamp < 10000;
      const sameChannel = log.extra?.channel?.id === deletedChannelId;
      return recent && sameChannel;
    });

    return entry?.executor ?? null;
  } catch {
    return null;
  }
}

client.on(Events.MessageBulkDelete, async (messages, channel) => {
  const logChannel = await client.channels.fetch(process.env.PURGE_LOG_CHANNEL_ID).catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find purge log channel.');
    return;
  }

  const moderator = channel.guild ? await findModerator(channel.guild, channel.id) : null;

  const lines = [];

  lines.push('PURGE LOG');
  lines.push(`Channel: #${channel.name} (${channel.id})`);
  lines.push(`Deleted messages: ${messages.size}`);
  lines.push(`Moderator: ${moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown'}`);
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('------------------------------');
  lines.push('');

  let loggedCount = 0;
  let uncachedCount = 0;

  for (const deletedMessage of messages.values()) {
    const cached = messageCache.get(deletedMessage.id);

    if (!cached) {
      uncachedCount++;

      lines.push(`Message ID: ${deletedMessage.id}`);
      lines.push('Status: Not cached, so content and author details are unavailable.');
      lines.push(`Channel: #${channel.name}`);
      lines.push('');
      lines.push('------------------------------');
      lines.push('');
      continue;
    }

    loggedCount++;

    lines.push(`User: ${cached.username}`);
    lines.push(`Display name: ${cached.displayName}`);
    lines.push(`User ID: ${cached.userId}`);
    lines.push(`Channel: #${cached.channelName} (${cached.channelId})`);
    lines.push(`Timestamp: ${cached.timestamp}`);
    lines.push(`Message: ${cached.content}`);

    if (cached.attachments.length > 0) {
      lines.push('Attachments:');
      for (const url of cached.attachments) {
        lines.push(`- ${url}`);
      }
    }

    lines.push('');
    lines.push('------------------------------');
    lines.push('');

    messageCache.delete(deletedMessage.id);
  }

  lines.splice(3, 0, `Cached messages logged: ${loggedCount}`);
  lines.splice(4, 0, `Uncached messages: ${uncachedCount}`);

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
      content: `🧹 **Bulk purge detected in #${channel.name}**\nDeleted messages: **${messages.size}**\nCached messages logged: **${loggedCount}**\nUncached messages: **${uncachedCount}**\nModerator: **${moderator ? moderator.tag : 'Unknown'}**\nFull log attached.`,
      files: [file]
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
