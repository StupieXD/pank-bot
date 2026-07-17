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
  getCase,
  getWarningsForUser
} from '../../services/moderationService.js';
import {
  formatDiscordTimestamp,
  formatModerationStatus
} from '../../utils/moderationEmbedBuilder.js';
import {
  buildCaseResponse
} from './case.js';

const WARNINGS_PER_PAGE = 5;
const MAX_WARNINGS_LOADED = 100;

const SAFE_COLOUR = 0x2ecc71;
const CAUTION_COLOUR = 0xf1c40f;
const WARNING_COLOUR = 0xe67e22;
const DANGER_COLOUR = 0xe74c3c;

const PAGE_BUTTON_PREFIX = 'warnings_page';
const VIEW_BUTTON_PREFIX = 'warnings_view_case';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('View a member\'s warning history.')
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
      '\u274C Failed to retrieve warnings:',
      error
    );

    return interaction.editReply({
      content:
        '\u274C The warning history could not be retrieved. ' +
        'Check the bot logs for more information.',
      embeds: [],
      components: []
    });
  }
}

export async function handleButton(interaction) {
  if (interaction.customId.startsWith(`${VIEW_BUTTON_PREFIX}:`)) {
    return handleViewCaseButton(interaction);
  }

  if (!interaction.customId.startsWith(`${PAGE_BUTTON_PREFIX}:`)) {
    return false;
  }

  try {
    const parsedButton = parsePaginationButton(
      interaction.customId
    );

    if (!parsedButton) {
      await interaction.reply({
        content:
          '\u274C This warning-history button is invalid.',
        flags: MessageFlags.Ephemeral
      });

      return true;
    }

    if (interaction.user.id !== parsedButton.requesterId) {
      await interaction.reply({
        content:
          '\u274C Only the moderator who opened this warning ' +
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
          '\u274C The member connected to this warning ' +
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
      '\u274C Failed to change warnings page:',
      error
    );

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          '\u274C The warning-history page could not be loaded.',
        flags: MessageFlags.Ephemeral
      });
    }

    return true;
  }
}

async function handleViewCaseButton(interaction) {
  const parsed = parseViewCaseButton(interaction.customId);

  if (!parsed) {
    await interaction.reply({
      content: '\u274C This case button is invalid.',
      flags: MessageFlags.Ephemeral
    });

    return true;
  }

  if (interaction.user.id !== parsed.requesterId) {
    await interaction.reply({
      content:
        '\u274C Only the moderator who opened this warning history can use these buttons.',
      flags: MessageFlags.Ephemeral
    });

    return true;
  }

  const moderationCase = getCase({
    guildId: interaction.guildId,
    caseNumber: parsed.caseNumber
  });

  if (!moderationCase) {
    await interaction.update({
      content: `\u274C Case #${parsed.caseNumber} could not be found.`,
      embeds: [],
      components: []
    });

    return true;
  }

  const response = await buildCaseResponse({
    interaction,
    moderationCase,
    requesterId: parsed.requesterId
  });

  await interaction.update(response);
  return true;
}

async function buildWarningsResponse({
  interaction,
  targetUser,
  includeRemoved,
  requestedPage
}) {
  const allWarnings = getWarningsForUser({
    guildId: interaction.guildId,
    userId: targetUser.id,
    includeRemoved: true,
    limit: MAX_WARNINGS_LOADED
  });

  const warnings = includeRemoved
    ? allWarnings
    : allWarnings.filter(
        (warning) => warning.status !== 'removed'
      );

  if (warnings.length === 0) {
    return {
      content:
        `${targetUser} has no ` +
        `${includeRemoved ? 'recorded' : 'active'} warnings.`,
      embeds: [],
      components: []
    };
  }

  const activeWarnings = allWarnings.filter(
    (warning) => warning.status === 'active'
  );

  const removedWarnings = allWarnings.filter(
    (warning) => warning.status === 'removed'
  );

  const expiredWarnings = allWarnings.filter(
    (warning) => warning.status === 'expired'
  );

  const totalPages = Math.max(
    1,
    Math.ceil(warnings.length / WARNINGS_PER_PAGE)
  );

  const currentPage = Math.min(
    Math.max(requestedPage, 0),
    totalPages - 1
  );

  const startIndex = currentPage * WARNINGS_PER_PAGE;

  const warningsOnPage = warnings.slice(
    startIndex,
    startIndex + WARNINGS_PER_PAGE
  );

  const targetMember = await interaction.guild.members
    .fetch(targetUser.id)
    .catch(() => null);

  const warningFields = await Promise.all(
    warningsOnPage.map((warning) =>
      formatWarningField(warning, interaction.client)
    )
  );

  const embed = new EmbedBuilder()
    .setColor(getWarningColour(activeWarnings.length))
    .setTitle('\u26A0\uFE0F Warning History')
    .setThumbnail(
      targetMember
        ? targetMember.displayAvatarURL({ size: 256 })
        : targetUser.displayAvatarURL({ size: 256 })
    )
    .addFields(
      {
        name: '\uD83D\uDC64 Member',
        value: `${targetUser}\n\`${targetUser.id}\``,
        inline: false
      },
      {
        name: '\uD83D\uDCCA Summary',
        value: buildSummary({
          activeCount: activeWarnings.length,
          removedCount: removedWarnings.length,
          expiredCount: expiredWarnings.length,
          totalCount: allWarnings.length
        }),
        inline: false
      },
      ...warningFields
    )
    .setFooter({
      text: buildFooter({
        currentPage,
        totalPages,
        startIndex,
        warningsOnPageCount: warningsOnPage.length,
        totalWarnings: warnings.length
      })
    })
    .setTimestamp();

  const components = [
    buildViewCaseRow({
      requesterId: interaction.user.id,
      warningsOnPage
    })
  ];

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
    content: null,
    embeds: [embed],
    components,
    allowedMentions: {
      parse: []
    }
  };
}

async function formatWarningField(warning, client) {
  const moderator = await formatModerator(
    client,
    warning.moderatorId
  );

  const sections = [
    `**Status:** ${formatModerationStatus(warning.status)}`,
    `**Reason:** ${warning.reason}`,
    `**Moderator:** ${moderator}`,
    `**Issued:** ${formatDiscordTimestamp(warning.createdAt)}`
  ];

  if (warning.status === 'removed') {
    const removedBy = await formatModerator(
      client,
      warning.removedBy
    );

    sections.push(
      `**Removed by:** ${removedBy}`,
      `**Removed:** ${formatDiscordTimestamp(warning.removedAt)}`,
      `**Removal reason:** ${
        warning.removalReason ?? 'None provided'
      }`
    );
  }

  if (warning.status === 'expired' && warning.expiresAt) {
    sections.push(
      `**Expired:** ${formatDiscordTimestamp(warning.expiresAt)}`
    );
  }

  return {
    name: `Case #${warning.caseNumber}`,
    value: sections.join('\n'),
    inline: false
  };
}

function buildSummary({
  activeCount,
  removedCount,
  expiredCount,
  totalCount
}) {
  return [
    `${getActiveSummaryEmoji(activeCount)} Active: **${activeCount}**`,
    `\uD83D\uDFE2 Removed: **${removedCount}**`,
    `\u26AA Expired: **${expiredCount}**`,
    `\uD83D\uDCC1 Total: **${totalCount}**`
  ].join('\n');
}

function getActiveSummaryEmoji(activeCount) {
  if (activeCount === 0) return '\uD83D\uDFE2';
  if (activeCount <= 2) return '\uD83D\uDFE1';
  if (activeCount <= 4) return '\uD83D\uDFE0';
  return '\uD83D\uDD34';
}

function buildViewCaseRow({ requesterId, warningsOnPage }) {
  return new ActionRowBuilder().addComponents(
    warningsOnPage.map((warning) =>
      new ButtonBuilder()
        .setCustomId(
          [
            VIEW_BUTTON_PREFIX,
            requesterId,
            warning.caseNumber
          ].join(':')
        )
        .setLabel(`View #${warning.caseNumber}`)
        .setStyle(ButtonStyle.Primary)
    )
  );
}

function parseViewCaseButton(customId) {
  const [prefix, requesterId, caseNumberValue] =
    customId.split(':');

  const caseNumber = Number(caseNumberValue);

  if (
    prefix !== VIEW_BUTTON_PREFIX ||
    !requesterId ||
    !Number.isInteger(caseNumber) ||
    caseNumber < 1
  ) {
    return null;
  }

  return {
    requesterId,
    caseNumber
  };
}

function buildFooter({
  currentPage,
  totalPages,
  startIndex,
  warningsOnPageCount,
  totalWarnings
}) {
  if (totalPages === 1) {
    return (
      `${totalWarnings} warning ` +
      `${totalWarnings === 1 ? 'record' : 'records'} | ` +
      'Page 1/1'
    );
  }

  return (
    `Showing ${startIndex + 1}-${
      startIndex + warningsOnPageCount
    } of ${totalWarnings} | ` +
    `Page ${currentPage + 1}/${totalPages}`
  );
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
      .setEmoji('\u25C0\uFE0F')
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
      .setEmoji('\u25B6\uFE0F')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1)
  );
}

function createPaginationButtonId({
  requesterId,
  targetUserId,
  includeRemoved,
  page
}) {
  return [
    PAGE_BUTTON_PREFIX,
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
    prefix !== PAGE_BUTTON_PREFIX ||
    !requesterId ||
    !targetUserId ||
    !['0', '1'].includes(includeRemovedValue) ||
    !Number.isInteger(page)
  ) {
    return null;
  }

  return {
    requesterId,
    targetUserId,
    includeRemoved: includeRemovedValue === '1',
    page
  };
}

async function formatModerator(client, moderatorId) {
  if (!moderatorId) {
    return 'Unknown';
  }

  const moderator = await client.users
    .fetch(moderatorId)
    .catch(() => null);

  return moderator
    ? `<@${moderator.id}>`
    : `<@${moderatorId}>`;
}

function getWarningColour(activeWarningCount) {
  if (activeWarningCount === 0) return SAFE_COLOUR;
  if (activeWarningCount <= 2) return CAUTION_COLOUR;
  if (activeWarningCount <= 4) return WARNING_COLOUR;
  return DANGER_COLOUR;
}
