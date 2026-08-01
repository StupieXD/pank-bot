import { getDatabase } from '../database.js';

export function isLockdownActive(guildId) {
  return Boolean(getDatabase().prepare(`SELECT 1 FROM lockdown_state WHERE guild_id = ? AND active = 1`).get(guildId));
}

export function beginLockdown({ guildId, enabledBy, reason }) {
  getDatabase().prepare(`
    INSERT INTO lockdown_state (guild_id, active, enabled_by, reason, enabled_at)
    VALUES (?, 1, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(guild_id) DO UPDATE SET active = 1, enabled_by = excluded.enabled_by,
      reason = excluded.reason, enabled_at = CURRENT_TIMESTAMP, disabled_by = NULL, disabled_at = NULL
  `).run(guildId, enabledBy, reason);
}

export function finishLockdown({ guildId, disabledBy }) {
  getDatabase().prepare(`
    UPDATE lockdown_state SET active = 0, disabled_by = ?, disabled_at = CURRENT_TIMESTAMP WHERE guild_id = ?
  `).run(disabledBy, guildId);
}

export function saveLockdownChannelState({ guildId, channelId, sendMessagesState, sendMessagesInThreadsState, createPublicThreadsState, createPrivateThreadsState }) {
  getDatabase().prepare(`
    INSERT OR REPLACE INTO lockdown_channel_states
    (guild_id, channel_id, send_messages_state, send_messages_in_threads_state, create_public_threads_state, create_private_threads_state)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, channelId, sendMessagesState, sendMessagesInThreadsState, createPublicThreadsState, createPrivateThreadsState);
}

export function getLockdownChannelStates(guildId) {
  return getDatabase().prepare(`SELECT * FROM lockdown_channel_states WHERE guild_id = ?`).all(guildId);
}

export function clearLockdownChannelStates(guildId) {
  getDatabase().prepare(`DELETE FROM lockdown_channel_states WHERE guild_id = ?`).run(guildId);
}
