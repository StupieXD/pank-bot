import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import {
  GUILD_CONFIG_KEYS,
  getConfig,
  resetConfigValue,
  setConfigValue
} from '../../services/guildConfigService.js';
import { requireManageGuild } from '../../utils/permissionChecks.js';
import { ensureTicketInfrastructure } from '../../services/ticketInfrastructureService.js';

const SETTING_CHOICES = [
  ['Moderator role', GUILD_CONFIG_KEYS.STAFF_ROLE_ID],
  ['Tickets category', GUILD_CONFIG_KEYS.TICKET_CATEGORY_ID],
  ['Closed tickets category', GUILD_CONFIG_KEYS.CLOSED_TICKET_CATEGORY_ID],
  ['Ticket log channel', GUILD_CONFIG_KEYS.TICKET_LOG_CHANNEL_ID],
  ['Anonymous Q&A recipient', GUILD_CONFIG_KEYS.ANONYMOUS_QA_RECIPIENT_ID],
  ['Anonymous Q&A override role', GUILD_CONFIG_KEYS.ANONYMOUS_QA_OVERRIDE_ROLE_ID],
  ['Emergency announcement channel', GUILD_CONFIG_KEYS.EMERGENCY_CHANNEL_ID]
];

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('View or update Pank server configuration.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('view')
      .setDescription('View the current Pank configuration.')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('set-role')
      .setDescription('Set a role-based configuration value.')
      .addStringOption((option) =>
        option
          .setName('setting')
          .setDescription('The role setting to update')
          .setRequired(true)
          .addChoices(
            { name: 'Moderator role', value: GUILD_CONFIG_KEYS.STAFF_ROLE_ID },
            { name: 'Anonymous Q&A override role', value: GUILD_CONFIG_KEYS.ANONYMOUS_QA_OVERRIDE_ROLE_ID }
          )
      )
      .addRoleOption((option) =>
        option
          .setName('role')
          .setDescription('The role to use')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('set-channel')
      .setDescription('Set a channel-based configuration value.')
      .addStringOption((option) =>
        option
          .setName('setting')
          .setDescription('The channel setting to update')
          .setRequired(true)
          .addChoices(
            { name: 'Ticket log channel', value: GUILD_CONFIG_KEYS.TICKET_LOG_CHANNEL_ID },
            { name: 'Emergency announcement channel', value: GUILD_CONFIG_KEYS.EMERGENCY_CHANNEL_ID }
          )
      )
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('The channel to use')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('set-category')
      .setDescription('Set a category-based configuration value.')
      .addStringOption((option) =>
        option
          .setName('setting')
          .setDescription('The category setting to update')
          .setRequired(true)
          .addChoices(
            { name: 'Tickets category', value: GUILD_CONFIG_KEYS.TICKET_CATEGORY_ID },
            { name: 'Closed tickets category', value: GUILD_CONFIG_KEYS.CLOSED_TICKET_CATEGORY_ID }
          )
      )
      .addChannelOption((option) =>
        option
          .setName('category')
          .setDescription('The category to use')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('set-user')
      .setDescription('Set a user-based configuration value.')
      .addStringOption((option) =>
        option
          .setName('setting')
          .setDescription('The user setting to update')
          .setRequired(true)
          .addChoices(
            { name: 'Anonymous Q&A recipient', value: GUILD_CONFIG_KEYS.ANONYMOUS_QA_RECIPIENT_ID }
          )
      )
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The user to use')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('setup-tickets')
      .setDescription('Automatically create and configure ticket categories and logs.')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('reset')
      .setDescription('Reset one configuration value.')
      .addStringOption((option) =>
        option
          .setName('setting')
          .setDescription('The setting to reset')
          .setRequired(true)
          .addChoices(...SETTING_CHOICES.map(([name, value]) => ({ name, value })))
      )
  );

export async function execute(interaction) {
  const permissionError = requireManageGuild(interaction);
  if (permissionError) {
    await interaction.reply({ content: `Error: ${permissionError}`, flags: MessageFlags.Ephemeral });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'view') {
    await showConfig(interaction);
    return;
  }

  if (subcommand === 'setup-tickets') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await ensureTicketInfrastructure(interaction.guild, interaction.user.id);
    await interaction.editReply({ content: `Success: Ticket infrastructure is ready.\nOpen: <#${result.tickets.id}>\nClosed: <#${result.closed.id}>\nLogs: <#${result.log.id}>`, allowedMentions: { parse: [] } });
    return;
  }

  if (subcommand === 'reset') {
    const key = interaction.options.getString('setting', true);
    const removed = resetConfigValue(interaction.guildId, key);
    await interaction.reply({
      content: removed ? `Success: Reset **${labelFor(key)}**.` : `No value was saved for **${labelFor(key)}**.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const key = interaction.options.getString('setting', true);
  const value = getSelectedValue(interaction, subcommand);

  setConfigValue({
    guildId: interaction.guildId,
    key,
    value: value.id,
    updatedBy: interaction.user.id
  });

  await interaction.reply({
    content: `Success: **${labelFor(key)}** is now set to ${mentionFor(key, value.id)}.`,
    flags: MessageFlags.Ephemeral
  });
}

async function showConfig(interaction) {
  const config = getConfig(interaction.guildId);
  const lines = SETTING_CHOICES.map(([label, key]) =>
    `**${label}:** ${config[key] ? mentionFor(key, config[key]) : 'Not configured'}`
  );

  await interaction.reply({
    content: ['## Pank Server Configuration', ...lines].join('\n'),
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] }
  });
}

function getSelectedValue(interaction, subcommand) {
  if (subcommand === 'set-role') return interaction.options.getRole('role', true);
  if (subcommand === 'set-channel') return interaction.options.getChannel('channel', true);
  if (subcommand === 'set-category') return interaction.options.getChannel('category', true);
  if (subcommand === 'set-user') return interaction.options.getUser('user', true);
  throw new Error(`Unsupported config subcommand: ${subcommand}`);
}

function labelFor(key) {
  return SETTING_CHOICES.find(([, value]) => value === key)?.[0] ?? key;
}

function mentionFor(key, id) {
  if (key.endsWith('_role_id')) return `<@&${id}>`;
  if (key.endsWith('_channel_id') || key.endsWith('_category_id')) return `<#${id}>`;
  if (key.endsWith('_recipient_id')) return `<@${id}>`;
  return `\`${id}\``;
}
