# Turning on live sync

About 10 minutes, once. After this, anyone who opens the site can make changes,
and everyone else sees them. No passwords, no copying files.

## Part 1 — Put the files on GitHub

1. Go to your repository on github.com.
2. Click **Add file**, then **Create new file**.
3. In the filename box type exactly: `netlify/functions/sync.mjs`
4. Open the `sync.mjs` file you were given, copy all of it, paste it in.
5. Scroll down, click **Commit changes**.

Then replace two files you already have. For each: click the file name, click
the **pencil** icon, select all the old text, paste in the new, **Commit
changes**.

- `index.html`
- `netlify.toml`

## Part 2 — Get a key from GitHub

6. Click your profile picture, top right, then **Settings**.
7. At the very bottom of the left menu, click **Developer settings**.
8. Click **Personal access tokens**, then **Fine-grained tokens**, then
   **Generate new token**.
9. Fill in:
   - **Token name:** anything, such as `cnt site`
   - **Repository access:** choose **Only select repositories**, pick your CNT one
   - **Permissions:** click **Repository permissions**, find **Contents**,
     set it to **Read and write**
10. Click **Generate token**. Copy the long code — it is only shown once.

## Part 3 — Tell Netlify

11. On netlify.com open your site, then **Site configuration**, then
    **Environment variables**, then **Add a variable**. Add these two:

| Name | Value |
| --- | --- |
| `GITHUB_TOKEN` | the long code from step 10 |
| `GITHUB_REPO` | your GitHub username, a slash, then the repository name |

12. Go to **Deploys**, then **Trigger deploy**, then **Clear cache and deploy
    site**. Wait about a minute.

## Part 4 — Set the team password

13. Open the site. It asks you to choose a password, twice. This is the password
    everyone on the team will use.
14. Go to the **Edit roster** tab. The grey bar should say **Live. Everyone sees
    the same roster.**

That's it. Change something on your phone, open the site on a computer, and the
change is there.

## The password

- Everyone uses the same one. Anyone who has it can view and change the roster.
- It is stored as a scrambled fingerprint, never as readable text, so nobody can
  look it up in the repository.
- The roster is only reachable after the password is accepted, so the phone
  numbers are not exposed to someone who merely finds the web address.
- To change it: scroll to the very bottom of the site, open **Admin**, and use
  **Change password**. Everyone else is signed out until you send them the new
  one — email PS_CNT when you do.

## Good to know

- Changes appear on other devices within a minute, or straight away if they
  press **Refresh**.
- If two people save at the same moment, the second one is asked to press
  Refresh and make the change again, so nobody's work is silently lost.
- If the internet or the site is down, everyone still sees the last roster their
  device loaded, and the bar says it is not connected.
- Every change is recorded in GitHub, so an accidental deletion can be undone.

## The Activity page

There is a hidden tab that lists every change ever made — who made it, when, and
exactly what changed, for both the roster and on-call coverage.

To show it, add `#log` to the end of the web address once:

```
https://cntoncall.netlify.app/#log
```

It stays visible on that device from then on. **Hide this tab**, on the page
itself, puts it away again. Other people's phones never see it unless they visit
that address themselves, so treat it as out of the way rather than locked.

Names come from the **Your name** box on the Edit roster tab. Anyone who leaves
it blank shows up as "Someone", so it is worth asking editors to fill it in once
on their own device.

The log lives in `data/log.json` in the repository and keeps the most recent 800
entries.

## If it says "Not connected"

On netlify.com open **Logs**, then **Functions**, then **sync**.

| What it says | What to do |
| --- | --- |
| `not_configured` | One of the two variables in step 11 is missing or misspelt |
| `read_failed` or `write_failed` | The GitHub key expired, or was not given **Contents: Read and write** |

## If nobody knows the password

There is no master password and no way to look one up — it is stored only as a
scrambled fingerprint. To start over:

1. On GitHub open the repository, then the **data** folder
2. Click **auth.json**, then the **trash can** icon
3. Scroll down and **Commit changes**

The next person to open the site is asked to choose a new team password. The
roster and coverage are in separate files and are not affected.
