/* CNT on-call — handoff email.
 *
 * Shared by two functions:
 *   netlify/functions/handoff-email.mjs   the automatic Thursday 0700 send
 *   netlify/functions/handoff-test.mjs    the "Send test email" button in Admin
 *
 * All rotation maths is done in Pacific wall-clock time, the same way the
 * site shows it, so 0700 means 0700 in Irvine in summer and in winter.
 *
 * Environment variables, set in Netlify:
 *   GMAIL_USER          the Gmail address that sends, e.g. ipd.cnt.oncall@gmail.com
 *   GMAIL_APP_PASSWORD  16-letter app password for that account (not its normal password)
 *   HANDOFF_EMAIL_TO    one address, or several separated by commas
 *   GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH   (already set for the site)
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';

export const TZ = 'America/Los_Angeles';
const DAY = 864e5, HOUR = 36e5;

/* ---------------- Pacific wall clock ----------------
   A "wall" value is a number of ms where Date.UTC(y,m,d,h,mi) stands for
   that clock time in Irvine. No daylight-saving jumps exist in this space. */
const wall = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m, d, h, mi);

export function wallNow(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return wall(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
}

/* "2026-12-04T06:00" as stored in data/coverage.json */
function wallFromString(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  return m ? wall(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : NaN;
}

/* ---------------- rotation (matches index.html) ---------------- */
const ANCHOR = wall(2026, 6, 23, 7);      // Thu 7/23/2026 0700 = Red
const BLOCK = 14 * DAY;

export const blockIndex = w => Math.floor((w - ANCHOR) / BLOCK);
export const blockStart = i => ANCHOR + i * BLOCK;
export const blockTeam = i => (((i % 2) + 2) % 2 === 0 ? 'red' : 'blue');

/* ---------------- formatting ---------------- */
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const d2 = n => String(n).padStart(2, '0');
const g = w => new Date(w);
export const md = w => (g(w).getUTCMonth() + 1) + '/' + g(w).getUTCDate();
const hm = w => d2(g(w).getUTCHours()) + d2(g(w).getUTCMinutes());
export const when = w => DOW[g(w).getUTCDay()] + ' ' + md(w) + ' ' + hm(w);
const mdy = w => md(w) + '/' + g(w).getUTCFullYear();
const fmtNum = v => d2(Math.floor(v / 100)) + d2(v % 100);

const clean = s => String(s || '')
  .replace(/(\S)\s*\*\*(.+?)\*\*/g, '$1 ($2)')   // "K. Wiebe **Unavailable**" -> "K. Wiebe (Unavailable)"
  .replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
const esc = s => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function shift(p) {
  if (p.mode === 'oncall') return 'On-call 24/7';
  if (p.vacant) return 'Position open';
  if (p.mode === 'leave') return clean(p.note) || 'Unavailable';
  if (p.mode === 'waterfall') return (p.daysLabel || '') + ' · Waterfall';
  return (p.daysLabel || '') + (p.start !== undefined ? ' · ' + fmtNum(p.start) + '–' + fmtNum(p.end) : '');
}

function signRank(cs) {
  const m = String(cs).match(/^([A-Z]+)(\d+)$/);
  if (m) return (m[1] === 'N' ? 0 : m[1] === 'TOC' ? 1 : 2) * 1000 + Number(m[2]);
  return 3000 + String(cs).charCodeAt(0);
}
const bySign = (a, b) => signRank(a.cs) - signRank(b.cs);

/* ---------------- build the email ---------------- */
export function buildEmail({ members, windows, training }, i, { test = false, siteUrl = '' } = {}) {
  const team = blockTeam(i), bs = blockStart(i), be = blockStart(i + 1);
  const TEAM = team === 'blue' ? 'Blue Team' : 'Red Team';
  const COLOR = team === 'blue' ? '#1d4ed8' : '#b91c1c';
  const byCs = cs => members.find(p => p.cs === cs);
  const label = cs => { const p = byCs(cs); return p ? cs + ' ' + clean(p.name) : cs; };

  const onTeam = members.filter(p => p.team === team && p.mode === 'sched').sort(bySign);
  const negs = onTeam.filter(p => p.sub !== 'toc');
  const tocs = onTeam.filter(p => p.sub === 'toc');
  const reserves = members
    .filter(p => p.mode !== 'leave' && p.mode !== 'sched' && (p.team === team || p.team === 'shared'))
    .sort(bySign);

  const swaps = (windows || [])
    .map(w => ({ ...w, s: Math.max(wallFromString(w.start), bs), e: Math.min(wallFromString(w.end), be) }))
    .filter(w => w.e > w.s)
    .sort((a, b) => a.s - b.s || signRank(a.covered) - signRank(b.covered));
  const covered = new Set(swaps.map(w => w.covered));

  const trainings = (training || [])
    .map(t => ({ ...t, w: wallFromString(t.date) }))
    .filter(t => t.w >= bs - 7 * HOUR && t.w < be)
    .sort((a, b) => a.w - b.w);

  const range = when(bs) + ' to ' + when(be);
  const subject = (test ? '[TEST] ' : '') + `CNT On-Call: ${TEAM} on call ${md(bs)}–${md(be)}`;

  /* ---- plain text ---- */
  const T = [];
  if (test) T.push('*** TEST EMAIL — sent from the Admin panel, not the automatic handoff ***', '');
  T.push(`${TEAM.toUpperCase()} IS NOW ON CALL`, range, '');
  const tList = (title, people) => {
    if (!people.length) return;
    T.push(title.toUpperCase());
    people.forEach(p => T.push(`  ${p.cs.padEnd(5)} ${clean(p.name)} — ${clean(p.role)} · ${shift(p)}` +
      (covered.has(p.cs) ? '  (has coverage, see below)' : '')));
    T.push('');
  };
  tList('Negotiators — call-out order', negs);
  tList('Tactical dispatchers', tocs);
  tList('Reserves, tech and psych (available regardless of block)', reserves);
  T.push('COVERAGE SWAPS THIS BLOCK');
  if (!swaps.length) T.push('  None scheduled.');
  swaps.forEach(w => T.push(`  ${label(w.covered)} covered by ${label(w.by)}` +
    `\n      ${when(w.s)} to ${when(w.e)}${w.note ? ' · ' + clean(w.note) : ''}`));
  T.push('');
  if (trainings.length) {
    T.push('TRAINING THIS BLOCK');
    trainings.forEach(t => T.push(`  ${mdy(t.w)} ${clean(t.title)}` +
      [t.hours, t.location].filter(Boolean).map(x => ' · ' + clean(x)).join('')));
    T.push('');
  }
  T.push('Phone numbers and live changes are on the on-call site' + (siteUrl ? ': ' + siteUrl : '.'));
  T.push('Coverage added after this email was sent will show on the site, not here.');

  /* ---- HTML ---- */
  const cell = 'padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:14px;vertical-align:top';
  const mono = 'font-family:Consolas,Menlo,monospace;font-weight:700;white-space:nowrap';
  const h2 = t => `<h2 style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#374151;margin:22px 0 6px">${t}</h2>`;
  const hList = (title, people) => !people.length ? '' : h2(title) +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">` +
    people.map(p => `<tr>
      <td style="${cell};${mono};width:56px">${esc(p.cs)}</td>
      <td style="${cell}"><b>${esc(p.name)}</b><br><span style="color:#6b7280;font-size:12.5px">${esc(p.role)} · ${esc(shift(p))}</span>` +
      (covered.has(p.cs) ? `<br><span style="color:#b45309;font-size:12.5px">Has coverage this block — see below</span>` : '') +
      `</td></tr>`).join('') + `</table>`;

  const hSwaps = h2('Coverage swaps this block') + (!swaps.length
    ? `<p style="font-size:14px;color:#6b7280;margin:0">None scheduled.</p>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">` +
      swaps.map(w => `<tr><td style="${cell}">
        <b>${esc(label(w.covered))}</b> covered by <b>${esc(label(w.by))}</b><br>
        <span style="color:#6b7280;font-size:12.5px">${when(w.s)} &rarr; ${when(w.e)}${w.note ? ' · ' + esc(w.note) : ''}</span>
      </td></tr>`).join('') + `</table>`);

  const hTrain = !trainings.length ? '' : h2('Training this block') +
    trainings.map(t => `<p style="font-size:14px;margin:0 0 4px"><b>${mdy(t.w)}</b> ${esc(t.title)}` +
      [t.hours, t.location].filter(Boolean).map(x => ' · ' + esc(x)).join('') + `</p>`).join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6">
<div style="max-width:620px;margin:0 auto;padding:16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827">
${test ? `<div style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:12px"><b>Test email</b> — sent from the Admin panel, not the automatic handoff.</div>` : ''}
<div style="background:${COLOR};color:#fff;padding:16px 18px;border-radius:8px 8px 0 0">
  <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.85">Crisis Negotiation Team · On-call handoff</div>
  <div style="font-size:26px;font-weight:800;margin-top:4px">${TEAM} is now on call</div>
  <div style="font-size:14px;margin-top:4px">${range}</div>
</div>
<div style="background:#fff;padding:4px 18px 18px;border-radius:0 0 8px 8px">
${hList('Negotiators — call-out order', negs)}
${hList('Tactical dispatchers', tocs)}
${hList('Reserves, tech and psych — available regardless of block', reserves)}
${hSwaps}
${hTrain}
<p style="font-size:12.5px;color:#6b7280;margin:22px 0 0;line-height:1.5">
Phone numbers and live changes are on the ${siteUrl ? `<a href="${siteUrl}" style="color:${COLOR}">on-call site</a>` : 'on-call site'}.
Coverage added after this email was sent will show on the site, not here.</p>
</div></div></body></html>`;

  return { subject, html, text: T.join('\n'), team: TEAM, start: bs, end: be };
}

/* ---------------- Gmail ---------------- */
export const recipients = () =>
  String(process.env.HANDOFF_EMAIL_TO || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);

export function emailSetupProblem({ needList = true } = {}) {
  if (!process.env.GMAIL_USER) return 'GMAIL_USER is not set in Netlify.';
  if (!process.env.GMAIL_APP_PASSWORD) return 'GMAIL_APP_PASSWORD is not set in Netlify.';
  if (needList && !recipients().length) return 'HANDOFF_EMAIL_TO is not set in Netlify.';
  return null;
}

export const looksLikeEmail = s => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(s || '').trim());

export async function sendEmail({ subject, html, text }, to = recipients()) {
  const user = process.env.GMAIL_USER.trim();
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_PORT || '465') === '465',
    auth: { user, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') }   // Google shows it with spaces
  });
  try {
    const info = await transport.sendMail({
      from: { name: 'CNT On-Call', address: user },
      to, subject, html, text
    });
    return info.messageId;
  } catch (e) {
    const msg = String(e.message || e);
    if (/535|Username and Password not accepted|Invalid login/i.test(msg)) {
      throw new Error('Gmail refused the sign-in. Check GMAIL_USER and that GMAIL_APP_PASSWORD is an app password, not the normal password.');
    }
    throw new Error('Gmail could not send: ' + msg.slice(0, 200));
  }
}

/* ---------------- GitHub data (same files the site uses) ---------------- */
const branch = () => process.env.GITHUB_BRANCH || 'main';
function gh(path, init = {}) {
  return fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'user-agent': 'cnt-oncall',
      'x-github-api-version': '2022-11-28',
      ...(init.headers || {})
    }
  });
}
export async function readFile(path) {
  const r = await gh(`${path}?ref=${encodeURIComponent(branch())}`, { cache: 'no-store' });
  if (r.status === 404) return { data: null, sha: null };
  if (!r.ok) throw new Error(`GitHub read ${r.status} on ${path}`);
  const body = await r.json();
  let data = null;
  try { data = JSON.parse(Buffer.from(body.content || '', 'base64').toString('utf8')); } catch (e) {}
  return { data, sha: body.sha };
}
export async function writeFile(path, obj, sha, message) {
  const r = await gh(path, {
    method: 'PUT',
    body: JSON.stringify({
      message, branch: branch(),
      content: Buffer.from(JSON.stringify(obj, null, 1), 'utf8').toString('base64'),
      ...(sha ? { sha } : {})
    })
  });
  if (!r.ok) throw new Error(`GitHub write ${r.status} on ${path}`);
}

export async function loadData() {
  const [r, c, t] = await Promise.all([
    readFile('data/roster.json'), readFile('data/coverage.json'), readFile('data/training.json')]);
  const members = (r.data && r.data.members) || [];
  if (!members.length) throw new Error('The roster is empty or could not be read.');
  return { members, windows: (c.data && c.data.windows) || [], training: (t.data && t.data.events) || [] };
}

/* ---------------- team password (same check as sync.mjs) ---------------- */
export async function passwordOk(supplied) {
  const { data } = await readFile('data/auth.json');
  if (!data || !data.salt || !data.hash) return false;
  const a = Buffer.from(data.hash, 'utf8');
  const b = Buffer.from(createHash('sha256').update(data.salt + ':' + supplied).digest('hex'), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const LOG = 'data/handoff-email.json';
