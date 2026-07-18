export async function waitForAuditLogEntry({
  guild,
  type,
  match,
  timeout = 5000,
  interval = 250,
  limit = 10
}) {
  const end = Date.now() + timeout;

  while (Date.now() < end) {
    try {
      const logs = await guild.fetchAuditLogs({
        type,
        limit
      });

      const entry = logs.entries.find(match);

      if (entry) return entry;
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return null;
}
