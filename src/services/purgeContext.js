const recentPurgeActions = [];

export function rememberPurgeAction({
  guildId,
  channelId,
  moderator,
  amount,
  reason = 'No reason provided',
  filters = {},
  archivedMessages = []
}) {
  recentPurgeActions.push({
    guildId,
    channelId,
    moderator,
    amount,
    reason,
    filters,
    archivedMessages,
    timestamp: Date.now()
  });
}

export function findRecentPurgeAction({ guildId, channelId, count }) {
  const now = Date.now();

  return recentPurgeActions.find((action) => {
    const recent = now - action.timestamp < 15000;
    const sameGuild = action.guildId === guildId;
    const sameChannel = action.channelId === channelId;
    const similarCount = !count || action.amount === count || count <= action.amount;

    return recent && sameGuild && sameChannel && similarCount;
  });
}
