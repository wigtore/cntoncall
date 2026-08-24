# Updating the site

Four steps, about a minute. No typing file paths, no pencil icons.

1. **Unzip** the file you were sent. You get a folder with `index.html`,
   `netlify.toml`, a `data` folder and a `netlify` folder inside it.

2. On github.com, open your repository and click **Add file**, then
   **Upload files**.

3. **Select everything inside the unzipped folder and drag it onto the page.**
   Select the files and folders themselves, not the folder that contains them.
   GitHub replaces anything with the same name.

4. Scroll down and click **Commit changes**.

Netlify redeploys on its own. Wait a minute, then reload the site.

---

## If only one file changed

Most updates only touch `index.html`. Same steps — drag just that one file.

## If the site looks unchanged afterwards

Your phone or browser is showing a saved copy. Reload the page while holding
Shift, or close the tab and open it again.

## Checking the deploy finished

On netlify.com open your site and look at **Deploys**. The top entry should say
**Published** with a recent time. If it says **Failed**, click it and send me
the red text.
