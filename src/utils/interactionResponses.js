import { MessageFlags } from 'discord.js';

export function successMessage(message) {
  return `Success: ${message}`;
}

export function errorMessage(message) {
  return `Error: ${message}`;
}

export async function replyEphemeral(interaction, content, options = {}) {
  const payload = {
    content,
    flags: MessageFlags.Ephemeral,
    ...options
  };

  if (interaction.deferred) {
    const { flags, ...editPayload } = payload;
    return interaction.editReply(editPayload);
  }

  if (interaction.replied) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}
