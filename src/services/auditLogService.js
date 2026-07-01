export async function waitForAuditLogEntry({
  guild,
  type,
  match,
  timeout = 3000,
  interval = 500
}) {
  const end = Date.now() + timeout;

  while (Date.now() < end) {
    try {
      const logs = await guild.fetchAuditLogs({
        type,
        limit: 5
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
