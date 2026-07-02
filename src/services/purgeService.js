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
  const reason = interaction.options.getString('reason') || null;
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
    scannedAmount: amount,
    reason: reason || 'No reason provided',
    displayReason: reason,
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
      reason: purgeData.reason
    })
  });
}

export async function handlePurgeButton(interaction) {
  const isConfirm = interaction.customId.startsWith('confirm_purge_');
  const isCancel = interaction.customId.startsWith('cancel_purge_');

  if (!isConfirm && !isCancel) return;

  const confirmationId = interaction.customId.replace('confirm_', '').replace('cancel_', '');

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
      components: [buildConfirmRow(confirmationId, purgeData.messagesToDelete.length, true)]
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
    components: [buildConfirmRow(confirmationId, purgeData.messagesToDelete.length, true)]
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
  const fields = [
    {
      name: '📍 Channel',
      value: `<#${purgeData.channelId}>`,
      inline: false
    },
    {
      name: '🗑️ Messages Found',
      value: String(purgeData.messagesToDelete.length),
      inline: true
    },
    {
      name: '👤 Requested by',
      value: `${purgeData.moderator.tag}`,
      inline: true
    }
  ];

  if (purgeData.displayReason) {
    fields.push({
      name: '📝 Reason',
      value: purgeData.displayReason,
      inline: false
    });
  }

  fields.push({
    name: '🔍 Filters',
    value: buildFiltersText(purgeData.filters),
    inline: false
  });

  fields.push({
    name: '👀 Preview',
    value: buildPreviewText(purgeData.messagesToDelete),
    inline: false
  });

  fields.push({
    name: '⚠️ Note',
    value: 'Messages older than 14 days cannot be bulk deleted.',
    inline: false
  });

  return new EmbedBuilder()
    .setTitle('⚠️ Confirm Purge')
    .setDescription('Please review this purge before continuing.')
    .addFields(fields)
    .setFooter({ text: '⏳ This confirmation expires in 30 seconds.' });
}

function buildFiltersText(filters) {
  const activeFilters = [];

  if (filters.user) activeFilters.push(`User: ${filters.user.tag} (${filters.user.id})`);
  if (filters.contains) activeFilters.push(`Contains: ${filters.contains}`);
  if (filters.botsOnly) activeFilters.push('Bots only');
  if (filters.attachmentsOnly) activeFilters.push('Attachments only');
  if (filters.linksOnly) activeFilters.push('Links only');

  return activeFilters.length > 0 ? activeFilters.join('\n') : 'None';
}

function buildPreviewText(messages) {
  const previewMessages = messages.slice(0, 5);

  const preview = previewMessages.map((message) => {
    const author = message.author?.tag || 'Unknown user';
    const content = message.content?.trim() || '[No text content]';
    const shortenedContent = content.length > 80 ? `${content.slice(0, 77)}...` : content;

    return `**${author}**\n${shortenedContent}`;
  });

  const remaining = messages.length - previewMessages.length;

  if (remaining > 0) {
    preview.push(`+${remaining} more message${remaining === 1 ? '' : 's'}...`);
  }

  return preview.join('\n\n');
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
