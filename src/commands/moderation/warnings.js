import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { getWarningsForUser } from '../../services/moderationService.js';

const EMBED_COLOUR = 0xe67e22;
const MAX_WARNINGS_SHOWN = 10;

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('View a member’s warning history.')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The member whose warnings you want to view')
      .setRequired(true)
  )
  .addBooleanOption((option) =>
    option
      .setName('include_removed')
      .setDescription('Include warnings that have been removed')
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
      interaction.options.getBoolean('include_removed') ??
      false;

    const warnings = getWarningsForUser({
      guildId: interaction.guildId,
      userId: targetUser.id,
      includeRemoved,
      limit: 100
    });

    if (warnings.length === 0) {
      return interaction.editReply({
        content:
          `${targetUser} has no ` +
          `${includeRemoved ? 'recorded' : 'active'} warnings.`
      });
    }

    const activeWarnings = warnings.filter(
      (warning) => warning.status === 'active'
    );

    const removedWarnings = warnings.filter(
      (warning) => warning.status === 'removed'
    );

    const warningsToDisplay = warnings.slice(
      0,
      MAX_WARNINGS_SHOWN
    );

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOUR)
      .setTitle('⚠️ Warning History')
      .setThumbnail(
        targetUser.displayAvatarURL({
          dynamic: true
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
          value:
            `Active: **${activeWarnings.length}**\n` +
            `Removed: **${removedWarnings.length}**\n` +
            `Total shown: **${warningsToDisplay.length}**`,
          inline: false
        },
        ...warningsToDisplay.map(formatWarningField)
      )
      .setFooter({
        text:
          `Showing ${warningsToDisplay.length} of ` +
          `${warnings.length} warning records`
      })
      .setTimestamp();

    if (warnings.length > MAX_WARNINGS_SHOWN) {
      embed.addFields({
        name: 'ℹ️ Additional Warnings',
        value:
          `${warnings.length - MAX_WARNINGS_SHOWN} older warning ` +
          `${warnings.length - MAX_WARNINGS_SHOWN === 1 ? 'record was' : 'records were'} not shown.`,
        inline: false
      });
    }

    return interaction.editReply({
      embeds: [embed]
    });
  } catch (error) {
    console.error('❌ Failed to retrieve warnings:', error);

    return interaction.editReply({
      content:
        '❌ The warning history could not be retrieved. Check the bot logs for more information.'
    });
  }
}

function formatWarningField(warning) {
  const createdTimestamp = toDiscordTimestamp(
    warning.createdAt
  );

  const status =
    warning.status === 'removed'
      ? 'Removed'
      : warning.status === 'expired'
        ? 'Expired'
        : 'Active';

  const sections = [
    `**Status:** ${status}`,
    `**Reason:** ${warning.reason}`,
    `**Issued:** ${createdTimestamp}`
  ];

  if (warning.status === 'removed') {
    sections.push(
      `**Removed:** ${toDiscordTimestamp(warning.removedAt)}`,
      `**Removal reason:** ${warning.removalReason ?? 'None provided'}`
    );
  }

  return {
    name: `Case #${warning.caseNumber}`,
    value: sections.join('\n'),
    inline: false
  };
}

function toDiscordTimestamp(value) {
  if (!value) return 'Unknown';

  const milliseconds = new Date(
    normaliseSqliteTimestamp(value)
  ).getTime();

  if (Number.isNaN(milliseconds)) {
    return 'Unknown';
  }

  const timestamp = Math.floor(milliseconds / 1000);

  return `<t:${timestamp}:R> (<t:${timestamp}:F>)`;
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
