import { getDatabase } from '../database.js';

export function getChannelLock(guildId, channelId) {
  return getDatabase().prepare(`
    SELECT
      guild_id AS guildId,
      channel_id AS channelId,
      send_messages_state AS sendMessagesState,
      send_messages_in_threads_state AS sendMessagesInThreadsState,
      moderator_id AS moderatorId,
      reason,
      created_at AS createdAt
    FROM channel_locks
    WHERE guild_id = ? AND channel_id = ?
  `).get(guildId, channelId) ?? null;
}

export function createChannelLock({
  guildId,
  channelId,
  sendMessagesState,
  sendMessagesInThreadsState,
  moderatorId,
  reason
}) {
  getDatabase().prepare(`
    INSERT INTO channel_locks (
      guild_id,
      channel_id,
      send_messages_state,
      send_messages_in_threads_state,
      moderator_id,
      reason
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    channelId,
    sendMessagesState,
    sendMessagesInThreadsState,
    moderatorId,
    reason
  );

  return getChannelLock(guildId, channelId);
}

export function deleteChannelLock(guildId, channelId) {
  return getDatabase().prepare(`
    DELETE FROM channel_locks
    WHERE guild_id = ? AND channel_id = ?
  `).run(guildId, channelId).changes > 0;
}
