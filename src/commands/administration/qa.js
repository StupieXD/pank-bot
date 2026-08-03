import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import {
  addAnonymousQaAudit,
  archiveAnonymousQuestion,
  permanentlyDeleteAnonymousQuestion,
  getAnonymousQuestion,
  listAnonymousQaAudit,
  listAnonymousQuestions,
  markAnonymousQuestionAnswered,
  markAnonymousQuestionSkipped,
  resetAnonymousQuestions,
  revealAnonymousQuestion
} from '../../database/repositories/anonymousQaRepository.js';

import {
  GUILD_CONFIG_KEYS,
  getConfigValue
} from '../../services/guildConfigService.js';

export const data = new SlashCommandBuilder()
  .setName('qa')
  .setDescription('Manage Anonymous Q&A submissions.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('list')
      .setDescription('List recent questions.')
      .addStringOption((option) =>
        option
          .setName('status')
          .setDescription('Filter by status')
          .addChoices(
            { name: 'Open', value: 'open' },
            { name: 'Answered', value: 'answered' },
            { name: 'Skipped', value: 'skipped' },
            { name: 'Archived', value: 'archived' }
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('view')
      .setDescription('View a question.')
      .addIntegerOption((option) =>
        option
          .setName('id')
          .setDescription('Question ID')
          .setRequired(true)
          .setMinValue(1)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('answer')
      .setDescription('Mark a question answered.')
      .addIntegerOption((option) =>
        option
          .setName('id')
          .setDescription('Question ID')
          .setRequired(true)
          .setMinValue(1)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('skip')
      .setDescription('Mark a question as skipped.')
      .addIntegerOption((option) =>
        option
          .setName('id')
          .setDescription('Question ID')
          .setRequired(true)
          .setMinValue(1)
      )
      .addStringOption((option) =>
        option
          .setName('reason')
          .setDescription('Optional reason, such as duplicate or not for the live')
          .setMaxLength(300)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('archive')
      .setDescription('Archive a question.')
      .addIntegerOption((option) =>
        option
          .setName('id')
          .setDescription('Question ID')
          .setRequired(true)
          .setMinValue(1)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('reveal')
      .setDescription('Reveal the sender for safeguarding. This is audited.')
      .addIntegerOption((option) =>
        option
          .setName('id')
          .setDescription('Question ID')
          .setRequired(true)
          .setMinValue(1)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('audit')
      .setDescription('View the audit trail for a question.')
      .addIntegerOption((option) =>
        option
          .setName('id')
          .setDescription('Question ID')
          .setRequired(true)
          .setMinValue(1)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('delete')
      .setDescription('Permanently delete one question and its audit history.')
      .addIntegerOption((option) =>
        option
          .setName('id')
          .setDescription('Question ID')
          .setRequired(true)
          .setMinValue(1)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('reset')
      .setDescription('Owner only: delete all questions and restart numbering.')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('export')
      .setDescription('Export recent questions as a text file.')
      .addStringOption((option) =>
        option
          .setName('status')
          .setDescription('Filter by status')
          .addChoices(
            { name: 'Open', value: 'open' },
            { name: 'Answered', value: 'answered' },
            { name: 'Skipped', value: 'skipped' },
            { name: 'Archived', value: 'archived' }
          )
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const status = interaction.options.getString('status');

  if (subcommand === 'reset') {
    if (interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({
        content: 'Error: Only the server owner can reset Anonymous Q&A.',
        flags: MessageFlags.Ephemeral
      });
    }

    return interaction.reply({
      content:
        '**DANGER: This permanently deletes every Anonymous Q&A question and audit record for this server.**\n\n' +
        'The next question will be #1. This cannot be undone.',
      components: [buildConfirmationRow('reset', interaction.user.id)],
      flags: MessageFlags.Ephemeral
    });
  }

  if (subcommand === 'list') {
    const questions = listAnonymousQuestions(interaction.guildId, {
      status,
      limit: 20
    });

    return interaction.reply({
      content: questions.length
        ? questions.map(formatSummary).join('\n')
        : 'No matching questions found.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (subcommand === 'export') {
    const questions = listAnonymousQuestions(interaction.guildId, {
      status,
      limit: 500
    });

    const body = questions
      .map(
        (question) =>
          `#${question.question_number} [${question.status}] ` +
          `${question.subject || '(no subject)'}\n` +
          `${question.question}\n` +
          `Created: ${question.created_at}\n`
      )
      .join('\n---\n');

    return interaction.reply({
      content: `Exported ${questions.length} question(s).`,
      files: [
        new AttachmentBuilder(
          Buffer.from(body || 'No questions found.'),
          { name: 'anonymous-qa-export.txt' }
        )
      ],
      flags: MessageFlags.Ephemeral
    });
  }

  const id = interaction.options.getInteger('id', true);
  const question = getAnonymousQuestion(interaction.guildId, id);

  if (!question) {
    return interaction.reply({
      content: `Question #${id} was not found.`,
      flags: MessageFlags.Ephemeral
    });
  }

  if (subcommand === 'delete') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'Error: Administrator permission is required to delete questions.',
        flags: MessageFlags.Ephemeral
      });
    }

    return interaction.reply({
      content:
        `Warning: This will permanently delete Anonymous Question #${id} and its complete audit history.\n\n` +
        'Archiving is reversible for record-keeping; deletion is not.',
      components: [buildConfirmationRow('delete', interaction.user.id, id)],
      flags: MessageFlags.Ephemeral
    });
  }

  if (subcommand === 'view') {
    return interaction.reply({
      content: formatFull(question),
      flags: MessageFlags.Ephemeral
    });
  }

  if (subcommand === 'answer') {
    const changed = markAnonymousQuestionAnswered({
      guildId: interaction.guildId,
      id,
      answeredBy: interaction.user.id
    });

    if (!changed) {
      return interaction.reply({
        content: `Question #${id} is already marked as answered.`,
        flags: MessageFlags.Ephemeral
      });
    }

    addAnonymousQaAudit({
      guildId: interaction.guildId,
      submissionId: question.id,
      actorId: interaction.user.id,
      action: 'marked_answered',
      details: null
    });

    return interaction.reply({
      content: `Success: Question #${id} marked answered.`,
      flags: MessageFlags.Ephemeral
    });
  }

  if (subcommand === 'skip') {
    const reason = interaction.options.getString('reason');
    const changed = markAnonymousQuestionSkipped({
      guildId: interaction.guildId,
      id,
      skippedBy: interaction.user.id,
      reason
    });

    if (!changed) {
      return interaction.reply({
        content: `Question #${id} is already marked as skipped.`,
        flags: MessageFlags.Ephemeral
      });
    }

    addAnonymousQaAudit({
      guildId: interaction.guildId,
      submissionId: question.id,
      actorId: interaction.user.id,
      action: 'marked_skipped',
      details: reason
    });

    return interaction.reply({
      content:
        `Success: Question #${id} marked skipped.` +
        (reason ? `
Reason: ${reason}` : ''),
      flags: MessageFlags.Ephemeral
    });
  }

  if (subcommand === 'archive') {
    const changed = archiveAnonymousQuestion({
      guildId: interaction.guildId,
      id,
      archivedBy: interaction.user.id
    });

    if (!changed) {
      return interaction.reply({
        content: `Question #${id} could not be archived.`,
        flags: MessageFlags.Ephemeral
      });
    }

    addAnonymousQaAudit({
      guildId: interaction.guildId,
      submissionId: question.id,
      actorId: interaction.user.id,
      action: 'archived',
      details: null
    });

    return interaction.reply({
      content: `Success: Question #${id} archived.`,
      flags: MessageFlags.Ephemeral
    });
  }

  if (subcommand === 'audit') {
    const auditEntries = listAnonymousQaAudit(interaction.guildId, id);

    return interaction.reply({
      content: auditEntries.length
        ? auditEntries.map(formatAuditEntry).join('\n')
        : 'No audit entries.',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
  }

  if (!canReveal(interaction)) {
    return interaction.reply({
      content:
        'Error: You do not have the configured identity override permission.',
      flags: MessageFlags.Ephemeral
    });
  }

  const revealed = revealAnonymousQuestion({
    guildId: interaction.guildId,
    id,
    revealedBy: interaction.user.id
  });

  return interaction.reply({
    content:
      'Warning: Identity revealed and logged for safeguarding.\n' +
      `Question #${id} was submitted by <@${revealed.user_id}> ` +
      `(ID: ${revealed.user_id}).`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] }
  });
}

export async function handleButton(interaction) {
  if (!interaction.customId.startsWith('qa-admin:')) return false;

  const [, action, requesterId, idValue] = interaction.customId.split(':');

  if (interaction.user.id !== requesterId) {
    await interaction.reply({
      content: 'Error: Only the person who opened this confirmation can use it.',
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  await interaction.deferUpdate();

  if (action === 'cancel') {
    await interaction.editReply({
      content: 'Anonymous Q&A deletion cancelled.',
      components: []
    });
    return true;
  }

  if (action === 'delete') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply({
        content: 'Error: Administrator permission is required.',
        components: []
      });
      return true;
    }

    const id = Number(idValue);
    const deleted = permanentlyDeleteAnonymousQuestion({
      guildId: interaction.guildId,
      id
    });

    await interaction.editReply({
      content: deleted
        ? `Permanently deleted Anonymous Question #${id} and its audit history.` +
          (deleted.numberingReset
            ? '\nThe question list is now empty, so the next question will be #1.'
            : '')
        : `Error: Question #${id} could not be found.`,
      components: []
    });
    return true;
  }

  if (action === 'reset') {
    if (interaction.user.id !== interaction.guild.ownerId) {
      await interaction.editReply({
        content: 'Error: Only the server owner can reset Anonymous Q&A.',
        components: []
      });
      return true;
    }

    const result = resetAnonymousQuestions({ guildId: interaction.guildId });
    await interaction.editReply({
      content:
        `Reset complete. Permanently deleted ${result.deletedCount} question${result.deletedCount === 1 ? '' : 's'} and all linked audit records.\n` +
        'The next Anonymous Q&A submission will be Question #1.',
      components: []
    });
    return true;
  }

  return false;
}

function buildConfirmationRow(action, userId, id = '') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`qa-admin:${action}:${userId}:${id}`)
      .setLabel(action === 'reset' ? 'Reset All Questions' : 'Permanently Delete')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`qa-admin:cancel:${userId}:${id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
}

function canReveal(interaction) {
  if (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }

  const roleId = getConfigValue(
    interaction.guildId,
    GUILD_CONFIG_KEYS.ANONYMOUS_QA_OVERRIDE_ROLE_ID
  );

  return Boolean(roleId && interaction.member?.roles?.cache?.has(roleId));
}

function formatSummary(question) {
  const preview = question.subject || question.question.slice(0, 80);
  return `**#${question.question_number}** [${question.status}] - ${preview}`;
}

function formatFull(question) {
  return (
    `## Anonymous Question #${question.question_number}\n` +
    `**Status:** ${question.status}\n` +
    (question.subject ? `**Subject:** ${question.subject}\n` : '') +
    `**Question:**\n${question.question}\n\n` +
    `**Created:** ${question.created_at}`
  );
}

function formatAuditEntry(entry) {
  if (entry.action === 'submitted') {
    return `${entry.created_at} - **submitted** through Pank`;
  }

  return (
    `${entry.created_at} - **${entry.action}** by ` +
    `<@${entry.actor_id}>`
  );
}
