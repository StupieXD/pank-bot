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

const EMBED_COLOURS = {
  confirm: 0xf1c40f,
  success: 0x2ecc71,
  cancelled: 0xe67e22,
  error: 0xe74c3c
};

export async function executePurge(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(EMBED_COLOURS.error)
          .setTitle('❌ Permission Denied')
          .setDescription('You do not have permission to use this command.')
      ],
      ephemeral: true
    });
  }

  const amount = interaction.options.getInteger('amount');
  const afterMessageId = interaction.options.getString('after');
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || null;
  const contains = interaction.options.getString('contains');
  const botsOnly = interaction.options.getBoolean('bots_only') || false;
  const attachmentsOnly = interaction.options.getBoolean('attachments_only') || false;
  const linksOnly = interaction.options.getBoolean('links_only') || false;
  if (!amount && !afterMessageId) {
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(EMBED_COLOURS.error)
        .setTitle('❌ Missing Purge Target')
        .setDescription('You must provide either an amount or an "after" message ID.')
    ],
    ephemeral: true
  });
}
  await interaction.deferReply({ ephemeral: true });

  let fetchedMessages;

if (afterMessageId) {
  fetchedMessages = await fetchMessagesAfter(
    interaction.channel,
    afterMessageId,
    amount
  );
} else {
  fetchedMessages = await interaction.channel.messages.fetch({ limit: amount });
}
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
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(EMBED_COLOURS.error)
          .setTitle('❌ No Matching Messages')
          .setDescription('No matching messages were found to delete.')
      ]
    });
  }

  const purgeData = {
    interactionUserId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    channel: interaction.channel,
    moderator: interaction.user,
    messagesToDelete,
    scannedAmount: fetchedMessages.size,
    reason: reason || 'No reason provided',
    displayReason: reason,
    filters: {
      requestedAmount: amount,
      afterMessageId: afterMessageId || null,
      user: targetUser
        ? {
            username: targetUser.username,
            tag: targetUser.tag,
            displayName: targetUser.globalName || targetUser.username,
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
    embeds: [
      buildSuccessEmbed({
        deletedCount,
        scannedAmount: purgeData.scannedAmount,
        reason: purgeData.reason,
        moderator: interaction.user,
        channelId: interaction.channelId
      })
    ]
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
      embeds: [
        new EmbedBuilder()
          .setColor(EMBED_COLOURS.error)
          .setTitle('⌛ Confirmation Expired')
          .setDescription('Run `/purge` again if you still want to delete these messages.')
      ],
      ephemeral: true
    });
  }

  if (interaction.user.id !== purgeData.interactionUserId) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(EMBED_COLOURS.error)
          .setTitle('❌ Not Your Confirmation')
          .setDescription('Only the moderator who started this purge can use these buttons.')
      ],
      ephemeral: true
    });
  }

  if (isCancel) {
    deletePendingPurge(confirmationId);

    return interaction.update({
      embeds: [buildCancelledEmbed()],
      components: [
        buildConfirmRow(confirmationId, purgeData.messagesToDelete.length, true)
      ]
    });
  }

  const deletedCount = await runPurge(purgeData);

  deletePendingPurge(confirmationId);

  return interaction.update({
    embeds: [
      buildSuccessEmbed({
        deletedCount,
        scannedAmount: purgeData.scannedAmount,
        reason: purgeData.reason,
        moderator: purgeData.moderator,
        channelId: purgeData.channelId
      })
    ],
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
  filters: purgeData.filters,
  archivedMessages: purgeData.messagesToDelete.map((message) => ({
    id: message.id,
    username: message.author?.tag ?? 'Unknown user',
    displayName: message.member?.displayName ?? message.author?.globalName ?? message.author?.username ?? 'Unknown user',
    userId: message.author?.id ?? 'Unknown user ID',
    channelName: message.channel?.name ?? 'Unknown channel',
    channelId: message.channel?.id ?? 'Unknown channel ID',
    timestamp: message.createdAt?.toISOString() ?? new Date().toISOString(),
    content: message.content?.trim() || '[No text content]',
    attachments: [...message.attachments.values()].map((attachment) => attachment.url)
  }))
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
      value: getUserDisplayName(purgeData.moderator),
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
    .setColor(EMBED_COLOURS.confirm)
    .setTitle('⚠️ Confirm Purge')
    .setDescription('Please review this purge before continuing.')
    .addFields(fields)
    .setFooter({ text: '⏳ This confirmation expires in 30 seconds.' });
}

function buildSuccessEmbed({ deletedCount, scannedAmount, reason, moderator, channelId }) {
  return new EmbedBuilder()
    .setColor(EMBED_COLOURS.success)
    .setTitle('✅ Purge Complete')
    .addFields(
      {
        name: '🗑️ Deleted',
        value: `${deletedCount} message${deletedCount === 1 ? '' : 's'}`,
        inline: true
      },
      {
        name: '🔎 Scanned',
        value: `${scannedAmount} recent messages`,
        inline: true
      },
      {
        name: '📍 Channel',
        value: `<#${channelId}>`,
        inline: false
      },
      {
        name: '👤 Requested by',
        value: getUserDisplayName(moderator),
        inline: true
      },
      {
        name: '📝 Reason',
        value: reason,
        inline: false
      }
    );
}

function buildCancelledEmbed() {
  return new EmbedBuilder()
    .setColor(EMBED_COLOURS.cancelled)
    .setTitle('❌ Purge Cancelled')
    .setDescription('No messages were deleted.');
}

function buildConfirmRow(confirmationId, deleteCount, disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_${confirmationId}`)
      .setLabel(`🗑️ Delete ${deleteCount} Messages`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`cancel_${confirmationId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

function buildFiltersText(filters) {
  const activeFilters = [];
if (filters.afterMessageId) {
  activeFilters.push(`After message: ${filters.afterMessageId}`);
}
  if (filters.user) {
    activeFilters.push(`User: ${filters.user.displayName} (${filters.user.id})`);
  }

  if (filters.contains) {
    activeFilters.push(`Contains: "${filters.contains}"`);
  }

  if (filters.botsOnly) {
    activeFilters.push('Bots only');
  }

  if (filters.attachmentsOnly) {
    activeFilters.push('Attachments only');
  }

  if (filters.linksOnly) {
    activeFilters.push('Links only');
  }

  return activeFilters.length > 0 ? activeFilters.join('\n') : 'None';
}

function buildPreviewText(messages) {
  const previewMessages = messages.slice(0, 5);

  const preview = previewMessages.map((message) => {
    const author = getUserDisplayName(message.author);
    const content = getPreviewContent(message);

    return `**${author}**\n> ${content}`;
  });

  const remaining = messages.length - previewMessages.length;

  if (remaining > 0) {
    preview.push(`…and ${remaining} more message${remaining === 1 ? '' : 's'}`);
  }

  return preview.join('\n\n');
}

function getPreviewContent(message) {
  const text = message.content?.trim();

  if (text) {
    return shortenText(text, 80);
  }

  if (message.attachments?.size > 0) {
    return '[Attachment]';
  }

  if (message.embeds?.length > 0) {
    return '[Embed]';
  }

  if (message.stickers?.size > 0) {
    return '[Sticker]';
  }

  return '[No text content]';
}

function shortenText(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

async function fetchMessagesAfter(channel, afterMessageId, amountLimit) {
  const afterMessage = await channel.messages
    .fetch(afterMessageId)
    .catch(() => null);

  if (!afterMessage) {
    return new Map();
  }

  const collected = new Map();
  let before;

  while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    });

    if (batch.size === 0) break;

    for (const message of batch.values()) {
      if (message.id === afterMessageId) {
        return collected;
      }

      collected.set(message.id, message);

      if (amountLimit && collected.size >= amountLimit) {
        return collected;
      }
    }

    before = batch.last()?.id;
  }

  return collected;
}
function getUserDisplayName(user) {
  return user?.globalName || user?.displayName || user?.username || user?.tag || 'Unknown user';
}
