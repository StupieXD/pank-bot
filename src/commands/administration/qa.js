import {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

import {
  addAnonymousQaAudit,
  archiveAnonymousQuestion,
  getAnonymousQuestion,
  listAnonymousQaAudit,
  listAnonymousQuestions,
  markAnonymousQuestionAnswered,
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
      .setName('export')
      .setDescription('Export recent questions as a text file.')
      .addStringOption((option) =>
        option
          .setName('status')
          .setDescription('Filter by status')
          .addChoices(
            { name: 'Open', value: 'open' },
            { name: 'Answered', value: 'answered' },
            { name: 'Archived', value: 'archived' }
          )
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const status = interaction.options.getString('status');

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
          `#${question.id} [${question.status}] ` +
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
      submissionId: id,
      actorId: interaction.user.id,
      action: 'marked_answered',
      details: null
    });

    return interaction.reply({
      content: `Success: Question #${id} marked answered.`,
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
      submissionId: id,
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
  return `**#${question.id}** [${question.status}] â ${preview}`;
}

function formatFull(question) {
  return (
    `## Anonymous Question #${question.id}\n` +
    `**Status:** ${question.status}\n` +
    (question.subject ? `**Subject:** ${question.subject}\n` : '') +
    `**Question:**\n${question.question}\n\n` +
    `**Created:** ${question.created_at}`
  );
}

function formatAuditEntry(entry) {
  if (entry.action === 'submitted') {
    return `${entry.created_at} â **submitted** through Pank`;
  }

  return (
    `${entry.created_at} â **${entry.action}** by ` +
    `<@${entry.actor_id}>`
  );
}
