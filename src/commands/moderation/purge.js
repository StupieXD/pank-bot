import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { rememberPurgeAction } from '../../services/purgeContext.js';
import {
  savePendingPurge,
  getPendingPurge,
  deletePendingPurge
} from '../../services/purgeConfirmationContext.js';

const LINK_REGEX = /(https?:\/\/|www\.|discord\.gg|discord\.com\/invite)/i;

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Delete recent messages with optional filters.')
  .addIntegerOption((option) =>
    option
      .setName('amount')
      .setDescription('Number of recent messages to scan')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  )
  .addUserOption((option) =>
    option.setName('user').setDescription('Only delete messages from this user')
  )
  .addStringOption((option) =>
    option.setName('reason').setDescription('Reason for the purge').setMaxLength(200)
  )
  .addStringOption((option) =>
    option.setName('contains').setDescription('Only delete messages containing this text').setMaxLength(100)
  )
  .addBooleanOption((option) =>
    option.setName('bots_only').setDescription('Only delete messages from bots')
  )
  .addBooleanOption((option) =>
    option.setName('attachments_only').setDescription('Only delete messages with attachments')
  )
  .addBooleanOption((option) =>
    option.setName('links_only').setDescription('Only delete messages containing links')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false);

export async function execute(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      content: '❌ You do not have permission to use this command.',
      ephemeral: true
    });
  }

  const amount = interaction.options.getInteger('amount');
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const contains = interaction.options.getString('contains');
  const botsOnly = interaction.options.getBoolean('bots_only') || false;
  const attachmentsOnly = interaction.options.getBoolean('attachments_only') || false;
  const linksOnly = interaction.options.getBoolean('links_only') || false;

  await interaction.deferReply({ ephemeral: true });

  const fetchedMessages = await interaction.channel.messages.fetch({ limit: amount });
  let messagesToDelete = [...fetchedMessages.values()];

  if (targetUser) {
    messagesToDelete = messagesToDelete.filter((message) => message.author.id === targetUser.id);
  }

  if (contains) {
    const searchText = contains.toLowerCase();
    messagesToDelete = messagesToDelete.filter((message) =>
      message.content.toLowerCase().includes(searchText)
    );
  }

  if (botsOnly) {
    messagesToDelete = messagesToDelete.filter((message) => message.author.bot);
  }

  if (attachmentsOnly) {
    messagesToDelete = messagesToDelete.filter((message) => message.attachments.size > 0);
  }

  if (linksOnly) {
    messagesToDelete = messagesToDelete.filter((message) => LINK_REGEX.test(message.content));
  }

  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  messagesToDelete = messagesToDelete.filter(
    (message) => message.createdTimestamp > fourteenDaysAgo
  );

  if (messagesToDelete.length === 0) {
    return interaction.editReply('No matching messages found to delete.');
  }

  const purgeData = {
    interactionUserId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    channel: interaction.channel,
    moderator: interaction.user,
    messagesToDelete,
    reason,
    filters: {
      requestedAmount: amount,
      user: targetUser ? { username: targetUser.username, id: targetUser.id } : null,
      contains: contains || null,
      botsOnly,
      attachmentsOnly,
      linksOnly
    }
  };

  if (messagesToDelete.length >= 20) {
    const confirmationId = `purge_${interaction.id}`;

    savePendingPurge(confirmationId, purgeData);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_${confirmationId}`)
        .setLabel(`Confirm purge ${messagesToDelete.length}`)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`cancel_${confirmationId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.editReply({
      content:
        `⚠️ **Confirm purge**\n\n` +
        `Messages found: **${messagesToDelete.length}**\n` +
        `Channel: <#${interaction.channelId}>\n` +
        `Reason: **${reason}**\n\n` +
        `This confirmation expires in 30 seconds.`,
      components: [row]
    });
  }

  await runPurge(purgeData);

  return interaction.editReply(
    `✅ Purge complete.\nDeleted: **${messagesToDelete.length}**\nScanned: **${amount}**\nReason: **${reason}**`
  );
}

export async function handlePurgeButton(interaction) {
  const isConfirm = interaction.customId.startsWith('confirm_purge_');
  const isCancel = interaction.customId.startsWith('cancel_purge_');

  if (!isConfirm && !isCancel) return;

  const confirmationId = interaction.customId.replace('confirm_', '').replace('cancel_', '');
  const purgeData = getPendingPurge(confirmationId);

  if (!purgeData) {
    return interaction.reply({
      content: 'This purge confirmation has expired.',
      ephemeral: true
    });
  }

  if (interaction.user.id !== purgeData.interactionUserId) {
    return interaction.reply({
      content: 'Only the moderator who started this purge can use these buttons.',
      ephemeral: true
    });
  }

  if (isCancel) {
    deletePendingPurge(confirmationId);

    return interaction.update({
      content: '❌ Purge cancelled.',
      components: []
    });
  }

  await runPurge(purgeData);
  deletePendingPurge(confirmationId);

  return interaction.update({
    content:
      `✅ Purge complete.\n` +
      `Deleted: **${purgeData.messagesToDelete.length}**\n` +
      `Reason: **${purgeData.reason}**`,
    components: []
  });
}

async function runPurge(purgeData) {
  rememberPurgeAction({
    guildId: purgeData.guildId,
    channelId: purgeData.channelId,
    moderator: purgeData.moderator,
    amount: purgeData.messagesToDelete.length,
    reason: purgeData.reason,
    filters: purgeData.filters
  });

  await purgeData.channel.bulkDelete(purgeData.messagesToDelete, true);
}
