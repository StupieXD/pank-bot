import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { config } from '../../config/config.js';
import { createWarning } from '../../services/moderationService.js';

const EMBED_COLOUR = 0xe67e22;

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Issue a warning to a server member.')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The member to warn')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for the warning')
      .setRequired(true)
      .setMaxLength(1000)
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

    const reason = interaction.options.getString(
      'reason',
      true
    );

    const targetMember = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!targetMember) {
      return interaction.editReply({
        content: '\u274C That user is not currently in this server.'
      });
    }

    const validationError = validateWarningTarget({
      interaction,
      targetMember
    });

    if (validationError) {
      return interaction.editReply({
        content: `\u274C ${validationError}`
      });
    }

    const moderationCase = createWarning({
      guildId: interaction.guildId,
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason
    });

    const dmSent = await sendWarningDm({
      member: targetMember,
      guild: interaction.guild,
      caseNumber: moderationCase.caseNumber,
      reason: moderationCase.reason
    });

    await sendWarningLog({
      interaction,
      targetMember,
      moderationCase,
      dmSent
    });

    return interaction.editReply({
      content:
        `\u2705 Warned <@${targetUser.id}>.\n` +
        `Case: **#${moderationCase.caseNumber}**\n` +
        `DM sent: **${dmSent ? 'Yes' : 'No'}**\n\n` +
        `Use \`/case number:${moderationCase.caseNumber}\` to view the full case.`
    });
  } catch (error) {
    console.error('\u274C Failed to issue warning:', error);

    return interaction.editReply({
      content:
        '\u274C The warning could not be created. Check the bot logs for more information.'
    });
  }
}

function validateWarningTarget({
  interaction,
  targetMember
}) {
  if (targetMember.id === interaction.user.id) {
    return 'You cannot warn yourself.';
  }

  if (targetMember.id === interaction.guild.ownerId) {
    return 'The server owner cannot be warned.';
  }

  if (targetMember.user.bot) {
    return 'Bots cannot be warned.';
  }

  const moderatorMember = interaction.member;

  if (
    interaction.user.id !== interaction.guild.ownerId &&
    moderatorMember.roles.highest.comparePositionTo(
      targetMember.roles.highest
    ) <= 0
  ) {
    return (
      'You cannot warn a member with an equal or higher ' +
      'role than your highest role.'
    );
  }

  return null;
}

async function sendWarningDm({
  member,
  guild,
  caseNumber,
  reason
}) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setTitle('\u26A0\uFE0F You have received a warning')
    .setDescription(
      `You have received an official warning in **${guild.name}**.`
    )
    .addFields(
      {
        name: '\uD83D\uDCCB Case',
        value: `#${caseNumber}`,
        inline: true
      },
      {
        name: '\uD83D\uDCDD Reason',
        value: reason,
        inline: false
      },
      {
        name: '\u2139\uFE0F What happens next?',
        value:
          'Please make sure you follow the server rules going forward.\n\n' +
          'If you believe this warning was issued in error, please contact the moderation team.',
        inline: false
      }
    )
    .setFooter({
      text:
        'This warning has been recorded in your moderation history.'
    })
    .setTimestamp();

  const serverIcon = guild.iconURL({
    size: 256
  });

  if (serverIcon) {
    embed.setThumbnail(serverIcon);
  }

  return member
    .send({
      embeds: [embed]
    })
    .then(() => true)
    .catch(() => false);
}

async function sendWarningLog({
  interaction,
  targetMember,
  moderationCase,
  dmSent
}) {
  const logChannel = await interaction.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('\u274C Could not find moderation log channel.');
    return;
  }

  const createdTimestamp = Math.floor(
    new Date(moderationCase.createdAt).getTime() / 1000
  );

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setTitle(
      `\u26A0\uFE0F Warning Issued \u2022 Case #${moderationCase.caseNumber}`
    )
    .setThumbnail(
      targetMember.user.displayAvatarURL({
        dynamic: true
      })
    )
    .addFields(
      {
        name: '\uD83D\uDC64 User',
        value:
          `<@${targetMember.id}>\n` +
          `Username: ${targetMember.user.tag}`,
        inline: false
      },
      {
        name: '\uD83D\uDEE1\uFE0F Moderator',
        value:
          `<@${interaction.user.id}>\n` +
          `Username: ${interaction.user.tag}`,
        inline: false
      },
      {
        name: '\uD83D\uDCDD Reason',
        value: moderationCase.reason,
        inline: false
      },
      {
        name: '\u2709\uFE0F DM Sent',
        value: dmSent ? 'Yes' : 'No',
        inline: true
      },
      {
        name: '\uD83D\uDD52 Issued',
        value:
          `<t:${createdTimestamp}:R> ` +
          `(<t:${createdTimestamp}:F>)`,
        inline: false
      }
    )
    .setFooter({
      text:
        `\uD83C\uDD94 User ID: ${targetMember.id} \u2022 ` +
        `Case #${moderationCase.caseNumber}`
    });

  await logChannel.send({
    embeds: [embed],
    allowedMentions: {
      parse: []
    }
  });
}
