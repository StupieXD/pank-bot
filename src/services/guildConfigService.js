import {
  deleteGuildConfigValue,
  getGuildConfig,
  getGuildConfigValue,
  setGuildConfigValue
} from '../database/repositories/guildConfigRepository.js';

export const GUILD_CONFIG_KEYS = Object.freeze({
  STAFF_ROLE_ID: 'staff_role_id',
  TICKET_CATEGORY_ID: 'ticket_category_id',
  CLOSED_TICKET_CATEGORY_ID: 'closed_ticket_category_id',
  TICKET_LOG_CHANNEL_ID: 'ticket_log_channel_id',
  TICKET_STAFF_CATEGORY_ID: 'ticket_staff_category_id',
  TICKET_PANEL_CHANNEL_ID: 'ticket_panel_channel_id',
  TICKET_PANEL_MESSAGE_ID: 'ticket_panel_message_id',
  TICKET_PANEL_TITLE: 'ticket_panel_title',
  TICKET_PANEL_BODY: 'ticket_panel_body',
  ANONYMOUS_QA_RECIPIENT_ID: 'anonymous_qa_recipient_id',
  ANONYMOUS_QA_OVERRIDE_ROLE_ID: 'anonymous_qa_override_role_id',
  EMERGENCY_CHANNEL_ID: 'emergency_channel_id'
});

const KNOWN_KEYS = new Set(Object.values(GUILD_CONFIG_KEYS));

export function getConfig(guildId) {
  return getGuildConfig(guildId);
}

export function getConfigValue(guildId, key, fallback = null) {
  assertKnownKey(key);
  return getGuildConfigValue(guildId, key) ?? fallback;
}

export function setConfigValue({ guildId, key, value, updatedBy }) {
  assertKnownKey(key);

  if (value === null || value === undefined || value === '') {
    deleteGuildConfigValue(guildId, key);
    return null;
  }

  setGuildConfigValue({ guildId, key, value, updatedBy });
  return String(value);
}

export function resetConfigValue(guildId, key) {
  assertKnownKey(key);
  return deleteGuildConfigValue(guildId, key);
}

function assertKnownKey(key) {
  if (!KNOWN_KEYS.has(key)) {
    throw new Error(`Unknown guild configuration key: ${key}`);
  }
}
