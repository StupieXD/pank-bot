import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';

import { rememberPurgeAction } from './purgeContext.js';
import {
  deletePendingPurge,
  getPendingPurge,
  savePendingPurge
} from './purgeConfirmationContext.js';

const LINK_REGEX = /(https?:\/\/|www\.|discord\.gg|discord\.com\/invite)/i;

export async function executePurge(interaction) {
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
    messagesToDelete = messagesToDelete.filter(
      (message) => message.author.id === targetUser.id
    );
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
    messagesToDelete = messagesToDelete.filter((message) =>
      LINK_REGEX.test(message.content)
    );
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
    scannedAmount: amount,
    reason,
    filters: {
      requestedAmount: amount,
      user: targetUser
        ? {
            username: targetUser.username,
            tag: targetUser.tag,
            id: targetUser.id
          }
        : null,
      contains: contains || null,
      botsOnly,
      attachmentsOnly,
      linksOnly
    }
  };

  if (messagesToDelete.length >= 20) {
    const confirmationId = `purge_${interaction.id}`;

    savePendingPurge(confirmationId, purgeData);

    return interaction.editReply({
      embeds: [buildConfirmEmbed(purgeData)],
      components: [buildConfirmRow(confirmationId, messagesToDelete.length, false)]
    });
  }

  const deletedCount = await runPurge(purgeData);

  return interaction.editReply({
    content: buildSuccessMessage({
      deletedCount,
      scannedAmount: amount,
      reason
    })
  });
}

export async function handlePurgeButton(interaction) {
  const isConfirm = interaction.customId.startsWith('confirm_purge_');
  const isCancel = interaction.customId.startsWith('cancel_purge_');

  if (!isConfirm && !isCancel) return;

  const confirmationId = interaction.customId
    .replace('confirm_', '')
    .replace('cancel_', '');

  const purgeData = getPendingPurge(confirmationId);

  if (!purgeData) {
    return interaction.reply({
      content:
        '⌛ This confirmation has expired.\n\nRun `/purge` again if you still want to delete these messages.',
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
      content: '❌ **Purge Cancelled**\n\nNo messages were deleted.',
      embeds: [],
      components: [
        buildConfirmRow(confirmationId, purgeData.messagesToDelete.length, true)
      ]
    });
  }

  const deletedCount = await runPurge(purgeData);

  deletePendingPurge(confirmationId);

  return interaction.update({
    content: buildSuccessMessage({
      deletedCount,
      scannedAmount: purgeData.scannedAmount,
      reason: purgeData.reason
    }),
    embeds: [],
    components: [
      buildConfirmRow(confirmationId, purgeData.messagesToDelete.length, true)
    ]
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

  const deleted = await purgeData.channel.bulkDelete(purgeData.messagesToDelete, true);

  return deleted.size;
}

function buildConfirmEmbed(purgeData) {
  const filters = purgeData.filters;

  return new EmbedBuilder()
    .setTitle('⚠️ Confirm Purge')
    .setDescription('Please review this purge before confirming.')
    .addFields(
      {
        name: '📍 Channel',
        value: `<#${purgeData.channelId}>`,
        inline: false
      },
      {
        name: '🗑️ Messages to delete',
        value: String(purgeData.messagesToDelete.length),
        inline: true
      },
      {
        name: '🔎 Messages scanned',
        value: String(purgeData.scannedAmount),
        inline: true
      },
      {
        name: '📝 Reason',
        value: purgeData.reason,
        inline: false
      },
      {
        name: '🔍 Filters',
        value:
          `User: ${filters.user ? `${filters.user.tag} (${filters.user.id})` : 'Any'}\n` +
          `Contains: ${filters.contains ?? 'None'}\n` +
          `Bots only: ${filters.botsOnly ? 'Yes' : 'No'}\n` +
          `Attachments only: ${filters.attachmentsOnly ? 'Yes' : 'No'}\n` +
          `Links only: ${filters.linksOnly ? 'Yes' : 'No'}`,
        inline: false
      }
    )
    .setFooter({ text: 'This confirmation expires in 30 seconds.' });
}

function buildConfirmRow(confirmationId, deleteCount, disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_${confirmationId}`)
      .setLabel(`Delete ${deleteCount} Messages`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`cancel_${confirmationId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

function buildSuccessMessage({ deletedCount, scannedAmount, reason }) {
  return (
    `✅ **Purge Complete**\n\n` +
    `🗑️ **Deleted**\n${deletedCount} message${deletedCount === 1 ? '' : 's'}\n\n` +
    `🔎 **Scanned**\n${scannedAmount} recent messages\n\n` +
    `📝 **Reason**\n${reason}`
  );
}
