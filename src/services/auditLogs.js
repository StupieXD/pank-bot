import { AuditLogEvent } from 'discord.js';

export async function findBulkDeleteModerator(guild, deletedChannelId, deletedCount) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MessageBulkDelete,
        limit: 10
      });

      const entry = logs.entries.find((log) => {
        const recent = Date.now() - log.createdTimestamp < 15000;
        const sameChannel = log.extra?.channel?.id === deletedChannelId;

        const similarCount =
          typeof log.extra?.count === 'number'
            ? Math.abs(log.extra.count - deletedCount) <= 2
            : true;

        return recent && sameChannel && similarCount;
      });

      if (entry?.executor) return entry.executor;
    } catch (error) {
      console.log(`Could not fetch audit logs: ${error.message}`);
      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return null;
}
