# Handoff email — setup (Gmail)

Every handoff Thursday at 0700 Pacific, the site emails the incoming team's
call-out list (call sign, name, role, shift), the dispatchers, the reserves,
any coverage swaps in the new block, and any training days in it. Phone
numbers are left out and stay on the site.

Off-week Thursdays send nothing. Each handoff is only ever sent once.
The email comes from a Gmail account you set up for this.

## One-time setup

### 1. Make a Gmail account for the team
Create a new Gmail account just for this, for example `ipd.cnt.oncall@gmail.com`.
Using a dedicated account (not your personal one) means the password is never
tied to you, and someone else can take it over later.

### 2. Turn on 2-Step Verification
Google only allows app passwords on accounts with 2-Step Verification.
1. Signed in to that account, go to **myaccount.google.com → Security**.
2. Turn on **2-Step Verification** and follow the prompts (a phone number is enough).

### 3. Create an app password
1. Go to **myaccount.google.com/apppasswords**, or search "App passwords" in the account settings.
2. Name it `CNT on-call site` and click **Create**.
3. Google shows a 16-letter password in four groups. Copy it now, because it is shown only once.
   Spaces don't matter.

### 4. Netlify settings
On netlify.com, open the site, then **Site configuration → Environment variables**, and add:

| Key | Value |
| --- | --- |
| `GMAIL_USER` | the Gmail address from step 1 |
| `GMAIL_APP_PASSWORD` | the 16-letter app password from step 3 |
| `HANDOFF_EMAIL_TO` | the destination address. For several, separate with commas |

### 5. Upload the files
Upload to GitHub as usual (see DEPLOY.md). This update includes `package.json`
and `package-lock.json`. These tell Netlify to install the small mail add-on the
email needs, so make sure they get uploaded. If you set the variables *after*
uploading, go to **Deploys → Trigger deploy → Deploy site** so the site picks them up.

### 6. Test
Sign in to the site, open **Admin → Handoff email**, and tap **Send test email**.
It sends a copy of the *next* handoff email, marked TEST. Check the inbox and
the spam folder. If it lands in junk or never arrives at a city address, ask IT
to allow mail from the Gmail address.

## If it stops working
- **"Gmail refused the sign-in"**: the app password was removed, or someone
  changed the Gmail account's password. Changing the password cancels all app passwords.
  Make a new app password (step 3) and update `GMAIL_APP_PASSWORD` in Netlify.
- **Admin → Handoff email** shows the next send and the last one sent.
- Netlify → **Logs → Functions → handoff-email** shows each Thursday run and
  says why it did or did not send.

## Files
- `netlify/functions/handoff-email.mjs`: the automatic Thursday send
- `netlify/functions/handoff-test.mjs`: the Admin panel status and test button
- `netlify/lib/handoff.mjs`: builds and sends the email
- `package.json`, `package-lock.json`: tell Netlify to install the mail add-on (nodemailer)
- `data/handoff-email.json`: created automatically, a record of what was sent
