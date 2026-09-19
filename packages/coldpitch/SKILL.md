---
name: coldpitch
description: "High-conviction job-application agent (project name: coldpitch-agent). Turn a job URL/JD into deep research on the company + hiring persona and a ranked gap analysis, then an adversarially-refined, self-contained cold outreach email (everything conveyed in the email itself — no external links/attachments) — ending in a ready-to-send Gmail draft plus a logged entry in a local tracker. Runs unattended behind one human checkpoint, so it's safe to delegate via Cowork or run on a scheduled cloud routine. Trigger: /coldpitch <job-url-or-JD>."
---

# /coldpitch — Gap → Outreach agent

Turn a single job link (or pasted JD) into a personalized, high-conviction cold email:
deep-dive the company and the person who'd hire you, find the gaps they're missing, and
write a tight, self-contained email that conveys the whole pitch **inline** — no artifact,
doc, gist, or attachment. Ends in a ready-to-send **Gmail draft**, logged in a local
tracker with a follow-up date.

**Everything runs autonomously up to ONE human checkpoint.** Nothing is ever sent
automatically: the pipeline ends by creating a Gmail *draft* the user reviews and sends.

## Usage

```
/coldpitch <job-url>          # full pipeline on a LinkedIn / job-board URL
/coldpitch <paste JD text>    # full pipeline on raw job-description text
/coldpitch <url> --iterations N   # cap the critique→refine loop at N passes (default 3)
/coldpitch <url> --dry-run    # run research + drafting, but do NOT create the Gmail draft
/coldpitch config             # show / set resume path, sender name, tracker location
```

## One-time config

On first run, read `config.md` in this skill directory (copy it from `config.example.md`
if missing). If `resume_path` is empty, ask for the local path to the résumé, read it, and
write the path into `config.md` so it's never asked again. Same for `sender_name` /
`sender_signature`. Draft creation needs a one-time Google OAuth setup — see README.

## Guardrails (non-negotiable)

- **Never send.** The pipeline stops at a Gmail *draft*. Sending is the user's click.
- **Self-contained email only.** Convey the entire pitch in the email body. Do NOT create
  or link artifacts, hosted docs, gists, or attachments — the reader needs nothing but the email.
- **Public data only.** Persona discovery uses public profiles/posts/talks/GitHub. Don't
  scrape private/gated data at scale (LinkedIn ToS + ethics). If an email isn't public, use
  a legitimate lookup and mark confidence; never guess-and-blast.
- **No credentials.** Never enter passwords, 2FA, or complete CAPTCHAs.
- **Honesty in claims.** Every claim in the email must trace to the résumé or a public fact.
  No fabricated metrics; label outside-in hypotheses as hypotheses.
- **One approval per email**, per run (Stage 8 checkpoint).

---

## Pipeline

Run in order. Stages 1–7 are autonomous. Stage 8 is the human checkpoint. Stage 9 runs
only after approval. Announce progress compactly; don't dump raw tool output.

### Stage 1 — Job Intake  *(autonomous)*
**In:** job URL or JD text → **Out:** structured record.
- Prefer `WebFetch` on the URL (works for public LinkedIn job views — no browser needed).
  Fall back to a browser tool only if WebFetch hits a login wall.
- If pasted text: parse directly.
- Produce: `{ company, role_title, seniority, location, remote?, comp_if_stated,
  must_have_stack, nice_to_have, responsibilities[], apply_status, poster_name,
  poster_relationship }`.
- **Check apply status.** If closed/already applied, say so and continue outreach-only
  (the cold email's value doesn't depend on the listing being open).

### Stage 2 — Persona Discovery  *(autonomous, public data only)*
**In:** company + poster → **Out:** recipient + how to reach them.
- Best recipient: the poster if they're the hiring lead, else the CTO / founder / eng lead.
  Use `WebSearch` + their public LinkedIn/GitHub/blog.
- Collect **public signal** (recent posts, talks, repos, bios) — raw material for a
  personalized opener.
- **Verify the recipient is current** (not a former employee) — stale directory data is
  common. If they've moved on, re-pick a current contact.
- **Email discovery** via `finder.py` (in this skill dir), stop at first reliable hit:
  1. Publicly listed email (site / contact page / bio).
  2. **GitHub commit emails** — `uv run finder.py github <username>` (great for devs; also
     reveals the company's `first.x@domain` pattern from any @company address).
  3. **Pattern inference** from a *confirmed* public example →
     `uv run finder.py pattern <first> <last> <domain>` → mark **medium**.
  4. None found → produce the **LinkedIn-DM variant** and note it.
- **Verify deliverability**: `uv run finder.py verify <email>` (MX = domain accepts mail).
  MX-valid + confirmed pattern = **medium**; MX-only guess = **low**. Real per-mailbox
  verification needs a Hunter.io key at `~/.config/coldpitch/hunter.key`; never SMTP-probe.
  Label confidence honestly and flag low/medium at the checkpoint.
- Record: `{ recipient_name, title, email, email_confidence, signal_notes[] }`.

### Stage 3 — Product / Company Research  *(autonomous)*
- `WebFetch`/`WebSearch` the site, product, docs, changelog, GitHub, pricing. Produce a
  feature/tech-stack read + recent-changes note. For services firms, read practice areas
  and recent case studies instead of a single product.

### Stage 4 — Gap Synthesis  *(autonomous)*
- Rank "things they're missing / could win with" by (impact × credibility ÷ effort), each
  `{ hypothesis, evidence, why_it_matters, confidence }`. Pick the **top 1** as the email's spine.

### Stage 5 — Cold Mail Draft  *(autonomous, self-contained)*
**In:** persona + research + gap + résumé → **Out:** `{ subject, body }` in the user's voice.
- Read the résumé (`resume_path`); match the JD's must-haves to concrete résumé evidence.
- Structure: personalized opener (Stage 2 signal + their specific work) → the gap you see
  (Stage 4) → **the substance conveyed inline** — a few tight lines/bullets of how you'd
  approach it + proof from the résumé (real metrics) → the fundamentals the role asks for →
  a soft, low-friction ask → signature.
- **Everything in the body. No links, no attachments.** Skimmable; a builder who did
  homework, not a wall of text.
- Also produce a shorter **LinkedIn-DM variant** (used if email confidence is low/none).

### Stage 6 — Persona Critique  *(autonomous, adversarial)*
- Simulate the recipient as a skeptical senior eng / CTO / founder reading the email. Attack:
  Is the gap real or a misread? Are claims credible and specific? Does the opener feel
  researched or templated? Is it too long? Would they reply — what makes them hit delete?
- Output a ranked list of weaknesses with fixes.

### Stage 7 — Refine loop  *(autonomous)*
- Apply Stage 6 fixes; re-run the critique. Loop until **send-worthy** or `--iterations N`
  (default 3). Keep a one-line changelog per pass.
- **Personalization check** (final gate): named + specific to them ✓, in the user's voice ✓,
  every claim true ✓, no template/fluff ✓, low-friction ask ✓, length appropriate ✓.

### Stage 8 — HUMAN CHECKPOINT  *(user)*
- Show inline: **recipient + email (+ confidence), subject, full body**, the top gap +
  fit rationale (2–3 lines), and the personalization-check result.
- Ask for one pass: **approve / edit / reject.** On edit, apply and re-show. Don't proceed
  without explicit approval. (On `--dry-run`, stop here — never create the draft.)

### Stage 9 — Create Draft + Track  *(after approval)*
- **Draft via this skill's self-contained mailer** (`mailer.py`). It has its own OAuth store
  at `~/.config/coldpitch/` (`gmail.compose` scope, drafts only — never sends) and declares
  its deps inline (PEP 723), so `uv run` needs no venv. It is independent of the claude.ai
  Gmail connector (which may be a different account than your sending identity).
  1. Confirm the account once: `uv run mailer.py --check` → prints `ACCOUNT: <you>@gmail.com`.
  2. Write the email HTML + recipient(s) to a JSON payload (avoids shell-escaping):
     `{ "to": "x@y.com" | ["a@x.com",...], "subject": "...", "html_body": "<p>…</p>" }`
  3. Create the draft(s): `uv run mailer.py <payload.json>` → prints `DRAFT_ID <addr> <id>`;
     each lands in the connected Gmail's Drafts.
  - Delete a draft with `uv run mailer.py --delete <draftId>`. Never call `.send()`.
- If email confidence was low/none, still create the draft (drafts are safe/editable) but
  **flag the unverified address**, or hand over the LinkedIn-DM variant.
- Append a tracker row (`tracker_path`):
  `date | company | role | recipient | email(conf) | channel | status | follow_up(+N bd) | notes`.

---

## Output contract (end of run)
Compact report: company/role, recipient + email confidence, top gap + why, the refine-loop
changelog (N passes), the personalization-check result, the Gmail draft location (or DM
handoff), and the tracker row. Flag any degraded stage (e.g. no public email → LinkedIn DM).
