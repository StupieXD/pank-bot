import 'dotenv/config';

export const config = {
  discordToken: process.env.DISCORD_TOKEN,

  purgeLogChannelId: process.env.PURGE_LOG_CHANNEL_ID,

  messageLogChannelId: process.env.MESSAGE_LOG_CHANNEL_ID,

  environment: process.env.NODE_ENV || 'production'
};
