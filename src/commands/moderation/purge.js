import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { rememberPurgeAction } from '../../services/purgeContext.js';

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Delete a number of recent messages.')
  .addIntegerOption((option) =>
    option
      .setName('amount')
      .setDescription('Number of messages to delete')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false);

export async function execute(interaction) {
  const amount = interaction.options.getInteger('amount');

  rememberPurgeAction({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    moderator: interaction.user,
    amount
  });

  await interaction.deferReply({ ephemeral: true });

  const deleted = await interaction.channel.bulkDelete(amount, true);

  await interaction.editReply(`Deleted ${deleted.size} messages.`);
}
