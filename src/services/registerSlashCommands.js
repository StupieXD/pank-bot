import { REST, Routes } from 'discord.js';

import * as purgeCommand from '../commands/moderation/purge.js';
import * as warnCommand from '../commands/moderation/warn.js';
import { config } from '../config/config.js';

export async function registerSlashCommands(client) {
  const rest = new REST({ version: '10' }).setToken(
    config.discordToken
  );

  await rest.put(
    Routes.applicationCommands(client.user.id),
    {
      body: [
        purgeCommand.data.toJSON(),
        warnCommand.data.toJSON()
      ]
    }
  );

  console.log('✅ Slash commands registered');
}
