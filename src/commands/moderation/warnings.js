import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import {
  getWarningsForUser
} from '../../services/moderationService.js';

const WARNINGS_PER_PAGE = 5;
const MAX_WARNINGS_LOADED = 100;

const SAFE_COLOUR = 0x2ecc71;
const WARNING_COLOUR = 0xe67e22;
const DANGER_COLOUR = 0xe74c3c;
const SEVERE_COLOUR = 0x992d22;

const BUTTON_PREFIX = 'warnings_page';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('View a member’s warning history.')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription(
        'The member whose warnings you want to view'
      )
      .setRequired(true)
  )
  .addBooleanOption((option) =>
    option
      .setName('include_removed')
      .setDescription(
        'Include warnings that have been removed'
      )
      .setRequired(false)
  )
  .setDefaultMemberPermissions(
    PermissionFlagsBits.ModerateMembers
  )
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  try {
    const targetUser = interaction.options.getUser(
      'user',
      true
    );

    const includeRemoved =
      interaction.options.getBoolean(
        'include_removed'
      ) ?? false;

    const response = await buildWarningsResponse({
      interaction,
      targetUser,
      includeRemoved,
      requestedPage: 0
    });

    return interaction.editReply(response);
  } catch (error) {
    console.error(
      '❌ Failed to retrieve warnings:',
      error
    );

    return interaction.editReply({
      content:
        '❌ The warning history could not be retrieved. ' +
        'Check the bot logs for more information.'
    });
  }
}

export async function handleButton(interaction) {
  if (
    !interaction.customId.startsWith(
      `${BUTTON_PREFIX}:`
    )
  ) {
    return false;
  }

  try {
    const parsedButton = parsePaginationButton(
      interaction.customId
    );

    if (!parsedButton) {
      await interaction.reply({
        content:
          '❌ This warning-history button is invalid.',
        flags: MessageFlags.Ephemeral
      });

      return true;
    }

    if (
      interaction.user.id !==
      parsedButton.requesterId
    ) {
      await interaction.reply({
        content:
          '❌ Only the moderator who opened this warning ' +
          'history can use these buttons.',
        flags: MessageFlags.Ephemeral
      });

      return true;
    }

    const targetUser = await interaction.client.users
      .fetch(parsedButton.targetUserId)
      .catch(() => null);

    if (!targetUser) {
      await interaction.update({
        content:
          '❌ The member connected to this warning ' +
          'history could not be found.',
        embeds: [],
        components: []
      });

      return true;
    }

    const response = await buildWarningsResponse({
      interaction,
      targetUser,
      includeRemoved: parsedButton.includeRemoved,
      requestedPage: parsedButton.page
    });

    await interaction.update(response);

    return true;
  } catch (error) {
    console.error(
      '❌ Failed to change warnings page:',
      error
    );

    if (
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content:
          '❌ The warning-history page could not be loaded.',
        flags: MessageFlags.Ephemeral
      });
    }

    return true;
  }
}

async function buildWarningsResponse({
  interaction,
  targetUser,
  includeRemoved,
  requestedPage
}) {
  const warnings = getWarningsForUser({
    guildId: interaction.guildId,
    userId: targetUser.id,
    includeRemoved,
    limit: MAX_WARNINGS_LOADED
  });

  if (warnings.length === 0) {
    return {
      content:
        `${targetUser} has no ` +
        `${includeRemoved ? 'recorded' : 'active'} warnings.`,
      embeds: [],
      components: []
    };
  }

  const activeWarnings = warnings.filter(
    (warning) => warning.status === 'active'
  );

  const removedWarnings = warnings.filter(
    (warning) => warning.status === 'removed'
  );

  const expiredWarnings = warnings.filter(
    (warning) => warning.status === 'expired'
  );

  const totalPages = Math.max(
    1,
    Math.ceil(
      warnings.length / WARNINGS_PER_PAGE
    )
  );

  const currentPage = Math.min(
    Math.max(requestedPage, 0),
    totalPages - 1
  );

  const startIndex =
    currentPage * WARNINGS_PER_PAGE;

  const warningsOnPage = warnings.slice(
    startIndex,
    startIndex + WARNINGS_PER_PAGE
  );

  const targetMember = await interaction.guild.members
    .fetch(targetUser.id)
    .catch(() => null);

  const warningFields = await Promise.all(
    warningsOnPage.map((warning) =>
      formatWarningField(
        warning,
        interaction.client
      )
    )
  );

  const embed = new EmbedBuilder()
    .setColor(
      getWarningColour(activeWarnings.length)
    )
    .setTitle('⚠️ Warning History')
    .setThumbnail(
      targetMember
        ? targetMember.displayAvatarURL({
            size: 256
          })
        : targetUser.displayAvatarURL({
            size: 256
          })
    )
    .addFields(
      {
        name: '👤 Member',
        value:
          `${targetUser}\n` +
          `Username: ${targetUser.tag}`,
        inline: false
      },
      {
        name: '📊 Summary',
        value: buildSummary({
          activeCount: activeWarnings.length,
          removedCount: removedWarnings.length,
          expiredCount: expiredWarnings.length,
          includeRemoved
        }),
        inline: false
      },
      ...warningFields
    )
    .setFooter({
      text:
        `Page ${currentPage + 1} of ${totalPages} • ` +
        `Showing ${startIndex + 1}–` +
        `${startIndex + warningsOnPage.length} of ` +
        `${warnings.length} warning records`
    })
    .setTimestamp();

  const components = [];

  if (totalPages > 1) {
    components.push(
      buildPaginationRow({
        requesterId: interaction.user.id,
        targetUserId: targetUser.id,
        includeRemoved,
        currentPage,
        totalPages
      })
    );
  }

  return {
    embeds: [embed],
    components
  };
}

async function formatWarningField(
  warning,
  client
) {
  const status = formatStatus(warning.status);

  const moderator = await formatModerator(
    client,
    warning.moderatorId
  );

  const sections = [
    `**Status:** ${status}`,
    `**Reason:** ${warning.reason}`,
    `**Issued by:** ${moderator}`,
    `**Issued:** ${toDiscordTimestamp(
      warning.createdAt
    )}`
  ];

  if (warning.status === 'removed') {
    const removedBy = await formatModerator(
      client,
      warning.removedBy
    );

    sections.push(
      `**Removed by:** ${removedBy}`,
      `**Removed:** ${toDiscordTimestamp(
        warning.removedAt
      )}`,
      `**Removal reason:** ${
        warning.removalReason ??
        'None provided'
      }`
    );
  }

  if (
    warning.status === 'expired' &&
    warning.expiresAt
  ) {
    sections.push(
      `**Expired:** ${toDiscordTimestamp(
        warning.expiresAt
      )}`
    );
  }

  return {
    name: `📋 Case #${warning.caseNumber}`,
    value: sections.join('\n'),
    inline: false
  };
}

function buildSummary({
  activeCount,
  removedCount,
  expiredCount,
  includeRemoved
}) {
  const lines = [
    `Active: **${activeCount}**`
  ];

  if (includeRemoved) {
    lines.push(
      `Removed: **${removedCount}**`,
      `Expired: **${expiredCount}**`
    );
  }

  return lines.join('\n');
}

function buildPaginationRow({
  requesterId,
  targetUserId,
  includeRemoved,
  currentPage,
  totalPages
}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        createPaginationButtonId({
          requesterId,
          targetUserId,
          includeRemoved,
          page: currentPage - 1
        })
      )
      .setLabel('Previous')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),

    new ButtonBuilder()
      .setCustomId(
        createPaginationButtonId({
          requesterId,
          targetUserId,
          includeRemoved,
          page: currentPage + 1
        })
      )
      .setLabel('Next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(
        currentPage >= totalPages - 1
      )
  );
}

function createPaginationButtonId({
  requesterId,
  targetUserId,
  includeRemoved,
  page
}) {
  return [
    BUTTON_PREFIX,
    requesterId,
    targetUserId,
    includeRemoved ? '1' : '0',
    page
  ].join(':');
}

function parsePaginationButton(customId) {
  const [
    prefix,
    requesterId,
    targetUserId,
    includeRemovedValue,
    pageValue
  ] = customId.split(':');

  const page = Number(pageValue);

  if (
    prefix !== BUTTON_PREFIX ||
    !requesterId ||
    !targetUserId ||
    !['0', '1'].includes(
      includeRemovedValue
    ) ||
    !Number.isInteger(page)
  ) {
    return null;
  }

  return {
    requesterId,
    targetUserId,
    includeRemoved:
      includeRemovedValue === '1',
    page
  };
}

async function formatModerator(
  client,
  moderatorId
) {
  if (!moderatorId) {
    return 'Unknown';
  }

  const moderator = await client.users
    .fetch(moderatorId)
    .catch(() => null);

  if (!moderator) {
    return `<@${moderatorId}>`;
  }

  return (
    `<@${moderator.id}> ` +
    `(${moderator.tag})`
  );
}

function getWarningColour(activeWarningCount) {
  if (activeWarningCount === 0) {
    return SAFE_COLOUR;
  }

  if (activeWarningCount <= 2) {
    return WARNING_COLOUR;
  }

  if (activeWarningCount <= 4) {
    return DANGER_COLOUR;
  }

  return SEVERE_COLOUR;
}

function formatStatus(status) {
  const statuses = {
    active: '🟠 Active',
    removed: '🟢 Removed',
    expired: '⚪ Expired'
  };

  return statuses[status] ?? status;
}

function toDiscordTimestamp(value) {
  if (!value) return 'Unknown';

  const milliseconds = new Date(
    normaliseSqliteTimestamp(value)
  ).getTime();

  if (Number.isNaN(milliseconds)) {
    return 'Unknown';
  }

  const timestamp = Math.floor(
    milliseconds / 1000
  );

  return (
    `<t:${timestamp}:R> ` +
    `(<t:${timestamp}:F>)`
  );
}

function normaliseSqliteTimestamp(value) {
  if (
    typeof value === 'string' &&
    !value.includes('T')
  ) {
    return `${value.replace(' ', 'T')}Z`;
  }

  return value;
}
