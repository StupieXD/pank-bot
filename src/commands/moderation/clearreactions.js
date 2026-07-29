import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('clearreactions')
  .setDescription('Remove every reaction from a message.')
  .addStringOption((option) =>
    option
      .setName('message_id')
      .setDescription('The ID of the message')
      .setRequired(true)
  )
  .addChannelOption((option) =>
    option
      .setName('channel')
      .setDescription('Channel containing the message (defaults to the current channel)')
      .addChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildVoice,
        ChannelType.GuildStageVoice
      )
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for removing the reactions')
      .setRequired(false)
      .setMaxLength(1000)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const messageId = interaction.options.getString('message_id', true).trim();
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const reason = interaction.options.getString('reason')?.trim() || 'No reason provided.';

    if (!/^\d{17,20}$/.test(messageId)) {
      return interaction.editReply({ content: 'Error: Enter a valid Discord message ID.' });
    }

    if (!channel?.isTextBased() || !channel.messages) {
      return interaction.editReply({ content: 'Error: That channel does not support messages.' });
    }

    const botMember = interaction.guild.members.me;
    const permissions = channel.permissionsFor(botMember);
    const required = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages
    ];

    if (!permissions?.has(required)) {
      return interaction.editReply({
        content: 'Error: Pank needs View Channel, Read Message History and Manage Messages there.'
      });
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
      return interaction.editReply({
        content: 'Error: That message could not be found in the selected channel.'
      });
    }

    const reactionCount = message.reactions.cache.reduce(
      (total, reaction) => total + (reaction.count ?? 0),
      0
    );

    if (reactionCount === 0) {
      return interaction.editReply({ content: 'Error: That message has no reactions to remove.' });
    }

    await message.reactions.removeAll();

    return interaction.editReply({
      content:
        `Success: Removed **${reactionCount}** reaction${reactionCount === 1 ? '' : 's'} ` +
        `from [this message](${message.url}).\nReason: ${reason}`
    });
  } catch (error) {
    console.error('Error: Failed to clear reactions:', error);
    return interaction.editReply({
      content: "Error: Reactions could not be removed. Check Pank's permissions and the bot logs."
    });
  }
}
