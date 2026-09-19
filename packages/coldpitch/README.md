# coldpitch-agent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**An autonomous [Claude Code](https://claude.com/claude-code) agent that turns a job link into a researched, high-conviction cold email — ending in a ready-to-send Gmail draft.**

> **Naming note:** this project is branded `coldpitch-agent`; the install path, skill
> name, and slash command all remain `coldpitch` / `/coldpitch` for stability. Same tool,
> agent framing.

Most job applications are a coin toss into an ATS. `coldpitch-agent` does what a thoughtful
candidate would do by hand, automatically: it researches the company and the person who'd
hire you, finds a real gap you could speak to, and writes a tight, *self-contained* outreach
email in your voice — then drops it in your Gmail **Drafts** for you to review and send.

It's built as an **agent**, not a one-shot script: every stage from intake through the
critique/refine loop runs unattended behind a single human checkpoint, which is exactly the
shape a dispatched or delegated task needs — see [Running it autonomously](#running-it-autonomously-cowork--scheduled-dispatch).

![Quickstart demo — clone, configure, and run the finder helper](assets/quickstart.gif)

- 🔎 Deep-dives the role, company, and hiring persona from public data
- 🎯 Finds a credible **gap** and frames your experience against it
- ✍️ Writes a self-contained email — the whole pitch is *in the email*, no links/attachments
- 🧪 Hardens it with an adversarial "skeptical CTO" critique + a personalization check
- 📧 Creates a **Gmail draft** (never sends) and logs it in a local tracker
- 📬 Finds & MX-verifies recipient emails; falls back to a LinkedIn-DM variant
- 🤖 One human checkpoint by design — safe to delegate to Cowork or a scheduled routine

> **Drafts only, by design.** coldpitch-agent never sends email, never posts, and never
> enters credentials — in chat, in Cowork, or on a schedule. Every run stops at a draft you
> approve and send yourself.

---

## How it works

```
job URL / JD
   │
   ▼
1 Intake  →  2 Persona + email discovery  →  3 Company research  →  4 Gap synthesis
                                                                          │
                                                                          ▼
        7 Refine ⇄ 6 Critique  ◀──────────────  5 Self-contained email draft
                     │
                     ▼
              8 You approve  →  9 Gmail draft created + tracker updated
```

Run it in Claude Code with:

```
/coldpitch https://www.linkedin.com/jobs/view/XXXXXXXXXX
/coldpitch <paste a job description>
/coldpitch <url> --dry-run     # research + draft, but don't touch Gmail
```

---

## Running it autonomously (Cowork & scheduled dispatch)

Stages 1–7 (intake → persona/gap research → draft → adversarial critique → refine) already
run with no human input — the pipeline was designed around exactly **one** checkpoint
(Stage 8), before anything is created in Gmail. That contract is what makes it safe to hand
to Claude's async/autonomous execution modes instead of only running it turn-by-turn in chat.

**Batch delegation via Cowork** — give a Cowork session a list of job URLs instead of
pasting them one at a time. The agent researches, drafts, and critiques each one on its own
and comes back with every draft ready for a single batch review, rather than a live
back-and-forth per link.

**Scheduled dispatch via cloud routines** — Claude Code can run a prompt on a recurring
cron schedule as a durable, cloud-hosted routine (its own `claude.ai` URL, independent of
any open session). Ask Claude to schedule it, e.g.:

> "Every weekday at 8am, run `/coldpitch` against my saved job search at \<url\> and leave
> the drafts for me to review."

Point a routine at a saved search or a list of URLs you maintain, and researched drafts are
waiting in Gmail each time it fires — the agent runs unattended; only *reading* the drafts
and hitting send stays yours.

**The safety contract doesn't change under automation.** `mailer.py` has no send capability
by design (see [Privacy & ethics](#privacy--ethics)) — so no chat prompt, Cowork task, or
scheduled routine can make this pipeline send on its own, however it's triggered.

---

## Requirements

- [Claude Code](https://claude.com/claude-code) (Pro/Max/Team/Enterprise or API)
- [`uv`](https://docs.astral.sh/uv/) (`brew install uv`) — runs the helper scripts with
  zero venv setup (dependencies are declared inline via PEP 723)
- Python ≥ 3.11
- A Google account for the Gmail draft (one-time OAuth, below)

---

## Install

Clone straight into your Claude Code skills directory:

```bash
git clone https://github.com/balaramansethu/coldpitch.git ~/.claude/skills/coldpitch
```

Claude Code auto-discovers skills in `~/.claude/skills/`, so `/coldpitch` is available in
your next session.

## Setup (one time)

**1. Config**

```bash
cd ~/.claude/skills/coldpitch
cp config.example.md config.md
```

Edit `config.md` — set `resume_path`, `sender_name`, `sender_email`, and `sender_signature`.
(`config.md` is git-ignored.)

**2. Google OAuth for Gmail drafts**

The mailer creates drafts through the Gmail API using **your own** OAuth client, stored in
`~/.config/coldpitch/` — independent of anything else.

1. In [Google Cloud Console](https://console.cloud.google.com/): create (or pick) a project →
   **Enable the Gmail API**.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID → Desktop app**.
   Download the JSON.
3. Save it as `~/.config/coldpitch/credentials.json`:
   ```bash
   mkdir -p ~/.config/coldpitch && mv ~/Downloads/client_secret_*.json ~/.config/coldpitch/credentials.json
   ```
4. Authorize once — a browser window opens; sign in with the Gmail account you want drafts in:
   ```bash
   uv run ~/.claude/skills/coldpitch/mailer.py --check
   # → ACCOUNT: you@gmail.com
   ```
   This caches a token at `~/.config/coldpitch/token.json`. The only scope requested is
   `gmail.compose` (create drafts — it cannot read your mail or send).

**3. (Optional) Better email verification**

Drop a [Hunter.io](https://hunter.io/) API key at `~/.config/coldpitch/hunter.key` to enable
real per-mailbox verification. Without it, recipient emails are MX-verified (domain-level)
and labeled by confidence.

---

## The helper scripts

Both are standalone (`uv run <script>` — no venv), used by the skill but also usable directly:

| Script | What it does |
|--------|--------------|
| `mailer.py --check` | Print the authenticated Gmail account |
| `mailer.py <payload.json>` | Create draft(s) from `{to, subject, html_body}` — never sends |
| `mailer.py --delete <id>` | Delete a draft |
| `finder.py github <user>` | Public commit emails from a dev's GitHub |
| `finder.py verify <email>` | MX check (+ Hunter verify if a key is present) |
| `finder.py pattern <first> <last> <domain>` | Candidate address patterns |
| `finder.py mx <domain>` | Does the domain accept mail? Which provider? |

---

## Privacy & ethics

- **Never sends, posts, or enters credentials.** Output is always a draft for your review.
- **Public data only** for research. No scraping of private/gated profiles at scale.
- **No SMTP probing** for email verification (unreliable and abusive) — MX + optional
  Hunter API only.
- Your résumé, config, tokens, and tracker stay **local** (and git-ignored). Nothing about
  you is committed to this repo.

---

## License

[MIT](LICENSE)
