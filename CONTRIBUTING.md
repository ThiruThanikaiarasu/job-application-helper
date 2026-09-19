# Contributing to coldpitch

Thanks for considering a contribution. This project is small on purpose — keep changes
focused and in the spirit of the existing guardrails below.

## Before you open a PR

- **Never make the pipeline auto-send.** Every code path ends at a Gmail *draft*. If a
  change makes sending possible without an explicit user action, it will be rejected.
- **Keep research public-data-only.** No scraping of private/gated profiles, no bulk
  harvesting. If in doubt, see the Guardrails section in `SKILL.md`.
- **No SMTP probing for email verification.** It's unreliable and can hurt sender/domain
  reputation. Stick to MX checks and optional Hunter.io-style APIs.
- **Scripts stay standalone.** `mailer.py` and `finder.py` should keep working with
  `uv run <script>` and zero project-specific imports — declare dependencies inline (PEP
  723) rather than adding a `requirements.txt` or package structure.
- **No personal data in commits.** `config.md`, `job-applications.md`, and anything under
  `~/.config/coldpitch/` are git-ignored for a reason — double-check `git diff` before
  committing.

## Development setup

```bash
git clone https://github.com/Balaramansethu/coldpitch.git
cd coldpitch
cp config.example.md config.md   # fill in your own details for local testing
```

Test the standalone scripts directly:

```bash
uv run mailer.py --check                 # confirm your OAuth account (see README setup)
uv run finder.py mx github.com           # sanity-check the finder with no side effects
```

To test the full pipeline, symlink your working copy into Claude Code's skills directory
and run `/coldpitch <job-url>`:

```bash
ln -s "$(pwd)" ~/.claude/skills/coldpitch
```

## What's useful to contribute

- Improvements to the persona-discovery or gap-synthesis prompting in `SKILL.md`
- Additional free/ethical email-verification sources in `finder.py`
- Bug fixes in `mailer.py` (MIME edge cases, attachment support, etc. — as long as sending
  stays manual)
- Docs, examples, and templates

## Commit style

Small, logical commits with a clear imperative subject line (e.g. `Add MX caching to
finder.py`), same as the existing history. Avoid bundling unrelated changes into one commit.

## Reporting issues

Open a GitHub issue with what you ran, what you expected, and what happened. If it's a
privacy/security concern, please avoid pasting real email addresses, tokens, or résumés
into the issue.
