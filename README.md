# Job Application Helper

One repository for the complete job-application workflow:

```text
apps/
  extension/    Chrome extension for capturing a job into Google Sheets
  dashboard/    Local dashboard, Sheet sync, research, and Gmail drafts
packages/
  coldpitch/    Standalone research/outreach agent and email helpers
```

The workflow is deliberately drafts-only: nothing sends email automatically. A person reviews
and sends every Gmail draft.

## Quick start

### 1. Start the dashboard

```bash
npm run install:dashboard
cp apps/dashboard/.env.example apps/dashboard/.env
npm start
```

Open <http://localhost:4319>, configure Google OAuth and the Sheet in **Settings**, and connect
your account. Runtime settings and tokens stay in `apps/dashboard/data/` and are ignored by git.

### 2. Load the extension

In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and
select `apps/extension/`. Configure the OAuth client ID in `apps/extension/manifest.json` as
described in [the extension setup guide](apps/extension/SETUP.md).

The extension can save a captured job directly to the Sheet, or send it to the dashboard for
research and draft creation. The dashboard must be running for the research path.

### 3. Use Coldpitch directly (optional)

The standalone agent lives in [`packages/coldpitch`](packages/coldpitch). It uses `uv` and Python
3.11+, and keeps personal configuration and Gmail OAuth data outside the repository. See its
[README](packages/coldpitch/README.md) and [skill instructions](packages/coldpitch/SKILL.md).

## Development checks

```bash
npm run check
npm run check:extension
```

The dashboard is a zero-build Node app. The extension is loaded unpacked and has no build step.
Coldpitch's Python helpers are standalone `uv run` scripts.

## Repository boundaries

Tracked source only is included in this merge. Do not commit:

- `apps/dashboard/data/` or any `.env` file;
- Google OAuth credentials, tokens, API keys, resumes, or personal trackers;
- Python virtual environments, Node dependencies, or generated motion renders.

The original standalone repositories remain untouched as backups while this monorepo is validated.
