import { getDatabase } from '../database.js';

export function createTicket({ guildId, creatorId, userChannelId, staffChannelId, subject, details }) {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const counter = db.prepare(`SELECT next_number FROM ticket_counters WHERE guild_id = ?`).get(guildId);
    const number = Number(counter?.next_number ?? 1);
    db.prepare(`INSERT INTO ticket_counters (guild_id, next_number) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET next_number = excluded.next_number`).run(guildId, number + 1);
    const result = db.prepare(`
      INSERT INTO tickets (guild_id, ticket_number, creator_id, user_channel_id, staff_channel_id, subject, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, number, creatorId, userChannelId, staffChannelId, subject, details);
    addTicketAuditInternal(db, { guildId, ticketId: Number(result.lastInsertRowid), actorId: creatorId, action: 'opened', details: subject });
    db.exec('COMMIT');
    return getTicketById(Number(result.lastInsertRowid));
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function getTicketById(id) {
  return getDatabase().prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) ?? null;
}
export function getTicketByNumber(guildId, ticketNumber) {
  return getDatabase().prepare(`SELECT * FROM tickets WHERE guild_id = ? AND ticket_number = ? LIMIT 1`).get(guildId, ticketNumber) ?? null;
}
export function getTicketByChannel(guildId, channelId) {
  return getDatabase().prepare(`SELECT * FROM tickets WHERE guild_id = ? AND (user_channel_id = ? OR staff_channel_id = ?)`)
    .get(guildId, channelId, channelId) ?? null;
}
export function getOpenTicketByCreator(guildId, creatorId) {
  return getDatabase().prepare(`SELECT * FROM tickets WHERE guild_id = ? AND creator_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`).get(guildId, creatorId) ?? null;
}
export function countOpenTickets(guildId) {
  return Number(getDatabase().prepare(`SELECT COUNT(*) AS count FROM tickets WHERE guild_id = ? AND status = 'open'`).get(guildId)?.count ?? 0);
}
export function listTicketsForGuild(guildId) {
  return getDatabase().prepare(`SELECT * FROM tickets WHERE guild_id = ? ORDER BY ticket_number ASC`).all(guildId);
}
export function updateTicketStatus({ ticketId, guildId, status, actorId, reason = null }) {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (status === 'closed') db.prepare(`UPDATE tickets SET status='closed', closed_by=?, closed_at=CURRENT_TIMESTAMP, close_reason=? WHERE id=? AND guild_id=?`).run(actorId, reason, ticketId, guildId);
    else db.prepare(`UPDATE tickets SET status='open', reopened_by=?, reopened_at=CURRENT_TIMESTAMP WHERE id=? AND guild_id=?`).run(actorId, ticketId, guildId);
    addTicketAuditInternal(db, { guildId, ticketId, actorId, action: status, details: reason });
    db.exec('COMMIT');
    return getTicketById(ticketId);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function claimTicket({ ticketId, guildId, moderatorId }) {
  const db = getDatabase();
  db.prepare(`UPDATE tickets SET claimed_by=?, claimed_at=CURRENT_TIMESTAMP WHERE id=? AND guild_id=?`).run(moderatorId, ticketId, guildId);
  addTicketAudit({ guildId, ticketId, actorId: moderatorId, action: 'claimed' });
  return getTicketById(ticketId);
}
export function renameTicket({ ticketId, guildId, actorId, name }) {
  const db = getDatabase();
  db.prepare(`UPDATE tickets SET channel_name=? WHERE id=? AND guild_id=?`).run(name, ticketId, guildId);
  addTicketAudit({ guildId, ticketId, actorId, action: 'renamed', details: name });
}
export function addTicketMessage({ guildId, ticketId, authorId, authorType, content, attachments = [], sourceMessageId = null, proxyMessageId = null }) {
  const db = getDatabase();
  const result = db.prepare(`INSERT INTO ticket_messages (guild_id,ticket_id,author_id,author_type,content,attachments_json,source_message_id,proxy_message_id) VALUES (?,?,?,?,?,?,?,?)`)
    .run(guildId, ticketId, authorId, authorType, content ?? '', JSON.stringify(attachments), sourceMessageId, proxyMessageId);
  return Number(result.lastInsertRowid);
}
export function addTicketAudit({ guildId, ticketId, actorId, action, details = null }) {
  addTicketAuditInternal(getDatabase(), { guildId, ticketId, actorId, action, details });
}
function addTicketAuditInternal(db, { guildId, ticketId, actorId, action, details = null }) {
  db.prepare(`INSERT INTO ticket_audit (guild_id,ticket_id,actor_id,action,details) VALUES (?,?,?,?,?)`).run(guildId,ticketId,actorId,action,details);
}
export function listTicketMessages(guildId, ticketId) {
  return getDatabase().prepare(`SELECT * FROM ticket_messages WHERE guild_id=? AND ticket_id=? ORDER BY id ASC`).all(guildId,ticketId);
}
export function listTicketAudit(guildId, ticketId) {
  return getDatabase().prepare(`SELECT * FROM ticket_audit WHERE guild_id=? AND ticket_id=? ORDER BY id ASC`).all(guildId,ticketId);
}

export function permanentlyDeleteTicket({ guildId, ticketNumber }) {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const ticket = db.prepare(`SELECT * FROM tickets WHERE guild_id = ? AND ticket_number = ?`).get(guildId, ticketNumber);
    if (!ticket) { db.exec('ROLLBACK'); return null; }
    db.prepare(`DELETE FROM tickets WHERE id = ? AND guild_id = ?`).run(ticket.id, guildId);
    const remaining = Number(db.prepare(`SELECT COUNT(*) AS count FROM tickets WHERE guild_id = ?`).get(guildId)?.count ?? 0);
    if (remaining === 0) {
      db.prepare(`INSERT INTO ticket_counters (guild_id,next_number) VALUES (?,1) ON CONFLICT(guild_id) DO UPDATE SET next_number=1`).run(guildId);
    }
    db.exec('COMMIT');
    return ticket;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function resetTicketsForGuild(guildId) {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const tickets = db.prepare(`SELECT * FROM tickets WHERE guild_id = ? ORDER BY ticket_number ASC`).all(guildId);
    db.prepare(`DELETE FROM tickets WHERE guild_id = ?`).run(guildId);
    db.prepare(`INSERT INTO ticket_counters (guild_id,next_number) VALUES (?,1) ON CONFLICT(guild_id) DO UPDATE SET next_number=1`).run(guildId);
    db.exec('COMMIT');
    return tickets;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function linkTicketToCase({ guildId, ticketId, moderationCaseId, linkedBy }) {
  const db = getDatabase();
  db.prepare(`INSERT OR IGNORE INTO ticket_case_links (guild_id,ticket_id,moderation_case_id,linked_by) VALUES (?,?,?,?)`)
    .run(guildId, ticketId, moderationCaseId, linkedBy);
  addTicketAudit({ guildId, ticketId, actorId: linkedBy, action: 'case_linked', details: String(moderationCaseId) });
}
export function unlinkTicketFromCase({ guildId, ticketId, moderationCaseId, actorId }) {
  const db = getDatabase();
  const result = db.prepare(`DELETE FROM ticket_case_links WHERE guild_id=? AND ticket_id=? AND moderation_case_id=?`).run(guildId,ticketId,moderationCaseId);
  if (Number(result.changes) > 0) addTicketAudit({ guildId, ticketId, actorId, action: 'case_unlinked', details: String(moderationCaseId) });
  return Number(result.changes) > 0;
}
export function listCasesForTicket(guildId, ticketId) {
  return getDatabase().prepare(`
    SELECT mc.* FROM ticket_case_links l
    JOIN moderation_cases mc ON mc.id = l.moderation_case_id
    WHERE l.guild_id=? AND l.ticket_id=?
    ORDER BY mc.case_number ASC
  `).all(guildId,ticketId);
}
export function listTicketsForCase(guildId, moderationCaseId) {
  return getDatabase().prepare(`
    SELECT t.* FROM ticket_case_links l
    JOIN tickets t ON t.id = l.ticket_id
    WHERE l.guild_id=? AND l.moderation_case_id=?
    ORDER BY t.ticket_number ASC
  `).all(guildId,moderationCaseId);
}
