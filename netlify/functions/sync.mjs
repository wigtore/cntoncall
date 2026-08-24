/* CNT on-call — shared roster, coverage and password.
 *
 * Zero dependencies. Roster and coverage live in this repo as
 * data/roster.json and data/coverage.json; the team password lives in
 * data/auth.json as a salted hash, never in plain text.
 *
 *   GET  /api/auth    is a password set yet?
 *   POST /api/auth    check a password
 *   PUT  /api/auth    set or change the password
 *   GET  /api/sync    roster + coverage        (password required)
 *   PUT  /api/sync    save roster + coverage   (password required)
 *
 * Environment variables, set in Netlify:
 *   GITHUB_TOKEN   token with repository contents read and write
 *   GITHUB_REPO    owner/repository
 *   GITHUB_BRANCH  optional, defaults to main
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ROSTER = 'data/roster.json';
const COVERAGE = 'data/coverage.json';
const AUTH = 'data/auth.json';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

const env = (k) => process.env[k] || '';
const branch = () => env('GITHUB_BRANCH') || 'main';

function gh(path, init = {}) {
  return fetch(`https://api.github.com/repos/${env('GITHUB_REPO')}/contents/${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env('GITHUB_TOKEN')}`,
      'user-agent': 'cnt-oncall',
      'x-github-api-version': '2022-11-28',
      ...(init.headers || {})
    }
  });
}

async function readFile(path) {
  const r = await gh(`${path}?ref=${encodeURIComponent(branch())}`, { cache: 'no-store' });
  if (r.status === 404) return { data: null, sha: null };
  if (!r.ok) throw new Error(`GitHub read ${r.status} on ${path}`);
  const body = await r.json();
  let data = null;
  try { data = JSON.parse(Buffer.from(body.content || '', 'base64').toString('utf8')); } catch (e) {}
  return { data, sha: body.sha };
}

async function writeFile(path, obj, sha, message) {
  const r = await gh(path, {
    method: 'PUT',
    body: JSON.stringify({
      message, branch: branch(),
      content: Buffer.from(JSON.stringify(obj, null, 1), 'utf8').toString('base64'),
      ...(sha ? { sha } : {})
    })
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`GitHub write ${r.status} on ${path}: ${detail.slice(0, 200)}`);
  }
}

/* ---- password ---- */
const hashOf = (salt, password) => createHash('sha256').update(salt + ':' + password).digest('hex');

function samePassword(stored, supplied) {
  if (!stored || !stored.salt || !stored.hash) return false;
  const a = Buffer.from(stored.hash, 'utf8');
  const b = Buffer.from(hashOf(stored.salt, supplied), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

const suppliedPassword = (req) => req.headers.get('x-cnt-pass') || '';

export default async (req) => {
  if (!env('GITHUB_REPO') || !env('GITHUB_TOKEN')) {
    return json({ error: 'not_configured',
      message: 'Set GITHUB_TOKEN and GITHUB_REPO in the Netlify environment variables.' }, 503);
  }

  const path = new URL(req.url).pathname;

  try {
    /* ---------- password endpoints ---------- */
    if (path === '/api/auth') {
      const auth = await readFile(AUTH);

      if (req.method === 'GET') {
        return json({ status: auth.data ? 'ready' : 'needs_setup' });
      }

      if (req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        if (!auth.data) return json({ status: 'needs_setup' }, 409);
        if (!samePassword(auth.data, String(body.password || ''))) {
          return json({ error: 'wrong_password', message: 'That password is not correct.' }, 401);
        }
        return json({ ok: true });
      }

      if (req.method === 'PUT') {
        const body = await req.json().catch(() => ({}));
        const next = String(body.newPassword || '');
        if (next.length < 4) {
          return json({ error: 'too_short', message: 'Use at least 4 characters.' }, 400);
        }
        /* changing an existing password needs the current one */
        if (auth.data && !samePassword(auth.data, suppliedPassword(req))) {
          return json({ error: 'wrong_password', message: 'The current password is not correct.' }, 401);
        }
        const salt = randomBytes(16).toString('hex');
        await writeFile(AUTH,
          { version: ((auth.data && auth.data.version) || 0) + 1,
            updated: new Date().toISOString(), salt, hash: hashOf(salt, next) },
          auth.sha,
          `${auth.data ? 'change' : 'set'} site password [skip ci]`);
        return json({ ok: true });
      }

      return json({ error: 'method_not_allowed' }, 405);
    }

    /* ---------- data endpoints, password required ---------- */
    const auth = await readFile(AUTH);
    if (!auth.data) return json({ error: 'needs_setup', message: 'No password has been set yet.' }, 401);
    if (!samePassword(auth.data, suppliedPassword(req))) {
      return json({ error: 'auth_required', message: 'Enter the team password.' }, 401);
    }

    if (req.method === 'GET') {
      const [r, c] = await Promise.all([readFile(ROSTER), readFile(COVERAGE)]);
      return json({
        version: (r.data && r.data.version) || 0,
        updated: (r.data && r.data.updated) || null,
        members: (r.data && r.data.members) || null,
        windows: (c.data && c.data.windows) || []
      });
    }

    if (req.method === 'PUT') {
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.members) || !body.members.length) {
        return json({ error: 'bad_payload', message: 'members must be a non-empty array.' }, 400);
      }
      const [r, c] = await Promise.all([readFile(ROSTER), readFile(COVERAGE)]);
      const current = (r.data && r.data.version) || 0;
      if (typeof body.baseVersion === 'number' && body.baseVersion !== current) {
        return json({ error: 'conflict', version: current,
          message: 'Someone else saved a change first.' }, 409);
      }
      const version = current + 1;
      const updated = new Date().toISOString();
      await writeFile(ROSTER, { version, updated, members: body.members }, r.sha,
        `roster v${version} via on-call site [skip ci]`);
      if (Array.isArray(body.windows)) {
        await writeFile(COVERAGE, { version, updated, windows: body.windows }, c.sha,
          `coverage v${version} via on-call site [skip ci]`);
      }
      return json({ version, updated, members: body.members, windows: body.windows || [] });
    }

    return json({ error: 'method_not_allowed' }, 405);

  } catch (e) {
    const msg = String(e.message || e);
    return json({ error: /write/.test(msg) ? 'write_failed' : 'read_failed', message: msg }, 502);
  }
};

export const config = { path: ['/api/sync', '/api/auth'] };
