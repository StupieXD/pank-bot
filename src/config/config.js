import 'dotenv/config';

export const config = {
  discordToken: process.env.DISCORD_TOKEN,

  purgeLogChannelId: process.env.PURGE_LOG_CHANNEL_ID,

  messageLogChannelId: process.env.MESSAGE_LOG_CHANNEL_ID,

  maxCachedMessages: parsePositiveInteger(
    process.env.MAX_CACHED_MESSAGES,
    5000
  ),

  environment: process.env.NODE_ENV || 'production'
};

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}
