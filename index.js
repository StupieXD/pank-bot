import 'dotenv/config';
import {
  AttachmentBuilder,
  AuditLogEvent,
  Client,
  Events,
  GatewayIntentBits,
  Partials
} from 'discord.js';

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
  const logChannelId = process.env.PURGE_LOG_CHANNEL_ID;
  const logChannel = await client.channels.fetch(logChannelId).catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find purge log channel.');
    return;
  }

  const cachedMessages = [...messages.values()]
    .filter(message => !message.author?.bot)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const moderator = channel.guild
    ? await findModerator(channel.guild, channel.id)
    : null;

  const lines = [];

  lines.push(`PURGE LOG`);
  lines.push(`Channel: #${channel.name} (${channel.id})`);
  lines.push(`Deleted messages: ${messages.size}`);
  lines.push(`Cached non-bot messages logged: ${cachedMessages.length}`);
  lines.push(`Moderator: ${moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown'}`);
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('------------------------------');
  lines.push('');

  for (const message of cachedMessages) {
    const username = message.author?.tag ?? 'Unknown user';
    const displayName = message.member?.displayName ?? message.author?.username ?? 'Unknown display name';
    const userId = message.author?.id ?? 'Unknown ID';
    const timestamp = message.createdAt ? message.createdAt.toISOString() : 'Unknown timestamp';
    const content = message.content?.trim() || '[No text content]';

    lines.push(`User: ${username}`);
    lines.push(`Display name: ${displayName}`);
    lines.push(`User ID: ${userId}`);
    lines.push(`Channel: #${channel.name}`);
    lines.push(`Timestamp: ${timestamp}`);
    lines.push(`Message: ${content}`);

    if (message.attachments?.size > 0) {
      lines.push('Attachments:');
      for (const attachment of message.attachments.values()) {
        lines.push(`- ${attachment.url}`);
      }
    }

    lines.push('');
    lines.push('------------------------------');
    lines.push('');
  }

  if (cachedMessages.length === 0) {
    lines.push('No cached non-bot messages were available for this purge.');
  }

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
      content: `🧹 **Bulk purge detected in #${channel.name}**\nDeleted messages: **${messages.size}**\nModerator: **${moderator ? moderator.tag : 'Unknown'}**\nFull log attached.`,
      files: [file]
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
