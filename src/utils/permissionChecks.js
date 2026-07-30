import { PermissionFlagsBits } from 'discord.js';

export function requireGuildInteraction(interaction) {
  if (!interaction.inGuild() || !interaction.guild) {
    return 'This command can only be used in a server.';
  }

  return null;
}

export function requireMemberPermission(interaction, permission, label) {
  const guildError = requireGuildInteraction(interaction);
  if (guildError) return guildError;

  if (!interaction.memberPermissions?.has(permission)) {
    return `You need the ${label} permission to use this.`;
  }

  return null;
}

export function requireBotPermission(interaction, permission, label, channel = null) {
  const guildError = requireGuildInteraction(interaction);
  if (guildError) return guildError;

  const botMember = interaction.guild.members.me;
  if (!botMember) return 'Pank could not resolve its server member record.';

  const permissions = channel?.permissionsFor
    ? channel.permissionsFor(botMember)
    : botMember.permissions;

  if (!permissions?.has(permission)) {
    return `Pank needs the ${label} permission${channel ? ' in this channel' : ''}.`;
  }

  return null;
}

export function requireManageGuild(interaction) {
  return requireMemberPermission(
    interaction,
    PermissionFlagsBits.ManageGuild,
    'Manage Server'
  );
}
