const recentPurgeActions = [];

export function rememberPurgeAction({ guildId, channelId, moderator, amount }) {
  recentPurgeActions.push({
    guildId,
    channelId,
    moderator,
    amount,
    timestamp: Date.now()
  });
}

export function findRecentPurgeAction({ guildId, channelId, count }) {
  const now = Date.now();

  return recentPurgeActions.find((action) => {
    const recent = now - action.timestamp < 15000;
    const sameGuild = action.guildId === guildId;
    const sameChannel = action.channelId === channelId;
    const similarCount = !count || action.amount === count;

    return recent && sameGuild && sameChannel && similarCount;
  });
}
