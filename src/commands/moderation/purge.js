import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  executePurge,
  handlePurgeButton
} from '../../services/purgeService.js';

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Delete recent messages with optional filters.')
  .addIntegerOption((option) =>
    option
      .setName('amount')
      .setDescription('Number of recent messages to scan')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(100)
  )
  .addStringOption((option) =>
    option
      .setName('after')
      .setDescription('Delete messages sent after this message ID')
      .setRequired(false)
  )
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Only delete messages from this user')
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for the purge')
      .setMaxLength(200)
  )
  .addStringOption((option) =>
    option
      .setName('contains')
      .setDescription('Only delete messages containing this text')
      .setMaxLength(100)
  )
  .addBooleanOption((option) =>
    option
      .setName('bots_only')
      .setDescription('Only delete messages from bots')
  )
  .addBooleanOption((option) =>
    option
      .setName('attachments_only')
      .setDescription('Only delete messages with attachments')
  )
  .addBooleanOption((option) =>
    option
      .setName('links_only')
      .setDescription('Only delete messages containing links')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false);

export async function execute(interaction) {
  return executePurge(interaction);
}

export async function handleButton(interaction) {
  return handlePurgeButton(interaction);
}
