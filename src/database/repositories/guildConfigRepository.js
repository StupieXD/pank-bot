import { getDatabase } from '../database.js';

export function getGuildConfig(guildId) {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT setting_key, setting_value
    FROM guild_config
    WHERE guild_id = ?
  `).all(guildId);

  return Object.fromEntries(
    rows.map((row) => [row.setting_key, row.setting_value])
  );
}

export function getGuildConfigValue(guildId, key) {
  const database = getDatabase();
  const row = database.prepare(`
    SELECT setting_value
    FROM guild_config
    WHERE guild_id = ? AND setting_key = ?
  `).get(guildId, key);

  return row?.setting_value ?? null;
}

export function setGuildConfigValue({ guildId, key, value, updatedBy }) {
  const database = getDatabase();

  database.prepare(`
    INSERT INTO guild_config (
      guild_id,
      setting_key,
      setting_value,
      updated_by,
      updated_at
    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (guild_id, setting_key)
    DO UPDATE SET
      setting_value = excluded.setting_value,
      updated_by = excluded.updated_by,
      updated_at = CURRENT_TIMESTAMP
  `).run(guildId, key, String(value), updatedBy);
}

export function deleteGuildConfigValue(guildId, key) {
  const database = getDatabase();
  return database.prepare(`
    DELETE FROM guild_config
    WHERE guild_id = ? AND setting_key = ?
  `).run(guildId, key).changes > 0;
}

export function clearGuildConfig(guildId) {
  const database = getDatabase();
  return database.prepare(`
    DELETE FROM guild_config
    WHERE guild_id = ?
  `).run(guildId).changes;
}
