# /coldpitch config

Copy this file to `config.md` (same directory) and fill in your details. `config.md` is
git-ignored so your personal data never gets committed. The skill reads it on every run and
writes back the first time a value is filled in, so you're never asked twice.

```yaml
resume_path:        ""        # REQUIRED — local path to your resume, e.g. ~/Documents/resume.pdf
sender_name:        ""        # how to sign emails, e.g. "Jane Doe"
sender_email:       ""        # the Gmail address the drafts are created in (matches your OAuth setup)
sender_signature:   |        # optional closing block
  Jane Doe
  Fullstack Developer
  jane@example.com · +1-555-0100
  linkedin.com/in/janedoe · github.com/janedoe
tracker_path:       "~/.claude/skills/coldpitch/job-applications.md"
draft_via:          "mailer.py"   # self-contained mailer.py — own OAuth store ~/.config/coldpitch/, drafts only
self_contained:     true          # convey the ENTIRE pitch in the email body — no artifact/doc/gist/attachment/links
default_iterations: 3             # critique -> refine loop cap
follow_up_days:     5             # business days after draft before follow-up reminder
```

## Notes
- The pipeline **never sends** — it stops at a Gmail draft you review and send yourself.
- Persona discovery uses **public data only** (see Guardrails in SKILL.md).
- Optional: put a Hunter.io API key at `~/.config/coldpitch/hunter.key` for real per-mailbox
  email verification (`finder.py verify/hunter`). Without it, verification is MX-only.
