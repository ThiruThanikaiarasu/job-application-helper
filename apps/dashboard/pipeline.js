// coldpitch AI pipeline, server-side. Two engines, chosen in Settings:
//   engine = "claude-cli" → shell out to `claude -p` (runs on your Claude subscription, no API key)
//   engine = "api"        → Anthropic SDK with an API key (metered per-token)
// Both port SKILL.md stages 1–7 into one agent that researches (web) + drafts,
// and return a structured record the dashboard writes to the Google Sheet.

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const MODEL = "claude-opus-4-8";

function instructions(settings) {
  // Email = the connected Google account (drafts are created there). Name = first
  // line of the signature, else the account. No separate name/email fields needed.
  const sig = settings.sender?.signature || "";
  const email = settings.oauth?.account || settings.sender?.email || "(your connected Gmail)";
  const name = sig.split("\n").map((l) => l.trim()).find(Boolean) || settings.sender?.name || email;
  return `You are coldpitch, a high-conviction job-application research agent. Given a job (URL or pasted JD), you:
1. Intake — company, role, seniority, location.
2. Persona — the best human recipient (hiring lead, else CTO/founder/eng lead) via PUBLIC data only (LinkedIn/GitHub/blog/talks). Verify they are current.
3. Company research — product, tech stack, recent changes, open-source, case studies. Collect concrete supporting facts (signals) as you go, each traceable to a source.
4. Gap synthesis — the single strongest thing they're missing / could win with that the candidate can credibly speak to.
5. Draft — a tight, SELF-CONTAINED cold email in the candidate's voice: personalized opener (real specific signal) → the gap → concrete proof from the résumé (real metrics only) → soft low-friction ask → signature. Everything in the body. NO links, NO attachments. ~150–200 words.
6. Critique as a skeptical CTO, refine once.

Rules: public data only; every claim traces to the résumé or a public fact; no fabricated metrics; never invent an email address — if none is publicly findable, leave it blank.
Sender — Name: ${name}, Email: ${email}. Sign the email with this block:\n${sig || name}

=== CONFIDENCE (report honestly, independently per field) ===
- recipientConfidence: how sure are you this named person is the right, CURRENT contact? none|low|medium|high.
- emailConfidence: how sure are you this exact address is correct/deliverable? none|low|medium|high.
- gapConfidence: how sure are you this gap is real (not a misread of the JD/company)? none|low|medium|high.
Whenever a confidence is not "high", include a short, specific recipientReason explaining why (what you tried, what blocked you, what's genuinely uncertain).

=== SIGNALS ===
List 2-4 concrete facts that support the gap thesis, each tagged with where it came from. Prefer specific, checkable facts over vague impressions.
source ∈ "changelog" | "docs" | "posting" | "community" | "unverified" (use "unverified" only for a reasonable inference you could not confirm with a source).
Include sourceUrl when you have a real URL for that fact (a changelog entry, a docs page, the job posting itself); omit or leave "" when you don't.

=== FLAGS ===
Anything the human should know before trusting this output — each a distinct, honest disclosure, not vague hedging. Common cases: no résumé provided (claims are generic, not verified), low/no-confidence recipient or email, a better application channel exists (e.g. official careers portal), the JD conflicts with itself, etc.
Each flag: { "mark": "⚠" for a real gap/risk, or "◈" for a neutral suggestion, "text": one sentence, "fix": a short actionable button label if there's a concrete next step (e.g. "Attach résumé", "Find contact", "Open portal") or omit "fix" if there isn't one }.
If there is truly nothing to flag, return an empty flags array — do not invent a flag to fill space.

=== IF YOU CANNOT RESEARCH THIS AT ALL ===
(dead link, login wall, no JD text, nothing extractable) — do NOT respond with prose or a clarifying question. Output ONLY:
{"failed":true,"failureReason":"one clear sentence — what you tried and what blocked it"}

=== OTHERWISE, output ONLY a fenced \`\`\`json code block (no prose) with EXACTLY these keys ===
{
  "company":"", "role":"", "location":"",
  "recipient":"", "recipientTitle":"", "recipientConfidence":"none|low|medium|high", "recipientReason":"",
  "email":"", "emailConfidence":"none|low|medium|high",
  "channel":"email|linkedin-dm",
  "gapThesis":"1-2 sentences, the core insight", "gapConfidence":"none|low|medium|high",
  "signals":[{"text":"","source":"changelog|docs|posting|community|unverified","sourceUrl":""}],
  "flags":[{"mark":"⚠|◈","text":"","fix":""}],
  "subject":"", "emailBody":"<p>…</p> full HTML incl signature",
  "notes":"one short sentence summarizing overall confidence — the flags array carries the detail, this is just a caption"
}`;
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const raw = fenced ? fenced[1] : (start !== -1 && end > start ? text.slice(start, end + 1) : null);
  if (!raw) throw new Error("The agent didn't return a result — it replied: " + text.slice(0, 300));
  return JSON.parse(raw);
}

// ---------- engine: Anthropic API (SDK) ----------
async function runViaApi({ jobUrl, jd, settings }) {
  if (!settings.anthropicApiKey) throw new Error("No Anthropic API key — set it in Settings, or switch engine to Claude CLI.");
  const client = new Anthropic({ apiKey: settings.anthropicApiKey });

  const content = [];
  let resumeMissing = true;
  const p = settings.resumePath;
  if (p && existsSync(p)) {
    const buf = await readFile(p);
    if (p.toLowerCase().endsWith(".pdf")) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } });
    else content.push({ type: "text", text: "RÉSUMÉ:\n" + buf.toString("utf8") });
    resumeMissing = false;
  }
  content.push({ type: "text", text: `Research this job and draft the cold email.\n\nJob: ${jobUrl || jd}` + (resumeMissing ? "\n\n(No résumé readable — draft from public role fit only and add a flag for it.)" : "") });

  const tools = [
    { type: "web_search_20260209", name: "web_search" },
    { type: "web_fetch_20260209", name: "web_fetch" },
  ];
  let messages = [{ role: "user", content }];
  let final;
  for (let i = 0; i < 10; i++) {
    const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, thinking: { type: "adaptive" }, system: instructions(settings), tools, messages });
    final = await stream.finalMessage();
    if (final.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: final.content }); continue; }
    break;
  }
  const text = final.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { record: extractJson(text), resumeMissing };
}

// ---------- engine: Claude CLI (subscription, headless) ----------
function runClaudeCli(prompt) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json", "--allowedTools", "WebSearch,WebFetch,Read"];
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("claude CLI timed out after 5 min")); }, 300_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(new Error("Could not run `claude` CLI: " + e.message)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude CLI exited ${code}: ${err.slice(0, 400)}`));
      resolve(out);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function runViaCli({ jobUrl, jd, settings }) {
  const p = settings.resumePath;
  const resumeMissing = !(p && existsSync(p));
  const prompt = `${instructions(settings)}

TASK: Research this job and draft the cold email. Use WebSearch/WebFetch for research.
Job: ${jobUrl || jd}
${resumeMissing ? "(No résumé path available — draft from public role fit only and add a flag for it.)" : `Read the candidate's résumé with the Read tool from: ${p}`}`;

  const stdout = await runClaudeCli(prompt);
  // `claude --output-format json` prints an envelope with the assistant text in `.result`.
  let envelope;
  try { envelope = JSON.parse(stdout); } catch { throw new Error("Unexpected claude CLI output: " + stdout.slice(0, 300)); }
  const text = envelope.result ?? envelope.text ?? (typeof envelope === "string" ? envelope : JSON.stringify(envelope));
  return { record: extractJson(text), resumeMissing };
}

export async function runPipeline({ jobUrl, jd, settings }) {
  const engine = settings.engine || "claude-cli";
  const run = engine === "api" ? runViaApi : runViaCli;
  return run({ jobUrl, jd, settings });
}
