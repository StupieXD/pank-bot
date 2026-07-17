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
  getAdjacentCase,
  getCase
} from '../../services/moderationService.js';

const BUTTON_PREFIX = 'case_navigate';

const CASE_STYLES = Object.freeze({
  warning: {
    label: 'Warning',
    emoji: '⚠️',
    colour: 0xf1c40f
  },
  note: {
    label: 'Note',
    emoji: '📝',
    colour: 0x3498db
  },
  timeout: {
    label: 'Timeout',
    emoji: '⏳',
    colour: 0xe67e22
  },
  temporary_timeout: {
    label: 'Temporary Timeout',
    emoji: '⏳',
    colour: 0xe67e22
  },
  kick: {
    label: 'Kick',
    emoji: '🥾',
    colour: 0x9b59b6
  },
  ban: {
    label: 'Ban',
    emoji: '🔨',
    colour: 0xe74c3c
  },
  temporary_ban: {
    label: 'Temporary Ban',
    emoji: '🔨',
    colour: 0xe74c3c
  },
  softban: {
    label: 'Softban',
    emoji: '🧹',
    colour: 0xc0392b
  }
});

const STATUS_STYLES = Object.freeze({
  active: {
    label: 'Active',
    emoji: '🟢'
  },
  expired: {
    label: 'Expired',
    emoji: '🟠'
  },
  removed: {
    label: 'Removed',
    emoji: '🔴'
  }
});

export const data = new SlashCommandBuilder()
  .setName('case')
  .setDescription('View the full details of a moderation case.')
  .addIntegerOption((option) =>
    option
      .setName('number')
      .setDescription('The moderation case number to view')
      .setRequired(true)
      .setMinValue(1)
  )
  .setDefaultMemberPermissions(
    PermissionFlagsBits.ModerateMembers
  )
  .setDMPermission(false);

export async function execute(interaction) {
  const caseNumber = interaction.options.getInteger(
    'number',
    true
  );

  const moderationCase = getCase({
    guildId: interaction.guildId,
    caseNumber
  });

  if (!moderationCase) {
    return interaction.reply({
      content: `❌ Case #${caseNumber} could not be found.`,
      flags: MessageFlags.Ephemeral
    });
  }

  const response = await buildCaseResponse({
    interaction,
    moderationCase,
    requesterId: interaction.user.id
  });

  return interaction.reply({
    ...response,
    flags: MessageFlags.Ephemeral
  });
}

export async function handleButton(interaction) {
  if (!interaction.customId.startsWith(`${BUTTON_PREFIX}:`)) {
    return false;
  }

  const parsed = parseButtonId(interaction.customId);

  if (!parsed) {
    await interaction.reply({
      content: '❌ This case navigation button is invalid.',
      flags: MessageFlags.Ephemeral
    });

    return true;
  }

  if (interaction.user.id !== parsed.requesterId) {
    await interaction.reply({
      content: '❌ Only the moderator who opened this case can use these buttons.',
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
      content: `❌ Case #${parsed.caseNumber} could not be found.`,
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

async function buildCaseResponse({
  interaction,
  moderationCase,
  requesterId
}) {
  const [targetUser, moderatorUser, removedByUser] =
    await Promise.all([
      fetchUser(interaction, moderationCase.userId),
      fetchUser(interaction, moderationCase.moderatorId),
      moderationCase.removedBy
        ? fetchUser(interaction, moderationCase.removedBy)
        : null
    ]);

  const style = getCaseStyle(moderationCase.caseType);
  const status = getStatusStyle(moderationCase.status);

  const embed = new EmbedBuilder()
    .setColor(style.colour)
    .setTitle(
      `${style.emoji} ${style.label} Case #${moderationCase.caseNumber}`
    )
    .addFields(
      {
        name: '📄 Type',
        value: style.label,
        inline: true
      },
      {
        name: '📊 Status',
        value: `${status.emoji} ${status.label}`,
        inline: true
      },
      {
        name: '👤 Member',
        value: formatUser(moderationCase.userId, targetUser),
        inline: false
      },
      {
        name: '🛡️ Moderator',
        value: formatUser(
          moderationCase.moderatorId,
          moderatorUser
        ),
        inline: false
      },
      {
        name: '📝 Reason',
        value: moderationCase.reason || 'No reason provided.',
        inline: false
      },
      {
        name: '🕒 Created',
        value: formatTimestamp(moderationCase.createdAt),
        inline: false
      }
    )
    .setFooter({
      text:
        `Database ID: ${moderationCase.id} • ` +
        `Guild ID: ${moderationCase.guildId} • ` +
        `Case #${moderationCase.caseNumber}`
    });

  if (targetUser) {
    embed.setThumbnail(
      targetUser.displayAvatarURL({
        size: 256
      })
    );
  }

  if (moderationCase.expiresAt) {
    embed.addFields({
      name: '⏱️ Expires',
      value: formatTimestamp(moderationCase.expiresAt),
      inline: false
    });
  }

  if (moderationCase.status === 'removed') {
    embed.addFields(
      {
        name: '❌ Removed By',
        value: moderationCase.removedBy
          ? formatUser(
              moderationCase.removedBy,
              removedByUser
            )
          : 'Unknown',
        inline: false
      },
      {
        name: '🗑️ Removal Reason',
        value:
          moderationCase.removalReason ||
          'No removal reason recorded.',
        inline: false
      },
      {
        name: '🕒 Removed',
        value: moderationCase.removedAt
          ? formatTimestamp(moderationCase.removedAt)
          : 'Unknown',
        inline: false
      }
    );
  }

  const previousCase = getAdjacentCase({
    guildId: moderationCase.guildId,
    caseNumber: moderationCase.caseNumber,
    direction: 'previous'
  });

  const nextCase = getAdjacentCase({
    guildId: moderationCase.guildId,
    caseNumber: moderationCase.caseNumber,
    direction: 'next'
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        buildButtonId({
          requesterId,
          caseNumber:
            previousCase?.caseNumber ?? moderationCase.caseNumber
        })
      )
      .setLabel(
        previousCase
          ? `Previous • #${previousCase.caseNumber}`
          : 'Previous'
      )
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!previousCase),
    new ButtonBuilder()
      .setCustomId(
        buildButtonId({
          requesterId,
          caseNumber:
            nextCase?.caseNumber ?? moderationCase.caseNumber
        })
      )
      .setLabel(
        nextCase
          ? `Next • #${nextCase.caseNumber}`
          : 'Next'
      )
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!nextCase)
  );

  return {
    content: '',
    embeds: [embed],
    components: [row],
    allowedMentions: {
      parse: []
    }
  };
}

function getCaseStyle(caseType) {
  return CASE_STYLES[caseType] ?? {
    label: toTitleCase(caseType || 'unknown'),
    emoji: '📁',
    colour: 0x95a5a6
  };
}

function getStatusStyle(status) {
  return STATUS_STYLES[status] ?? {
    label: toTitleCase(status || 'unknown'),
    emoji: '⚪'
  };
}

function formatUser(userId, user) {
  const lines = [`<@${userId}>`];

  if (user?.tag) {
    lines.push(`Username: ${user.tag}`);
  }

  lines.push(`ID: \`${userId}\``);
  return lines.join('\n');
}

function formatTimestamp(value) {
  const milliseconds = new Date(value).getTime();

  if (!Number.isFinite(milliseconds)) {
    return 'Unknown';
  }

  const timestamp = Math.floor(milliseconds / 1000);
  return `<t:${timestamp}:F>\n<t:${timestamp}:R>`;
}

function toTitleCase(value) {
  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function fetchUser(interaction, userId) {
  return interaction.client.users.fetch(userId).catch(() => null);
}

function buildButtonId({ requesterId, caseNumber }) {
  return `${BUTTON_PREFIX}:${requesterId}:${caseNumber}`;
}

function parseButtonId(customId) {
  const parts = customId.split(':');

  if (parts.length !== 3) {
    return null;
  }

  const requesterId = parts[1];
  const caseNumber = Number(parts[2]);

  if (
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
