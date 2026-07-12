import {
      AuditLogEvent,
      EmbedBuilder
    } from 'discord.js';

    import { config } from '../../config/config.js';
    import { waitForAuditLogEntry } from '../../services/auditLogService.js';

    const CREATE_COLOUR = 0x2ecc71;
    const UPDATE_COLOUR = 0x3498db;
    const DELETE_COLOUR = 0xe74c3c;

    const MAX_FIELD_VALUE_LENGTH = 1000;
    const MAX_PERMISSION_LIST_LENGTH = 900;
    const MAX_CHANGE_FIELDS = 20;

    export async function handleRoleCreate(role) {
      if (!role.guild) return;

      const logChannel = await getLogChannel(role.guild.client);
      if (!logChannel) return;

      const auditEntry = await findRoleAuditEntry(
        role,
        AuditLogEvent.RoleCreate
      );

      const createdBy = auditEntry?.executor ?? null;
      const reason = auditEntry?.reason ?? null;
      const timestamp = Math.floor(Date.now() / 1000);

      const fields = [
        {
          name: '🎭 Role',
          value: formatRole(role),
          inline: false
        },
        {
          name: '🎨 Colour',
          value: formatRoleColour(role),
          inline: true
        },
        {
          name: '📍 Position',
          value: formatRolePosition(role),
          inline: true
        },
        {
          name: '📌 Display Separately',
          value: formatEnabled(role.hoist),
          inline: true
        },
        {
          name: '📣 Mentionable',
          value: formatEnabled(role.mentionable),
          inline: true
        },
        {
          name: '🤖 Managed',
          value: formatEnabled(role.managed),
          inline: true
        },
        {
          name: '🔐 Permissions',
          value: formatPermissions(role.permissions),
          inline: false
        },
        {
          name: '🕒 Created',
          value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
          inline: false
        },
        {
          name: '🛡️ Moderator',
          value: formatModerator(
            createdBy,
            'Unable to determine who created this role.'
          ),
          inline: false
        }
      ];

      if (reason) {
        fields.push({
          name: '📝 Reason',
          value: shortenText(reason, MAX_FIELD_VALUE_LENGTH),
          inline: false
        });
      }

      const embed = new EmbedBuilder()
        .setColor(CREATE_COLOUR)
        .setTitle('➕ Role Created')
        .addFields(fields)
        .setFooter({ text: `🆔 Role ID: ${role.id}` });

      const iconUrl = getRoleIconUrl(role);

      if (iconUrl) {
        embed.setThumbnail(iconUrl);
      }

      await logChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] }
      });
    }

    export async function handleRoleDelete(role) {
      if (!role.guild) return;

      const logChannel = await getLogChannel(role.guild.client);
      if (!logChannel) return;

      const auditEntry = await findRoleAuditEntry(
        role,
        AuditLogEvent.RoleDelete
      );

      const deletedBy = auditEntry?.executor ?? null;
      const reason = auditEntry?.reason ?? null;
      const timestamp = Math.floor(Date.now() / 1000);

      const fields = [
        {
          name: '🎭 Role',
          value: role.name,
          inline: false
        },
        {
          name: '🎨 Colour',
          value: formatRoleColour(role),
          inline: true
        },
        {
          name: '📍 Position',
          value: formatRolePosition(role),
          inline: true
        },
        {
          name: '📌 Displayed Separately',
          value: formatEnabled(role.hoist),
          inline: true
        },
        {
          name: '📣 Mentionable',
          value: formatEnabled(role.mentionable),
          inline: true
        },
        {
          name: '🤖 Managed',
          value: formatEnabled(role.managed),
          inline: true
        },
        {
          name: '🔐 Permissions',
          value: formatPermissions(role.permissions),
          inline: false
        },
        {
          name: '🕒 Deleted',
          value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
          inline: false
        },
        {
          name: '🛡️ Moderator',
          value: formatModerator(
            deletedBy,
            'Unable to determine who deleted this role.'
          ),
          inline: false
        }
      ];

      if (reason) {
        fields.push({
          name: '📝 Reason',
          value: shortenText(reason, MAX_FIELD_VALUE_LENGTH),
          inline: false
        });
      }

      const embed = new EmbedBuilder()
        .setColor(DELETE_COLOUR)
        .setTitle('🗑️ Role Deleted')
        .addFields(fields)
        .setFooter({ text: `🆔 Role ID: ${role.id}` });

      const iconUrl = getRoleIconUrl(role);

      if (iconUrl) {
        embed.setThumbnail(iconUrl);
      }

      await logChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] }
      });
    }

    export async function handleRoleUpdate(oldRole, newRole) {
      if (!oldRole?.guild || !newRole?.guild) return;

      const changes = buildRoleChanges(oldRole, newRole);
      if (changes.length === 0) return;

      const logChannel = await getLogChannel(newRole.guild.client);
      if (!logChannel) return;

      const auditEntry = await findRoleAuditEntry(
        newRole,
        AuditLogEvent.RoleUpdate
      );

      const updatedBy = auditEntry?.executor ?? null;
      const reason = auditEntry?.reason ?? null;
      const timestamp = Math.floor(Date.now() / 1000);

      const visibleChanges = changes.slice(0, MAX_CHANGE_FIELDS);
      const hiddenChangeCount = changes.length - visibleChanges.length;

      const fields = [
        {
          name: '🎭 Role',
          value: formatRole(newRole),
          inline: false
        },
        {
          name: '🕒 Updated',
          value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
          inline: false
        },
        ...visibleChanges
      ];

      if (hiddenChangeCount > 0) {
        fields.push({
          name: 'ℹ️ Additional Changes',
          value:
            `${hiddenChangeCount} additional setting` +
            `${hiddenChangeCount === 1 ? ' was' : 's were'} changed.`,
          inline: false
        });
      }

      fields.push({
        name: '🛡️ Moderator',
        value: formatModerator(
          updatedBy,
          'Unable to determine who updated this role.'
        ),
        inline: false
      });

      if (reason) {
        fields.push({
          name: '📝 Reason',
          value: shortenText(reason, MAX_FIELD_VALUE_LENGTH),
          inline: false
        });
      }

      const embed = new EmbedBuilder()
        .setColor(UPDATE_COLOUR)
        .setTitle('✏️ Role Updated')
        .addFields(fields)
        .setFooter({ text: `🆔 Role ID: ${newRole.id}` });

      const iconUrl = getRoleIconUrl(newRole);

      if (iconUrl) {
        embed.setThumbnail(iconUrl);
      }

      await logChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] }
      });
    }

    function buildRoleChanges(oldRole, newRole) {
      const changes = [];

      addChange(
        changes,
        '🏷️ Name',
        oldRole.name,
        newRole.name
      );

      addChange(
        changes,
        '🎨 Colour',
        formatRoleColour(oldRole),
        formatRoleColour(newRole)
      );

      addChange(
        changes,
        '📍 Position',
        formatRolePosition(oldRole),
        formatRolePosition(newRole)
      );

      addChange(
        changes,
        '📌 Display Separately',
        formatEnabled(oldRole.hoist),
        formatEnabled(newRole.hoist)
      );

      addChange(
        changes,
        '📣 Mentionable',
        formatEnabled(oldRole.mentionable),
        formatEnabled(newRole.mentionable)
      );

      addChange(
        changes,
        '🤖 Managed',
        formatEnabled(oldRole.managed),
        formatEnabled(newRole.managed)
      );

      addChange(
        changes,
        '🖼️ Role Icon',
        formatRoleIcon(oldRole),
        formatRoleIcon(newRole)
      );

      addPermissionChanges(
        changes,
        oldRole.permissions,
        newRole.permissions
      );

      return changes;
    }

    function addPermissionChanges(changes, oldPermissions, newPermissions) {
      const oldPermissionNames = new Set(oldPermissions.toArray());
      const newPermissionNames = new Set(newPermissions.toArray());

      const added = [...newPermissionNames]
        .filter((permission) => !oldPermissionNames.has(permission))
        .sort();

      const removed = [...oldPermissionNames]
        .filter((permission) => !newPermissionNames.has(permission))
        .sort();

      if (added.length === 0 && removed.length === 0) return;

      const sections = [];

      if (added.length > 0) {
        sections.push(
          `**Added**\n${formatPermissionNames(added)}`
        );
      }

      if (removed.length > 0) {
        sections.push(
          `**Removed**\n${formatPermissionNames(removed)}`
        );
      }

      changes.push({
        name: '🔐 Permissions',
        value: shortenText(
          sections.join('\n\n'),
          MAX_FIELD_VALUE_LENGTH
        ),
        inline: false
      });
    }

    function addChange(changes, name, before, after) {
      const formattedBefore = normaliseValue(before);
      const formattedAfter = normaliseValue(after);

      if (formattedBefore === formattedAfter) return;

      changes.push({
        name,
        value: shortenText(
          `**Before**\n${formattedBefore}\n\n` +
          `**After**\n${formattedAfter}`,
          MAX_FIELD_VALUE_LENGTH
        ),
        inline: false
      });
    }

    async function getLogChannel(client) {
      const logChannel = await client.channels
        .fetch(config.messageLogChannelId)
        .catch(() => null);

      if (!logChannel) {
        console.log('❌ Could not find server log channel.');
        return null;
      }

      return logChannel;
    }

    async function findRoleAuditEntry(role, type) {
      return waitForAuditLogEntry({
        guild: role.guild,
        type,
        timeout: 3000,
        match: (log) => {
          const recent =
            Date.now() - log.createdTimestamp < 10000;

          const sameTarget =
            log.target?.id === role.id ||
            log.targetId === role.id;

          return recent && sameTarget;
        }
      });
    }

    function formatRole(role) {
      return `<@&${role.id}>\nName: ${role.name}`;
    }

    function formatRoleColour(role) {
      if (!role.color) return 'Default';

      return `${role.hexColor} (${role.color})`;
    }

    function formatRolePosition(role) {
      const position =
        role.rawPosition ?? role.position;

      if (typeof position !== 'number') return 'Unknown';

      return String(position);
    }

    function formatRoleIcon(role) {
      if (role.unicodeEmoji) {
        return `${role.unicodeEmoji} Unicode emoji`;
      }

      const iconUrl = getRoleIconUrl(role);

      if (iconUrl) {
        return `[Custom icon](${iconUrl})`;
      }

      return 'None';
    }

    function getRoleIconUrl(role) {
      if (typeof role.iconURL !== 'function') return null;

      return role.iconURL({ size: 256 });
    }

    function formatPermissions(permissions) {
      const names = permissions.toArray().sort();

      if (names.length === 0) return 'None';

      return shortenText(
        formatPermissionNames(names),
        MAX_PERMISSION_LIST_LENGTH
      );
    }

    function formatPermissionNames(names) {
      return names
        .map((name) => `• ${splitPascalCase(name)}`)
        .join('\n');
    }

    function splitPascalCase(value) {
      return value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
    }

    function formatEnabled(value) {
      return value ? 'Yes' : 'No';
    }

    function formatModerator(moderator, unknownMessage) {
      if (!moderator) {
        return `Unknown\n${unknownMessage}`;
      }

      return (
        `<@${moderator.id}>\n` +
        `Username: ${moderator.tag}`
      );
    }

    function normaliseValue(value) {
      if (
        value === null ||
        value === undefined ||
        value === ''
      ) {
        return 'None';
      }

      return String(value);
    }

    function shortenText(text, maxLength) {
      if (text.length <= maxLength) return text;

      return `${text.slice(0, maxLength - 3)}...`;
    }
