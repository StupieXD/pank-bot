const memberStateCache = new Map();

function getCacheKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

export function getMemberState(member) {
  return memberStateCache.get(getCacheKey(member.guild.id, member.id)) ?? null;
}

export function cacheMemberState(member) {
  memberStateCache.set(getCacheKey(member.guild.id, member.id), {
    nickname: member.nickname,
    communicationDisabledUntilTimestamp: member.communicationDisabledUntilTimestamp,
    roleIds: new Set(
      member.roles.cache
        .filter((role) => role.id !== member.guild.id)
        .map((role) => role.id)
    )
  });
}

export function deleteMemberState(member) {
  memberStateCache.delete(getCacheKey(member.guild.id, member.id));
}
