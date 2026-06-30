import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

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

client.once('ready', () => {
  console.log(`Pank is online as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
