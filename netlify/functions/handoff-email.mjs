/* CNT on-call — automatic handoff email.
 *
 * Netlify runs this every Thursday at 14:00 and 15:00 UTC. One of those is
 * 0700 in Irvine (14:00 in summer, 15:00 in winter); the other run sees the
 * wrong hour and does nothing. On the off-week Thursday it also does nothing.
 *
 * It records each block it has emailed in data/handoff-email.json so the
 * same handoff is never sent twice.
 */
import {
  wallNow, blockIndex, blockStart, buildEmail, sendEmail, emailSetupProblem,
  loadData, readFile, writeFile, recipients, when, LOG
} from '../lib/handoff.mjs';

export default async () => {
  const now = wallNow();
  const i = blockIndex(now);
  const sinceHandoff = now - blockStart(i);

  /* only inside the first hour of a new block, i.e. handoff Thursday 0700–0759 */
  if (sinceHandoff < 0 || sinceHandoff >= 36e5) {
    console.log(`Not a handoff hour (Pacific ${when(now)}). Nothing to send.`);
    return;
  }

  const problem = emailSetupProblem();
  if (problem) { console.error('Handoff email not sent: ' + problem); return; }

  const log = await readFile(LOG);
  const sent = (log.data && log.data.sent) || [];
  if (sent.some(x => x.block === i)) {
    console.log(`Handoff for ${when(blockStart(i))} was already emailed.`);
    return;
  }

  const data = await loadData();
  const mail = buildEmail(data, i, { siteUrl: process.env.URL || '' });
  const id = await sendEmail(mail);
  console.log(`Sent "${mail.subject}" to ${recipients().join(', ')} (message ${id}).`);

  const entry = { block: i, team: mail.team, handoff: when(mail.start), sentAt: new Date().toISOString(), id };
  await writeFile(LOG, { sent: [entry, ...sent].slice(0, 30) }, log.sha,
    `handoff email ${entry.handoff} [skip ci]`).catch(e => console.error(String(e)));
};

export const config = { schedule: '0 14,15 * * 4' };
