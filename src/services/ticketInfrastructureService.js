import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';
import {
  GUILD_CONFIG_KEYS,
  getConfigValue,
  setConfigValue
} from './guildConfigService.js';

export async function ensureTicketInfrastructure(guild, updatedBy) {
  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Pank needs Manage Channels to create ticket infrastructure.');
  }

  const staffRoleId = getConfigValue(
    guild.id,
    GUILD_CONFIG_KEYS.STAFF_ROLE_ID
  );
  const staffRole = staffRoleId
    ? guild.roles.cache.get(staffRoleId)
    : null;

  if (!staffRole) {
    throw new Error('Configure the Moderator role before setting up tickets.');
  }

  const privateOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: staffRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: botMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  let tickets = resolveCategory(
    guild,
    getConfigValue(guild.id, GUILD_CONFIG_KEYS.TICKET_CATEGORY_ID)
  );
  if (!tickets) {
    tickets = await guild.channels.create({
      name: 'Tickets',
      type: ChannelType.GuildCategory,
      permissionOverwrites: privateOverwrites,
      reason: 'Pank ticket infrastructure setup'
    });
  }
  await tickets.setPosition(0).catch(() => null);

  let staff = resolveCategory(
    guild,
    getConfigValue(guild.id, GUILD_CONFIG_KEYS.TICKET_STAFF_CATEGORY_ID)
  );
  if (!staff) {
    staff = await guild.channels.create({
      name: 'Ticket Staff',
      type: ChannelType.GuildCategory,
      permissionOverwrites: privateOverwrites,
      reason: 'Pank ticket infrastructure setup'
    });
  }
  await staff.setPosition(1).catch(() => null);

  let closed = resolveCategory(
    guild,
    getConfigValue(guild.id, GUILD_CONFIG_KEYS.CLOSED_TICKET_CATEGORY_ID)
  );
  if (!closed) {
    closed = await guild.channels.create({
      name: 'Closed Tickets',
      type: ChannelType.GuildCategory,
      permissionOverwrites: privateOverwrites,
      reason: 'Pank ticket infrastructure setup'
    });
  }
  await closed.setPosition(2).catch(() => null);

  let log = resolveTextChannel(
    guild,
    getConfigValue(guild.id, GUILD_CONFIG_KEYS.TICKET_LOG_CHANNEL_ID)
  );
  if (!log) {
    log = await guild.channels.create({
      name: 'ticket-logs',
      type: ChannelType.GuildText,
      parent: closed.id,
      permissionOverwrites: privateOverwrites,
      reason: 'Pank ticket infrastructure setup'
    });
  }

  saveConfig(guild.id, updatedBy, {
    [GUILD_CONFIG_KEYS.TICKET_CATEGORY_ID]: tickets.id,
    [GUILD_CONFIG_KEYS.TICKET_STAFF_CATEGORY_ID]: staff.id,
    [GUILD_CONFIG_KEYS.CLOSED_TICKET_CATEGORY_ID]: closed.id,
    [GUILD_CONFIG_KEYS.TICKET_LOG_CHANNEL_ID]: log.id
  });

  return { tickets, staff, closed, log, staffRole };
}

export async function ensureTicketPanel(
  guild,
  updatedBy,
  { refresh = false } = {}
) {
  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Pank needs Manage Channels to create the ticket panel.');
  }

  await ensureTicketInfrastructure(guild, updatedBy);

  let channel = resolveTextChannel(
    guild,
    getConfigValue(guild.id, GUILD_CONFIG_KEYS.TICKET_PANEL_CHANNEL_ID)
  );

  if (!channel) {
    channel = await guild.channels.create({
      name: 'open-a-ticket',
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory
          ],
          deny: [
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.CreatePublicThreads,
            PermissionFlagsBits.CreatePrivateThreads
          ]
        },
        {
          id: botMember.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.EmbedLinks
          ]
        }
      ],
      reason: 'Pank public ticket panel'
    });
  }

  let message = null;
  const savedMessageId = getConfigValue(
    guild.id,
    GUILD_CONFIG_KEYS.TICKET_PANEL_MESSAGE_ID
  );

  if (!refresh && savedMessageId) {
    message = await channel.messages.fetch(savedMessageId).catch(() => null);
  }

  if (!message) {
    const embed = new EmbedBuilder()
      .setTitle('ð« Private Support Tickets')
      .setDescription(
        [
          'Need to speak privately with the moderation team?',
          '',
          'Press **Open a Ticket** below. Pank will create a private channel that only you, Pank and authorised moderators can access.',
          '',
          'Moderator replies are sent through Pank so individual moderator identities remain private.'
        ].join('\n')
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket-public:open')
        .setLabel('Open a Ticket')
        .setEmoji('ð«')
        .setStyle(ButtonStyle.Primary)
    );

    message = await channel.send({ embeds: [embed], components: [row] });
    await message.pin('Pank ticket panel').catch(() => null);
  }

  saveConfig(guild.id, updatedBy, {
    [GUILD_CONFIG_KEYS.TICKET_PANEL_CHANNEL_ID]: channel.id,
    [GUILD_CONFIG_KEYS.TICKET_PANEL_MESSAGE_ID]: message.id
  });

  return { channel, message };
}

function resolveCategory(guild, id) {
  const channel = id ? guild.channels.cache.get(id) : null;
  return channel?.type === ChannelType.GuildCategory ? channel : null;
}

function resolveTextChannel(guild, id) {
  const channel = id ? guild.channels.cache.get(id) : null;
  return channel?.type === ChannelType.GuildText ? channel : null;
}

function saveConfig(guildId, updatedBy, values) {
  for (const [key, value] of Object.entries(values)) {
    setConfigValue({ guildId, key, value, updatedBy });
  }
}
