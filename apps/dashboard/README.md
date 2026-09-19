# Job Mission Control

Job Mission Control is a local job-application research and outreach workspace. A Google Sheet is
the source of truth. The app researches a posting, records evidence and uncertainty, prepares a
personalized email, and creates a Gmail **draft**. It never sends email automatically.

## Monorepo layout

This dashboard is part of the unified `job-application-helper` repository. The other components
are kept alongside it:

```text
apps/dashboard/       this app
apps/extension/       optional Chrome capture extension
packages/coldpitch/   optional standalone research agent
```

## Requirements

- Node.js 18+ (20+ recommended) and npm.
- A Google Cloud project with Google Sheets API and Gmail API enabled.
- A Google OAuth Desktop app client. The dashboard callback is
  `http://localhost:4319/api/auth/callback`.
- Chrome, if using the extension.
- For AI research, either an authenticated `claude` CLI (default engine) or an Anthropic API key
  entered in Settings.

## Start the dashboard

```bash
cd apps/dashboard
npm install
cp .env.example .env
npm start
```

Open <http://localhost:4319>. `.env` currently controls only `PORT`; application credentials are
stored locally in `data/settings.json` and must never be committed.

### First-run Settings

1. Open **Settings → Google connection**.
2. Paste the Google OAuth client ID and secret, or click **Import from coldpitch** when
   `~/.config/coldpitch/credentials.json` exists.
3. Click **Connect Google** and complete the browser consent flow.
4. Enter a Google Sheet ID and tab name. The first row must contain the application columns; the
   app adds `ResearchJSON` when needed.
5. Add the sender signature. The connected Google account supplies the sender email.
6. Choose an AI engine. `claude-cli` requires the `claude` command to be installed and logged in;
   `api` requires an Anthropic key entered in the API-key field. Resume path, Hunter key, and
   follow-up days are optional.

The app writes only Gmail drafts. A human must press Send in Gmail.

## Install the Chrome extension (optional)

The real extension UI is the shadow-DOM panel from `content.js`; `popup/` is legacy code.

1. Start the dashboard first.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select
   `apps/extension` from the repository.
3. In `apps/extension/manifest.json`, replace the placeholder OAuth client ID with the Google OAuth client ID
   configured for the extension, then reload it. Direct extension Sheet saves require valid
   extension OAuth; the agent checkbox path calls the dashboard API.
4. Visit a supported job page (LinkedIn, Indeed, or Naukri). Click the toolbar icon or press
   `Ctrl+Shift+J` (`Command+Shift+J` on macOS).
5. Check **Research and draft a cold email** to send one research request to the dashboard, or
   leave it unchecked to save the captured row directly to the Sheet. Click **Save**.
6. With research enabled, click **Open dashboard** in the confirmation state. The dashboard polls
   for the completed row and does not start a duplicate run.

Google sign-in/consent, extension installation, and pressing Gmail’s final Send button are the
intentional human interactions in this workflow.

## Development notes

- `server.js` is a zero-build Node HTTP server; `public/` is vanilla HTML/CSS/JS.
- `POST /api/pipeline` researches a job and appends the result to the Sheet.
- `POST /api/jobs/:row/draft` creates a Gmail draft for an existing row.
- Stop with `Ctrl+C`; restart after changing server code.
- Keep `data/` and `.env` local because they contain credentials and runtime state.

## Verify a checkout

```bash
node --check server.js
node --check pipeline.js
node --check public/app.js
node server.js
curl -I http://localhost:4319/
```

For the extension, use its **Errors** panel in `chrome://extensions` for manifest, permission, or
OAuth issues.
