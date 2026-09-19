# Contributing to Job Application Helper

Thanks for your interest in contributing. Job Application Helper is a small monorepo containing
three cooperating parts:

- `apps/dashboard` — the local dashboard, Google Sheets integration, research workflow, and Gmail
  draft creation.
- `apps/extension` — the Chrome extension that captures job postings.
- `packages/coldpitch` — the standalone research and outreach agent and its helper scripts.

Please read the root [README](README.md) before making changes. It describes the supported setup
and the drafts-only safety model.

## Code of conduct

Be respectful, assume good intent, and keep discussions focused on improving the project. Do not
share credentials, private résumés, personal email addresses, or other sensitive information in
issues, pull requests, logs, screenshots, or test fixtures.

## Before you start

For a new checkout:

```bash
git clone <repository-url> job-application-helper
cd job-application-helper
npm run install:dashboard
```

Configure only local, ignored files:

```bash
cp apps/dashboard/.env.example apps/dashboard/.env
cp apps/extension/config.example.js apps/extension/config.js
cp packages/coldpitch/config.example.md packages/coldpitch/config.md
```

Never commit those local files after adding credentials or personal data. The dashboard stores
runtime settings in `apps/dashboard/data/`; Coldpitch stores OAuth data in
`~/.config/coldpitch/`.

## Development workflow

Start the dashboard from the repository root:

```bash
npm start
```

The dashboard is available at <http://localhost:4319>. Load `apps/extension` as an unpacked
extension from `chrome://extensions` when working on the browser integration.

For Coldpitch helper scripts:

```bash
cd packages/coldpitch
uv run finder.py mx example.com
uv run finder.py verify person@example.com
```

The Coldpitch skill can be made available to Claude Code with a symlink:

```bash
ln -s "$(pwd)" ~/.claude/skills/coldpitch
```

If that path already exists, remove or update the existing symlink deliberately; do not overwrite
another skill without checking what it points to.

## Checks before opening a pull request

Run the checks relevant to your change. For a complete change, run all of them:

```bash
npm run check
npm run check:extension
node --check apps/dashboard/server.js
node --check apps/dashboard/pipeline.js
python3 -m py_compile packages/coldpitch/finder.py packages/coldpitch/mailer.py
```

If you change the dashboard, also start it and verify that `http://localhost:4319/` loads. If you
change the extension, reload it in Chrome and check the extension Errors panel. If you change
Coldpitch, run the affected `uv run` command with safe, non-personal test input.

## Safety requirements

These rules are part of the product contract:

- Never add automatic email sending. The dashboard and Coldpitch may create Gmail drafts only;
  the user must send them manually.
- Use public data only for research. Do not add private-profile scraping or bulk harvesting.
- Do not add SMTP probing or other abusive email-verification techniques.
- Do not commit OAuth credentials, refresh tokens, API keys, résumés, personal trackers, or real
  recipient data.
- Keep credentials out of source code, screenshots, logs, fixtures, and error messages.
- Preserve honest confidence labels and clearly identify inferred or unverified information.

## Issues and feature requests

Search existing issues before opening a new one. A useful bug report includes:

1. The component (`dashboard`, `extension`, or `coldpitch`).
2. The operating system, browser, Node/Python/`uv` versions, and relevant setup details.
3. Exact reproduction steps using redacted or synthetic data.
4. Expected behavior and actual behavior.
5. Relevant console output or screenshots with secrets and personal data removed.

For a major feature or behavior change, open an issue first and describe the proposed design. This
helps avoid duplicating work and keeps the three components compatible.

## Pull requests

Before opening a pull request:

1. Create a focused branch from the latest default branch.
2. Keep the change scoped and update the relevant documentation.
3. Add or update tests and run the checks above.
4. Confirm that no ignored or personal files are included:

   ```bash
   git status --short
   git diff --check
   git diff --stat
   ```

5. Explain the problem, the solution, affected components, and verification in the pull request.
6. Call out any OAuth, Google Sheet, Gmail, extension-permission, or migration impact.

Pull requests that weaken the drafts-only behavior, expose credentials, or rely on private data
will not be accepted.

## Commit messages

Use a short imperative subject with a conventional type and, when useful, a component scope:

```text
feat(extension): add recruiter contact capture
fix(dashboard): preserve sheet status during refresh
docs(repo): clarify local OAuth setup
test(coldpitch): cover MX lookup failure
```

Keep commits small and logically grouped. Avoid mixing formatting-only changes with behavior
changes.

## License

By contributing, you agree that your contribution may be distributed under the repository's
license.
