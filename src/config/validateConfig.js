import { config } from './config.js';

export function validateConfig() {
  const missing = [];

  if (!config.discordToken) missing.push('DISCORD_TOKEN');
  if (!config.purgeLogChannelId) missing.push('PURGE_LOG_CHANNEL_ID');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
