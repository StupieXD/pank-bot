import { Events } from 'discord.js';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
  if (interaction.isChatInputCommand()) {
    await handleChatInputCommand(interaction);
    return;
  }

  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
  }
}

async function handleChatInputCommand(interaction) {
  const command = interaction.client.commands?.get(
    interaction.commandName
  );

  if (!command) {
    console.warn(
      `⚠️ No command handler found for /${interaction.commandName}`
    );

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '❌ This command is currently unavailable.',
        ephemeral: true
      });
    }

    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(
      `❌ Failed to execute /${interaction.commandName}:`,
      error
    );

    const response = {
      content:
        '❌ Something went wrong while running this command.',
      ephemeral: true
    };

    if (
      interaction.replied ||
      interaction.deferred
    ) {
      await interaction
        .followUp(response)
        .catch(() => null);
    } else {
      await interaction
        .reply(response)
        .catch(() => null);
    }
  }
}

async function handleButtonInteraction(interaction) {
  for (
    const command of interaction.client.commands?.values() ?? []
  ) {
    if (typeof command.handleButton !== 'function') {
      continue;
    }

    const handled = await command.handleButton(
      interaction
    );

    if (handled !== false) {
      return;
    }
  }

  console.warn(
    `⚠️ No button handler found for ${interaction.customId}`
  );
}
