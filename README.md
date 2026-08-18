# CNT On-Call

Internal on-call reference for the Crisis Negotiation Team. Single static page,
no build step, no server, no dependencies to install.

> **This page contains members' personal cell numbers.** Read
> [Restricting access](#restricting-access) before you point anyone at the URL.

## What's here

| File | Purpose |
| --- | --- |
| `index.html` | The entire application — markup, styles, script, logo and icons are all inlined |
| `data/roster.json` | Shared roster. Edit this to update every device |
| `data/coverage.json` | Shared coverage windows |
| `netlify.toml` | Publish settings plus `noindex`, framing and CSP headers |
| `robots.txt` | Keeps search crawlers off the site |

The only outbound requests are to Google Fonts. Everything else, including the
unit patch and the home-screen icon, is embedded in `index.html`.

## Tabs

- **Roster** — Blue, Red, Both teams, Tactical Dispatch, grouped Leadership /
  Negotiators / Tech & support. Tap a number to dial.
- **On call now** — who to call at this moment, in call-sign order, with coverage
  swaps already resolved. Set a date and time to check any other moment.
- **On-call calendar** — month grid tinted by the team holding the block. Tap any
  day for a full breakdown of who is on call and when.
- **On-call coverage** — assign time-ranged coverage windows within a block.
- **Weekly shifts** — the recurring Sun–Sat duty-hour band.
- **Edit roster** — add, edit or remove members.

## Deploy

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "CNT on-call site"
git branch -M main
git remote add origin git@github.com:YOUR-ORG/cnt-oncall.git
git push -u origin main
```

**Make the repository private.** It contains the roster.

### 2. Connect Netlify

1. Netlify → **Add new site** → **Import an existing project** → GitHub
2. Pick the repository
3. Leave **Build command** empty and set **Publish directory** to `.`
   (`netlify.toml` already sets both)
4. **Deploy**

Every push to `main` redeploys. To publish without GitHub, drag this folder onto
the Netlify **Sites** page instead.

## Restricting access

Netlify serves the site publicly by default — anyone with the URL sees the
roster. Pick one:

- **Netlify password protection** — Site configuration → Access control →
  Visitor access. One shared password for the whole site. Requires a paid plan.
- **Netlify Identity** — invite-only accounts per member. More setup, better
  audit trail.
- **Host on the department intranet** instead. `index.html` is fully
  self-contained; drop it on any internal web server and it works.

Do not rely on the URL being hard to guess.

## Publishing changes to everyone

`data/roster.json` and `data/coverage.json` are the **shared source of truth**.
The site fetches them on every load, so publishing once updates every phone and
laptop. Edits made in the app are local to that browser until you publish them.

The Edit roster tab shows which version a device is on:

- *Published roster v3 · in sync* — this device matches what's deployed
- *this device has unpublished local edits* — changes here are not live for anyone else

### To publish

1. Make the changes on any device, in **Edit roster** or **On-call coverage**
2. Press **Download roster.json** (and/or **Download coverage.json**)
3. Replace `data/roster.json` in this repo with the downloaded file — the GitHub
   web editor works fine, including from a phone
4. Commit. Netlify redeploys, and every device picks it up on next load.

The version number increments automatically on download. Any device whose local
copy predates the new version is overwritten by it; a device with newer local
edits keeps them until it publishes. **Use published copy** forces a device back
to the deployed version, discarding its local edits.

If the data files are missing or unreachable, the site falls back to the roster
compiled into `index.html` and says so in the status bar. It never breaks.

### Editing the JSON by hand

`data/roster.json` is a list of members. `data/coverage.json` is a flat list of
windows, which is often quicker to edit directly than to click through the UI:

```json
{ "covered": "N9", "by": "N10",
  "start": "2026-07-09T07:00", "end": "2026-07-13T00:00", "note": "" }
```

Times are local, `YYYY-MM-DDTHH:MM`. A window spanning a Thursday 0700 handoff is
split across blocks automatically. Bump `"version"` whenever you edit by hand,
or devices with a local copy will ignore the change.

## Rotation

Blocks run **Thursday 0700 to Thursday 0700** and alternate every 14 days. The
schedule is generated from one anchor near the top of the script:

```js
const ANCHOR = new Date(2026,6,23,7,0,0);   // Thu 7/23/2026 0700 = Red
```

Past and future blocks are derived from that, so no calendar table needs
maintaining. Change the anchor only if the rotation itself is re-based.

## Browser support

Current Chrome, Safari, Firefox and Edge, desktop and mobile. The layout is
built mobile-first. The logo uses CSS masking and is hidden on any browser that
lacks it.
