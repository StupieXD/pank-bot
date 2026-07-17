import {
  Events,
  MessageFlags
} from 'discord.js';

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
      `No command handler found for /${interaction.commandName}`
    );

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '\u274c This command is currently unavailable.',
        flags: MessageFlags.Ephemeral
      });
    }

    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(
      `Failed to execute /${interaction.commandName}:`,
      error
    );

    const response = {
      content:
        '\u274c Something went wrong while running this command.',
      flags: MessageFlags.Ephemeral
    };

    if (interaction.replied || interaction.deferred) {
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
  const commands =
    interaction.client.commands?.values() ?? [];

  for (const command of commands) {
    if (typeof command.handleButton !== 'function') {
      continue;
    }

    try {
      const handled = await command.handleButton(
        interaction
      );

      if (handled === true) {
        return;
      }
    } catch (error) {
      console.error(
        `Failed to handle button ${interaction.customId}:`,
        error
      );

      await sendButtonError(interaction);
      return;
    }
  }

  console.warn(
    `No button handler found for ${interaction.customId}`
  );

  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({
      content:
        '\u274c This button is no longer available.',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function sendButtonError(interaction) {
  const content =
    '\u274c Something went wrong while using this button.';

  if (interaction.deferred) {
    await interaction
      .editReply({
        content,
        embeds: [],
        components: []
      })
      .catch(() => null);

    return;
  }

  if (interaction.replied) {
    await interaction
      .followUp({
        content,
        flags: MessageFlags.Ephemeral
      })
      .catch(() => null);

    return;
  }

  await interaction
    .reply({
      content,
      flags: MessageFlags.Ephemeral
    })
    .catch(() => null);
}
