import { Events } from 'discord.js';
import * as purgeCommand from '../commands/moderation/purge.js';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'purge') {
    await purgeCommand.execute(interaction);
  }
}
