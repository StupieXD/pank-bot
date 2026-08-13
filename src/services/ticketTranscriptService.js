import { AttachmentBuilder } from 'discord.js';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import {
  listCasesForTicket,
  listTicketAudit,
  listTicketMessages
} from '../database/repositories/ticketRepository.js';

const TRANSCRIPT_ROOT = join(process.cwd(), 'data', 'transcripts', 'tickets');

export function buildInternalTicketTranscript(ticket) {
  const html = buildInternalTicketHtml(ticket);
  return new AttachmentBuilder(Buffer.from(html, 'utf8'))
    .setName(transcriptFilename(ticket));
}

export function buildInternalTicketHtml(ticket) {
  const messages = listTicketMessages(ticket.guild_id, ticket.id);
  const audit = listTicketAudit(ticket.guild_id, ticket.id);
  const cases = listCasesForTicket(ticket.guild_id, ticket.id);

  const messageRows = messages.length
    ? messages.map(renderMessage).join('\n')
    : '<div class="empty">No stored ticket messages.</div>';

  const auditRows = audit.length
    ? audit.map(renderAudit).join('\n')
    : '<div class="empty">No audit entries.</div>';

  const linkedCases = cases.length
    ? cases.map((item) => `Case #${item.case_number}`).join(', ')
    : 'None';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pank Ticket #${escapeHtml(ticket.ticket_number)} Transcript</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    background: #0f1117;
    color: #e8eaf0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.5;
  }
  main { max-width: 980px; margin: 0 auto; padding: 32px 18px 64px; }
  h1, h2 { margin: 0 0 14px; }
  h2 { margin-top: 30px; font-size: 1.15rem; }
  .card, .message, .audit {
    background: #181b24;
    border: 1px solid #2a2e3a;
    border-radius: 10px;
  }
  .card { padding: 18px; }
  .grid {
    display: grid;
    grid-template-columns: minmax(130px, 180px) 1fr;
    gap: 8px 14px;
  }
  .label { color: #9ca3b3; font-weight: 600; }
  .message { padding: 14px 16px; margin: 10px 0; }
  .message.mod { border-left: 4px solid #7c8cff; }
  .message.user { border-left: 4px solid #44c28d; }
  .meta, .timestamp { color: #9ca3b3; font-size: .9rem; }
  .content { white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 8px; }
  .attachments { margin: 10px 0 0; padding-left: 20px; }
  a { color: #8fb3ff; }
  .audit { padding: 10px 14px; margin: 8px 0; }
  .empty { color: #9ca3b3; font-style: italic; }
  footer { color: #7f8797; margin-top: 34px; font-size: .85rem; }
</style>
</head>
<body>
<main>
  <h1>Pank Ticket #${escapeHtml(ticket.ticket_number)}</h1>
  <div class="card">
    <div class="grid">
      <div class="label">Creator ID</div><div>${escapeHtml(ticket.creator_id)}</div>
      <div class="label">Subject</div><div>${escapeHtml(ticket.subject || 'No subject')}</div>
      <div class="label">Details</div><div>${escapeHtml(ticket.details || '')}</div>
      <div class="label">Status</div><div>${escapeHtml(ticket.status)}</div>
      <div class="label">Opened</div><div>${escapeHtml(ticket.created_at || 'Unknown')}</div>
      <div class="label">Closed</div><div>${escapeHtml(ticket.closed_at || 'Not closed')}</div>
      <div class="label">Closed by</div><div>${escapeHtml(ticket.closed_by || 'Unknown')}</div>
      <div class="label">Close reason</div><div>${escapeHtml(ticket.close_reason || 'None')}</div>
      <div class="label">Claimed by</div><div>${escapeHtml(ticket.claimed_by || 'Unclaimed')}</div>
      <div class="label">Linked cases</div><div>${escapeHtml(linkedCases)}</div>
    </div>
  </div>

  <h2>Conversation</h2>
  ${messageRows}

  <h2>Audit trail</h2>
  ${auditRows}

  <footer>
    Internal Pank transcript. Moderator identities shown here are staff-only information.
    Attachment files are not duplicated; stored links may expire or become unavailable.
  </footer>
</main>
</body>
</html>`;
}

export function ensurePermanentTicketTranscript(ticket) {
  if (ticket.transcript_path) {
    const existingPath = resolveStoredTranscriptPath(ticket.transcript_path);
    if (existsSync(existingPath)) {
      return {
        absolutePath: existingPath,
        relativePath: normalizeStoredPath(ticket.transcript_path),
        created: false
      };
    }
  }

  const absolutePath = join(
    TRANSCRIPT_ROOT,
    safePathPart(ticket.guild_id),
    transcriptFilename(ticket)
  );
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, buildInternalTicketHtml(ticket), 'utf8');

  return {
    absolutePath,
    relativePath: normalizeStoredPath(relative(process.cwd(), absolutePath)),
    created: true
  };
}

export function buildStoredTranscriptAttachment(transcriptPath, ticket) {
  const absolutePath = resolveStoredTranscriptPath(transcriptPath);
  if (!existsSync(absolutePath)) return null;
  return new AttachmentBuilder(readFileSync(absolutePath))
    .setName(transcriptFilename(ticket));
}

export function deleteStoredTicketTranscript(ticket) {
  if (!ticket?.transcript_path) return false;
  const absolutePath = resolveStoredTranscriptPath(ticket.transcript_path);
  if (!existsSync(absolutePath)) return false;
  rmSync(absolutePath, { force: true });
  return true;
}

export function transcriptExists(ticket) {
  return Boolean(
    ticket?.transcript_path
    && existsSync(resolveStoredTranscriptPath(ticket.transcript_path))
  );
}

function renderMessage(row) {
  const type = row.author_type === 'moderator' ? 'mod' : 'user';
  const role = row.author_type === 'moderator'
    ? 'Moderator (internal identity)'
    : row.author_type === 'user'
      ? 'Ticket creator'
      : row.author_type || 'Unknown';

  let attachments = [];
  try {
    attachments = JSON.parse(row.attachments_json || '[]');
  } catch {
    attachments = [];
  }

  const attachmentList = attachments.length
    ? `<ul class="attachments">${attachments.map((url) => {
        const safeUrl = escapeAttribute(url);
        return `<li><a href="${safeUrl}" rel="noreferrer noopener">${escapeHtml(url)}</a></li>`;
      }).join('')}</ul>`
    : '';

  return `<article class="message ${type}">
    <div class="meta"><strong>${escapeHtml(role)}</strong> Â· Discord ID ${escapeHtml(row.author_id)} Â· ${escapeHtml(row.created_at)}</div>
    <div class="content">${escapeHtml(row.content || '[attachment only]')}</div>
    ${attachmentList}
  </article>`;
}

function renderAudit(row) {
  return `<div class="audit">
    <div><strong>${escapeHtml(row.action)}</strong> by ${escapeHtml(row.actor_id)}</div>
    <div class="timestamp">${escapeHtml(row.created_at)}${row.details ? ` Â· ${escapeHtml(row.details)}` : ''}</div>
  </div>`;
}

function transcriptFilename(ticket) {
  return `ticket-${String(ticket.ticket_number).padStart(4, '0')}-internal.html`;
}

function resolveStoredTranscriptPath(storedPath) {
  return resolve(process.cwd(), normalizeStoredPath(storedPath));
}

function normalizeStoredPath(value) {
  return String(value).replaceAll('\\', '/');
}

function safePathPart(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}
