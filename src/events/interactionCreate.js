import {
  Events,
  MessageFlags
} from 'discord.js';

import {
  routeButtonInteraction,
  routeModalInteraction
} from '../services/interactionRouterService.js';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
  if (interaction.isChatInputCommand()) {
    await handleChatInputCommand(interaction);
    return;
  }

  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
    return;
  }

  if (interaction.isModalSubmit()) {
    await handleModalInteraction(interaction);
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
        content: 'Error: This command is currently unavailable.',
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

    await sendInteractionError(
      interaction,
      'Error: Something went wrong while running this command.'
    );
  }
}

async function handleButtonInteraction(interaction) {
  try {
    if (await routeButtonInteraction(interaction)) {
      return;
    }

    const commands = interaction.client.commands?.values() ?? [];

    for (const command of commands) {
      if (typeof command.handleButton !== 'function') continue;

      const handled = await command.handleButton(interaction);
      if (handled === true) return;
    }
  } catch (error) {
    console.error(
      `Failed to handle button ${interaction.customId}:`,
      error
    );

    await sendInteractionError(
      interaction,
      'Error: Something went wrong while using this button.'
    );
    return;
  }

  console.warn(`No button handler found for ${interaction.customId}`);

  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({
      content: 'Error: This button is no longer available.',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleModalInteraction(interaction) {
  try {
    if (await routeModalInteraction(interaction)) {
      return;
    }
  } catch (error) {
    console.error(
      `Failed to handle modal ${interaction.customId}:`,
      error
    );

    await sendInteractionError(
      interaction,
      'Error: Something went wrong while submitting this form.'
    );
    return;
  }

  console.warn(`No modal handler found for ${interaction.customId}`);

  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({
      content: 'Error: This form is no longer available.',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function sendInteractionError(interaction, content) {
  if (interaction.deferred) {
    await interaction.editReply({
      content,
      embeds: [],
      components: []
    }).catch(() => null);
    return;
  }

  if (interaction.replied) {
    await interaction.followUp({
      content,
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return;
  }

  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral
  }).catch(() => null);
}
