import { randomUUID } from 'node:crypto';

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from 'discord.js';

import { registerButtonHandler } from './interactionRouterService.js';

const PREFIX = 'confirm:';
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const pending = new Map();
let initialised = false;

export function initialiseConfirmationService() {
  if (initialised) return;
  registerButtonHandler(PREFIX, handleConfirmationButton);
  initialised = true;
}

export function createConfirmation({
  userId,
  onConfirm,
  onCancel = null,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  ttlMs = DEFAULT_TTL_MS
}) {
  const token = randomUUID();
  const expiresAt = Date.now() + ttlMs;

  pending.set(token, {
    userId,
    onConfirm,
    onCancel,
    expiresAt
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}${token}:yes`)
      .setLabel(confirmLabel)
      .setStyle(danger ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}${token}:no`)
      .setLabel(cancelLabel)
      .setStyle(ButtonStyle.Secondary)
  );

  return { token, components: [row] };
}

async function handleConfirmationButton(interaction) {
  const [, token, choice] = interaction.customId.split(':');
  const context = pending.get(token);

  if (!context || context.expiresAt < Date.now()) {
    pending.delete(token);
    await interaction.reply({
      content: 'This confirmation has expired.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.user.id !== context.userId) {
    await interaction.reply({
      content: 'Only the person who started this action can use these buttons.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  pending.delete(token);

  if (choice === 'yes') {
    await context.onConfirm(interaction);
  } else if (context.onCancel) {
    await context.onCancel(interaction);
  } else {
    await interaction.update({
      content: 'Cancelled.',
      embeds: [],
      components: []
    });
  }
}
