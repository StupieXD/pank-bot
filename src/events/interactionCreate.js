import { Events } from 'discord.js';
import * as purgeCommand from '../commands/moderation/purge.js';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'purge') {
      await purgeCommand.execute(interaction);
    }

    return;
  }

  if (interaction.isButton()) {
    if (
      interaction.customId.startsWith('confirm_purge_') ||
      interaction.customId.startsWith('cancel_purge_')
    ) {
      await purgeCommand.handlePurgeButton(interaction);
    }
  }
}
