import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

import { registerModalHandler } from '../../services/interactionRouterService.js';
import {
  GUILD_CONFIG_KEYS,
  getConfigValue
} from '../../services/guildConfigService.js';
import { isLockdownActive } from '../../database/repositories/lockdownRepository.js';
import {
  addAnonymousQaAudit,
  createAnonymousQuestion,
  getLatestSubmissionByUser
} from '../../database/repositories/anonymousQaRepository.js';

const MODAL_PREFIX = 'anonymous-qa-submit:';
const COOLDOWN_MS = 5 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName('question')
  .setDescription('Submit an anonymous question to the community host.')
  .setDMPermission(false);

export async function execute(interaction) {
  if (isLockdownActive(interaction.guildId)) {
    return interaction.reply({
      content:
        'Anonymous Q&A is temporarily paused while the server is in lockdown.',
      flags: MessageFlags.Ephemeral
    });
  }

  const recipientId = getConfigValue(
    interaction.guildId,
    GUILD_CONFIG_KEYS.ANONYMOUS_QA_RECIPIENT_ID
  );

  if (!recipientId) {
    return interaction.reply({
      content: 'Anonymous Q&A has not been configured yet.',
      flags: MessageFlags.Ephemeral
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}${interaction.guildId}`)
    .setTitle('Anonymous Q&A');

  const subjectInput = new TextInputBuilder()
    .setCustomId('subject')
    .setLabel('Subject (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);

  const questionInput = new TextInputBuilder()
    .setCustomId('question')
    .setLabel('Your question')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(1800);

  modal.addComponents(
    new ActionRowBuilder().addComponents(subjectInput),
    new ActionRowBuilder().addComponents(questionInput)
  );

  await interaction.showModal(modal);
}

registerModalHandler(MODAL_PREFIX, async (interaction) => {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  if (isLockdownActive(interaction.guildId)) {
    return interaction.editReply({
      content:
        'Anonymous Q&A is temporarily paused while the server is in lockdown.'
    });
  }

  const latestSubmission = getLatestSubmissionByUser(
    interaction.guildId,
    interaction.user.id
  );

  if (latestSubmission) {
    const latestTimestamp = new Date(
      `${latestSubmission.created_at}Z`
    ).getTime();

    if (Date.now() - latestTimestamp < COOLDOWN_MS) {
      return interaction.editReply({
        content:
          'Please wait five minutes before sending another anonymous question.'
      });
    }
  }

  const recipientId = getConfigValue(
    interaction.guildId,
    GUILD_CONFIG_KEYS.ANONYMOUS_QA_RECIPIENT_ID
  );

  const recipient = recipientId
    ? await interaction.client.users.fetch(recipientId).catch(() => null)
    : null;

  if (!recipient) {
    return interaction.editReply({
      content:
        'Anonymous Q&A is currently unavailable. Please tell an administrator.'
    });
  }

  const subject = interaction.fields
    .getTextInputValue('subject')
    .trim();

  const question = interaction.fields
    .getTextInputValue('question')
    .trim();

  const created = createAnonymousQuestion({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    subject,
    question
  });

  addAnonymousQaAudit({
    guildId: interaction.guildId,
    submissionId: created.id,
    actorId: interaction.client.user.id,
    action: 'submitted',
    details: null
  });

  const delivery = await recipient
    .send({
      content:
        `## Anonymous Question #${created.id}\n` +
        (subject ? `**Subject:** ${subject}\n` : '') +
        `**Question:**\n${question}\n\n` +
        `**Server:** ${interaction.guild.name}\n` +
        '**Status:** Open'
    })
    .then(() => true)
    .catch(() => false);

  if (!delivery) {
    addAnonymousQaAudit({
      guildId: interaction.guildId,
      submissionId: created.id,
      actorId: interaction.client.user.id,
      action: 'delivery_failed',
      details: 'The configured recipient could not be reached by DM.'
    });

    return interaction.editReply({
      content:
        'Your question was saved, but Pank could not deliver it by DM. ' +
        'Please tell an administrator and quote question ' +
        `#${created.id}.`
    });
  }

  addAnonymousQaAudit({
    guildId: interaction.guildId,
    submissionId: created.id,
    actorId: interaction.client.user.id,
    action: 'delivered',
    details: null
  });

  return interaction.editReply({
    content:
      `Success: Your anonymous question was submitted as **#${created.id}**. ` +
      'Your identity is stored securely for safeguarding and is not shown ' +
      'to the recipient.'
  });
});
