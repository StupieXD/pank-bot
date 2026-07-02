import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { rememberPurgeAction } from '../../services/purgeContext.js';

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Delete recent messages with optional filters.')
  .addIntegerOption((option) =>
    option
      .setName('amount')
      .setDescription('Number of recent messages to scan')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  )
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Only delete messages from this user')
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Reason for the purge')
      .setRequired(false)
      .setMaxLength(200)
  )
  .addStringOption((option) =>
    option
      .setName('contains')
      .setDescription('Only delete messages containing this text')
      .setRequired(false)
      .setMaxLength(100)
  )
  .addBooleanOption((option) =>
    option
      .setName('bots_only')
      .setDescription('Only delete messages from bots')
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false);

export async function execute(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      content: '❌ You do not have permission to use this command.',
      ephemeral: true
    });
  }

  const amount = interaction.options.getInteger('amount');
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const contains = interaction.options.getString('contains');
  const botsOnly = interaction.options.getBoolean('bots_only') || false;

  await interaction.deferReply({ ephemeral: true });

  const fetchedMessages = await interaction.channel.messages.fetch({
    limit: amount
  });

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

  messagesToDelete = messagesToDelete.filter((message) => {
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return message.createdTimestamp > fourteenDaysAgo;
  });

  if (messagesToDelete.length === 0) {
    return interaction.editReply('No matching messages found to delete.');
  }

  rememberPurgeAction({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    moderator: interaction.user,
    amount: messagesToDelete.length,
    reason,
    filters: {
      requestedAmount: amount,
      user: targetUser
        ? {
            username: targetUser.username,
            id: targetUser.id
          }
        : null,
      contains: contains || null,
      botsOnly
    }
  });

  const deleted = await interaction.channel.bulkDelete(messagesToDelete, true);

  await interaction.editReply(
    `Deleted ${deleted.size} message${deleted.size === 1 ? '' : 's'}.`
  );
}
