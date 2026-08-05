import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  beginLockdown,
  clearLockdownChannelStates,
  finishLockdown,
  getLockdownChannelStates,
  isLockdownActive,
  saveLockdownChannelState
} from '../../database/repositories/lockdownRepository.js';
import { GUILD_CONFIG_KEYS, getConfigValue } from '../../services/guildConfigService.js';

const INHERIT = -1;
const DENY = 0;
const ALLOW = 1;

export const data = new SlashCommandBuilder()
  .setName('lockdown')
  .setDescription('Enable, disable or check server-wide emergency lockdown.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('enable').setDescription('Lock all supported public channels.')
    .addStringOption((o) => o.setName('reason').setDescription('Reason for lockdown').setMaxLength(1000)))
  .addSubcommand((s) => s.setName('disable').setDescription('Restore the exact permissions saved by Pank.'))
  .addSubcommand((s) => s.setName('status').setDescription('Check whether lockdown is active.'));

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const action = interaction.options.getSubcommand();

  if (action === 'status') {
    return interaction.editReply({ content: isLockdownActive(interaction.guildId) ? 'Lockdown is currently **ACTIVE**.' : 'Lockdown is currently **inactive**.' });
  }

  if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.editReply({ content: 'Error: Pank needs Manage Channels.' });
  }

  if (action === 'enable') return enable(interaction);
  return disable(interaction);
}

async function enable(interaction) {
  if (isLockdownActive(interaction.guildId)) return interaction.editReply({ content: 'Error: Lockdown is already active.' });
  const reason = interaction.options.getString('reason')?.trim() || 'Emergency lockdown enabled.';
  clearLockdownChannelStates(interaction.guildId);
  beginLockdown({ guildId: interaction.guildId, enabledBy: interaction.user.id, reason });

  let changed = 0;
  let skipped = 0;
  const channels = interaction.guild.channels.cache.filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(c.type));
  for (const channel of channels.values()) {
    if (!channel.permissionOverwrites || !channel.permissionsFor(interaction.guild.members.me)?.has(PermissionFlagsBits.ManageChannels)) { skipped++; continue; }
    const ow = channel.permissionOverwrites.cache.get(interaction.guildId);
    saveLockdownChannelState({
      guildId: interaction.guildId,
      channelId: channel.id,
      sendMessagesState: state(ow, PermissionFlagsBits.SendMessages),
      sendMessagesInThreadsState: state(ow, PermissionFlagsBits.SendMessagesInThreads),
      createPublicThreadsState: state(ow, PermissionFlagsBits.CreatePublicThreads),
      createPrivateThreadsState: state(ow, PermissionFlagsBits.CreatePrivateThreads)
    });
    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false
      }, reason);
      changed++;
    } catch { skipped++; }
  }

  const emergencyId = getConfigValue(interaction.guildId, GUILD_CONFIG_KEYS.EMERGENCY_CHANNEL_ID);
  const emergency = emergencyId ? interaction.guild.channels.cache.get(emergencyId) : null;
  if (emergency?.isTextBased()) {
    await emergency.send({ content: `ð¨ **Server lockdown enabled**\nReason: ${reason}\nNew tickets and Anonymous Q&A submissions are temporarily paused.` }).catch(() => null);
  }
  return interaction.editReply({ content: `Success: Lockdown enabled.\nLocked: ${changed} channel(s)\nSkipped: ${skipped} channel(s)\nReason: ${reason}` });
}

async function disable(interaction) {
  if (!isLockdownActive(interaction.guildId)) return interaction.editReply({ content: 'Error: Lockdown is not active.' });
  const rows = getLockdownChannelStates(interaction.guildId);
  let restored = 0;
  let skipped = 0;
  for (const row of rows) {
    const channel = interaction.guild.channels.cache.get(row.channel_id);
    if (!channel?.permissionOverwrites) { skipped++; continue; }
    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: value(row.send_messages_state),
        SendMessagesInThreads: value(row.send_messages_in_threads_state),
        CreatePublicThreads: value(row.create_public_threads_state),
        CreatePrivateThreads: value(row.create_private_threads_state)
      }, 'Emergency lockdown disabled; restoring saved permissions.');
      restored++;
    } catch { skipped++; }
  }
  finishLockdown({ guildId: interaction.guildId, disabledBy: interaction.user.id });
  clearLockdownChannelStates(interaction.guildId);
  return interaction.editReply({ content: `Success: Lockdown disabled.\nRestored: ${restored} channel(s)\nSkipped: ${skipped} channel(s)` });
}

function state(overwrite, permission) {
  if (!overwrite) return INHERIT;
  if (overwrite.allow.has(permission)) return ALLOW;
  if (overwrite.deny.has(permission)) return DENY;
  return INHERIT;
}
function value(saved) { return saved === ALLOW ? true : saved === DENY ? false : null; }
