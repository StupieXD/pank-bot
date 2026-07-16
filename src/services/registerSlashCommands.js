import {
  REST,
  Routes
} from 'discord.js';

import { config } from '../config/config.js';

export async function registerSlashCommands(client) {
  if (!client.commands) {
    throw new Error(
      'Commands have not been loaded before registration.'
    );
  }

  const commands = [
    ...client.commands.values()
  ].map((command) =>
    command.data.toJSON()
  );

  const rest = new REST({
    version: '10'
  }).setToken(config.discordToken);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    {
      body: commands
    }
  );

  console.log(
    `✅ Registered ${commands.length} slash commands.`
  );
}
