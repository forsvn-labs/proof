// Conquistador review routes: channel, playbooks, check findings, and the approval stamp.
// The approval stamp is a human decision for one exact document text. It records the approver,
// the time, and the SHA-256 of the clean Markdown, with all Proof annotation spans removed. Every read compares that hash with the
// current text, so any edit clears the stamp. Only a same-origin browser request with the owner
// link can stamp or withdraw; agent requests are refused.
import { createHash } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { getCanonicalReadableDocumentSync } from './collab.js';
import { addDocumentEvent, getDb, resolveDocumentAccess } from './db.js';
import { stripAllProofSpanTags } from './proof-span-strip.js';

export const CHECK_AUTHOR = 'ai:conquistador-check';
// Conquistador creates review documents with this owner id. Their pages hide Proof's Share and agent buttons:
// review is local only and uses one agent through the bridge.
export const REVIEW_OWNER_ID = 'conquistador:review';
const CHANNELS = ['x', 'linkedin', 'email', 'search', 'ad'] as const;
const CHANNEL_ALIASES: Record<string, (typeof CHANNELS)[number]> = {
  twitter: 'x', 'x-post': 'x', thread: 'x',
  'linkedin-post': 'linkedin',
  newsletter: 'email', 'email-client': 'email',
  seo: 'search', serp: 'search', google: 'search', 'search-snippet': 'search',
  ads: 'ad', 'ad-card': 'ad', meta: 'ad', facebook: 'ad', paid: 'ad',
};

type ApprovalRow = {
  approver: string;
  approved_at: string;
  sha256: string;
  user_agent: string | null;
  cleared_at: string | null;
  cleared_reason: string | null;
};

let tableReady = false;
function ensureTable(): void {
  if (tableReady) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS conquistador_approvals (
      document_slug TEXT PRIMARY KEY,
      approver TEXT NOT NULL,
      approved_at TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      user_agent TEXT,
      cleared_at TEXT,
      cleared_reason TEXT
    )
  `);
  tableReady = true;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// Front matter: a leading `---` block of `key: value` lines. Values keep their text; quotes are removed.
export function parseFrontMatter(markdown: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown);
  if (!match) return { data: {}, body: markdown };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    data[pair[1].toLowerCase()] = pair[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { data, body: markdown.slice(match[0].length) };
}

export function normalizeChannel(value: string | undefined): string | null {
  const key = (value ?? '').trim().toLowerCase();
  if (!key) return null;
  if ((CHANNELS as readonly string[]).includes(key)) return key;
  return CHANNEL_ALIASES[key] ?? null;
}

// The final section of the document, when its heading names playbooks.
export function parsePlaybooks(markdown: string): { heading: string | null; items: Array<{ name: string; note: string }> } {
  const lines = markdown.split(/\r?\n/);
  let fenced = false;
  let last = -1;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced && /^#{1,6}\s+\S/.test(line)) last = index;
  });
  if (last < 0) return { heading: null, items: [] };
  const heading = lines[last].replace(/^#{1,6}\s+/, '').replace(/\s+#*\s*$/, '').trim();
  if (!/playbook/i.test(heading)) return { heading: null, items: [] };
  const items = lines.slice(last + 1)
    .map((line) => /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line)?.[1]?.trim())
    .filter((text): text is string => Boolean(text))
    .map((text) => {
      const plain = text.replace(/\*\*|__|`/g, '');
      const split = /^(.+?)\s*(?::|\s[-–—]\s)\s*(.+)$/.exec(plain);
      return split ? { name: split[1].trim(), note: split[2].trim() } : { name: plain, note: '' };
    });
  return { heading, items };
}

function getSlug(req: Request): string {
  const raw = req.params.slug;
  return (Array.isArray(raw) ? raw[0] : raw) ?? '';
}

function presentedSecret(req: Request): string {
  const auth = /^Bearer\s+(.+)$/i.exec(req.header('authorization') ?? '')?.[1]?.trim();
  if (auth) return auth;
  const header = req.header('x-share-token')?.trim();
  if (header) return header;
  return typeof req.query.token === 'string' ? req.query.token.trim() : '';
}

function currentText(slug: string): string | null {
  const doc = getCanonicalReadableDocumentSync(slug, 'share');
  if (!doc || doc.share_state === 'DELETED') return null;
  // Comment and suggestion anchors are review markup, not document text.
  return stripAllProofSpanTags(doc.markdown ?? '');
}

// Reads the stamp and clears it when the text changed since approval.
export function readApproval(slug: string, sha256: string) {
  ensureTable();
  const row = getDb().prepare(`
    SELECT approver, approved_at, sha256, user_agent, cleared_at, cleared_reason
    FROM conquistador_approvals WHERE document_slug = ?
  `).get(slug) as ApprovalRow | undefined;
  if (!row) return { state: 'none' as const };
  if (!row.cleared_at && row.sha256 !== sha256) {
    const now = new Date().toISOString();
    getDb().prepare(`
      UPDATE conquistador_approvals SET cleared_at = ?, cleared_reason = 'document changed'
      WHERE document_slug = ? AND cleared_at IS NULL
    `).run(now, slug);
    addDocumentEvent(slug, 'conquistador.approval.cleared', { sha256: row.sha256, currentSha256: sha256, reason: 'document changed' }, 'system:conquistador');
    row.cleared_at = now;
    row.cleared_reason = 'document changed';
  }
  return {
    state: row.cleared_at ? 'cleared' as const : 'approved' as const,
    approver: row.approver,
    approvedAt: row.approved_at,
    sha256: row.sha256,
    clearedAt: row.cleared_at,
    clearedReason: row.cleared_reason,
  };
}

function openCheckFindings(slug: string): number {
  const doc = getCanonicalReadableDocumentSync(slug, 'share');
  let marks: Record<string, { kind?: string; by?: string; resolved?: boolean }> = {};
  try { marks = JSON.parse(doc?.marks || '{}'); } catch { marks = {}; }
  return Object.values(marks).filter((mark) => mark?.kind === 'comment' && mark.by === CHECK_AUTHOR && !mark.resolved).length;
}

// A human decision needs the owner link, a same-origin browser request, and no agent identity.
function humanRefusal(req: Request, slug: string): string | null {
  const access = resolveDocumentAccess(slug, presentedSecret(req));
  if (!access || access.source === 'access_token') return 'Approval needs the owner review link.';
  if (req.header('x-agent-id') || req.header('x-proof-client-build')) return 'Agents cannot approve. A human approves in the browser.';
  const by = typeof req.body?.by === 'string' ? req.body.by : '';
  if (by && !by.startsWith('human:')) return 'Agents cannot approve. A human approves in the browser.';
  if (req.header('sec-fetch-site') !== 'same-origin') return 'Approve from the review page in a browser.';
  const origin = req.header('origin') ?? '';
  if (!origin || origin !== `${req.protocol}://${req.header('host') ?? ''}`) return 'Approve from the review page in a browser.';
  return null;
}

export const conquistadorReviewRoutes = Router();

conquistadorReviewRoutes.get('/:slug/conquistador/review', (req: Request, res: Response) => {
  const slug = getSlug(req);
  if (!resolveDocumentAccess(slug, presentedSecret(req))) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'A valid document token is required.' });
    return;
  }
  const text = currentText(slug);
  if (text === null) {
    res.status(404).json({ success: false, code: 'NOT_FOUND', error: 'Document not found.' });
    return;
  }
  const { data } = parseFrontMatter(text);
  const sha256 = sha256Hex(text);
  res.json({
    success: true,
    slug,
    sha256,
    markdown: text,
    channel: normalizeChannel(data.channel),
    frontMatter: data,
    playbooks: parsePlaybooks(text),
    openCheckFindings: openCheckFindings(slug),
    approval: readApproval(slug, sha256),
  });
});

conquistadorReviewRoutes.post('/:slug/conquistador/approval', (req: Request, res: Response) => {
  const slug = getSlug(req);
  const refusal = humanRefusal(req, slug);
  if (refusal) {
    res.status(403).json({ success: false, code: 'HUMAN_APPROVAL_REQUIRED', error: refusal });
    return;
  }
  const text = currentText(slug);
  if (text === null) {
    res.status(404).json({ success: false, code: 'NOT_FOUND', error: 'Document not found.' });
    return;
  }
  const approver = typeof req.body?.approver === 'string' ? req.body.approver.trim() : '';
  if (!approver || approver.length > 80 || /^ai:/i.test(approver)) {
    res.status(400).json({ success: false, code: 'APPROVER_REQUIRED', error: 'Enter your name to approve.' });
    return;
  }
  const sha256 = sha256Hex(text);
  if (req.body?.sha256 !== sha256) {
    res.status(409).json({ success: false, code: 'DOCUMENT_CHANGED', error: 'The document changed. Read it again, then approve.', sha256 });
    return;
  }
  ensureTable();
  const approvedAt = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO conquistador_approvals (document_slug, approver, approved_at, sha256, user_agent, cleared_at, cleared_reason)
    VALUES (?, ?, ?, ?, ?, NULL, NULL)
    ON CONFLICT(document_slug) DO UPDATE SET approver = excluded.approver, approved_at = excluded.approved_at,
      sha256 = excluded.sha256, user_agent = excluded.user_agent, cleared_at = NULL, cleared_reason = NULL
  `).run(slug, approver, approvedAt, sha256, req.header('user-agent') ?? null);
  addDocumentEvent(slug, 'conquistador.approval.stamped', { approver, approvedAt, sha256 }, `human:${approver}`);
  res.json({ success: true, approval: readApproval(slug, sha256) });
});

conquistadorReviewRoutes.delete('/:slug/conquistador/approval', (req: Request, res: Response) => {
  const slug = getSlug(req);
  const refusal = humanRefusal(req, slug);
  if (refusal) {
    res.status(403).json({ success: false, code: 'HUMAN_APPROVAL_REQUIRED', error: refusal });
    return;
  }
  ensureTable();
  const now = new Date().toISOString();
  const result = getDb().prepare(`
    UPDATE conquistador_approvals SET cleared_at = ?, cleared_reason = 'withdrawn'
    WHERE document_slug = ? AND cleared_at IS NULL
  `).run(now, slug);
  if (result.changes > 0) addDocumentEvent(slug, 'conquistador.approval.withdrawn', { withdrawnAt: now }, 'human:reviewer');
  const text = currentText(slug) ?? '';
  res.json({ success: true, approval: readApproval(slug, sha256Hex(text)) });
});
