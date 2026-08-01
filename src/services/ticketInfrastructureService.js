import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { GUILD_CONFIG_KEYS, getConfigValue, setConfigValue } from './guildConfigService.js';

export async function ensureTicketInfrastructure(guild, updatedBy) {
  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Pank needs Manage Channels to create ticket infrastructure.');
  }

  const staffRoleId = getConfigValue(guild.id, GUILD_CONFIG_KEYS.STAFF_ROLE_ID);
  if (!staffRoleId || !guild.roles.cache.has(staffRoleId)) {
    throw new Error('Configure the Moderator role before setting up tickets.');
  }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
    { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
  ];

  let tickets = resolveCategory(guild, getConfigValue(guild.id, GUILD_CONFIG_KEYS.TICKET_CATEGORY_ID));
  if (!tickets) tickets = await guild.channels.create({ name: 'Tickets', type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: 'Pank ticket infrastructure setup' });
  await tickets.setPosition(0).catch(() => null);

  let closed = resolveCategory(guild, getConfigValue(guild.id, GUILD_CONFIG_KEYS.CLOSED_TICKET_CATEGORY_ID));
  if (!closed) closed = await guild.channels.create({ name: 'Closed Tickets', type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: 'Pank ticket infrastructure setup' });
  await closed.setPosition(1).catch(() => null);

  let log = guild.channels.cache.get(getConfigValue(guild.id, GUILD_CONFIG_KEYS.TICKET_LOG_CHANNEL_ID));
  if (!log || log.type !== ChannelType.GuildText) {
    log = await guild.channels.create({ name: 'ticket-logs', type: ChannelType.GuildText, parent: closed.id, permissionOverwrites: overwrites, reason: 'Pank ticket infrastructure setup' });
  }

  setConfigValue({ guildId: guild.id, key: GUILD_CONFIG_KEYS.TICKET_CATEGORY_ID, value: tickets.id, updatedBy });
  setConfigValue({ guildId: guild.id, key: GUILD_CONFIG_KEYS.CLOSED_TICKET_CATEGORY_ID, value: closed.id, updatedBy });
  setConfigValue({ guildId: guild.id, key: GUILD_CONFIG_KEYS.TICKET_LOG_CHANNEL_ID, value: log.id, updatedBy });

  return { tickets, closed, log };
}

function resolveCategory(guild, id) {
  const channel = id ? guild.channels.cache.get(id) : null;
  return channel?.type === ChannelType.GuildCategory ? channel : null;
}
