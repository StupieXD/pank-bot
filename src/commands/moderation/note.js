import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import { createNote } from '../../services/moderationService.js';

export const data = new SlashCommandBuilder()
  .setName('note')
  .setDescription('Add a private moderator note to a member.')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The member the note is about')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('note')
      .setDescription('The private moderator note')
      .setRequired(true)
      .setMaxLength(1000)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const targetUser = interaction.options.getUser('user', true);
    const note = interaction.options.getString('note', true);
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: 'Error: That user is not currently in this server.' });
    }

    if (targetUser.id === interaction.user.id) {
      return interaction.editReply({ content: 'Error: You cannot add a moderator note about yourself.' });
    }

    const moderationCase = createNote({
      guildId: interaction.guildId,
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason: note
    });

    return interaction.editReply({
      content:
        `Added a private moderator note for <@${targetUser.id}>.\n` +
        `Case: **#${moderationCase.caseNumber}**\n\n` +
        `Use \`/case number:${moderationCase.caseNumber}\` to view it.`
    });
  } catch (error) {
    console.error('Failed to add moderator note:', error);
    return interaction.editReply({ content: 'Error: The moderator note could not be created.' });
  }
}
