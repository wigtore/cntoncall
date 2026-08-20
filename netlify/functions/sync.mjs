/* CNT on-call — shared roster + coverage.
 *
 * Zero dependencies. Reads and writes data/roster.json and data/coverage.json
 * in the GitHub repo through the GitHub REST API, so the repo stays the single
 * source of truth and every change is a normal commit with full history.
 *
 *   GET  /api/sync   current roster + coverage
 *   PUT  /api/sync   replace them
 *
 * Anyone who can open the site can save changes. There is no edit code.
 *
 * Environment variables, set in Netlify:
 *   GITHUB_TOKEN   a fine-grained PAT with Contents: read and write on this repo
 *   GITHUB_REPO    owner/repository, e.g. wigtore/cnt-oncall
 *   GITHUB_BRANCH  optional, defaults to main
 */

const ROSTER = 'data/roster.json';
const COVERAGE = 'data/coverage.json';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

const env = (k) => process.env[k] || '';
const repo = () => env('GITHUB_REPO');
const branch = () => env('GITHUB_BRANCH') || 'main';

function gh(path, init = {}) {
  return fetch(`https://api.github.com/repos/${repo()}/contents/${path}`, {
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

/* returns { data, sha } — sha is null when the file does not exist yet */
async function readFile(path) {
  const r = await gh(`${path}?ref=${encodeURIComponent(branch())}`, { cache: 'no-store' });
  if (r.status === 404) return { data: null, sha: null };
  if (!r.ok) throw new Error(`GitHub read ${r.status} on ${path}`);
  const body = await r.json();
  const text = Buffer.from(body.content || '', 'base64').toString('utf8');
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  return { data, sha: body.sha };
}

async function writeFile(path, obj, sha, message) {
  const r = await gh(path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      branch: branch(),
      content: Buffer.from(JSON.stringify(obj, null, 1), 'utf8').toString('base64'),
      ...(sha ? { sha } : {})
    })
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`GitHub write ${r.status} on ${path}: ${detail.slice(0, 200)}`);
  }
}

export default async (req) => {
  if (!repo() || !env('GITHUB_TOKEN')) {
    return json({ error: 'not_configured',
      message: 'Set GITHUB_TOKEN and GITHUB_REPO in the Netlify environment variables.' }, 503);
  }

  if (req.method === 'GET') {
    try {
      const [r, c] = await Promise.all([readFile(ROSTER), readFile(COVERAGE)]);
      return json({
        version: (r.data && r.data.version) || 0,
        updated: (r.data && r.data.updated) || null,
        members: (r.data && r.data.members) || null,
        windows: (c.data && c.data.windows) || []
      });
    } catch (e) {
      return json({ error: 'read_failed', message: String(e.message || e) }, 502);
    }
  }

  if (req.method === 'PUT') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }
    if (!Array.isArray(body.members) || !body.members.length) {
      return json({ error: 'bad_payload', message: 'members must be a non-empty array.' }, 400);
    }

    try {
      const [r, c] = await Promise.all([readFile(ROSTER), readFile(COVERAGE)]);
      const current = (r.data && r.data.version) || 0;
      if (typeof body.baseVersion === 'number' && body.baseVersion !== current) {
        return json({ error: 'conflict', version: current,
          message: 'Someone else saved a change first.' }, 409);
      }

      const version = current + 1;
      const updated = new Date().toISOString();
      const note = `roster v${version} via on-call site [skip ci]`;

      await writeFile(ROSTER, { version, updated, members: body.members }, r.sha, note);
      if (Array.isArray(body.windows)) {
        await writeFile(COVERAGE, { version, updated, windows: body.windows }, c.sha,
          `coverage v${version} via on-call site [skip ci]`);
      }
      return json({ version, updated, members: body.members, windows: body.windows || [] });
    } catch (e) {
      return json({ error: 'write_failed', message: String(e.message || e) }, 502);
    }
  }

  return json({ error: 'method_not_allowed' }, 405);
};

export const config = { path: '/api/sync' };
