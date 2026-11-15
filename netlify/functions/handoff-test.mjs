/* CNT on-call — handoff email status and test send, for the Admin panel.
 *
 *   GET  /api/handoff-email   is email set up, who gets it, next and last send
 *   POST /api/handoff-email   send a [TEST] copy of the next handoff email now
 *
 * Both need the team password, same as the rest of the site.
 */
import {
  wallNow, blockIndex, blockStart, blockTeam, buildEmail, sendEmail, emailSetupProblem,
  loadData, readFile, passwordOk, recipients, when, LOG
} from '../lib/handoff.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

let lastTest = 0;   // light brake on repeated taps (per warm function instance)

export default async (req) => {
  try {
    if (!(await passwordOk(req.headers.get('x-cnt-pass') || ''))) {
      return json({ error: 'auth_required', message: 'Enter the team password.' }, 401);
    }
    const next = blockIndex(wallNow()) + 1;

    if (req.method === 'GET') {
      const log = await readFile(LOG);
      const last = ((log.data && log.data.sent) || [])[0] || null;
      return json({
        ready: !emailSetupProblem(), problem: emailSetupProblem(),
        to: recipients(),
        next: { handoff: when(blockStart(next)), team: blockTeam(next) === 'blue' ? 'Blue Team' : 'Red Team' },
        last
      });
    }

    if (req.method === 'POST') {
      const problem = emailSetupProblem();
      if (problem) return json({ error: 'not_configured', message: problem }, 503);
      if (Date.now() - lastTest < 60e3) {
        return json({ error: 'too_soon', message: 'A test was just sent. Wait a minute and try again.' }, 429);
      }
      lastTest = Date.now();
      const mail = buildEmail(await loadData(), next, { test: true, siteUrl: process.env.URL || '' });
      await sendEmail(mail);
      return json({ ok: true, to: recipients(), subject: mail.subject });
    }

    return json({ error: 'method_not_allowed' }, 405);
  } catch (e) {
    return json({ error: 'failed', message: String(e.message || e) }, 502);
  }
};

export const config = { path: '/api/handoff-email' };
