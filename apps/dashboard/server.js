// Job Mission Control — zero-dependency Node backend.
// Source of truth: a Google Sheet. All config lives in data/settings.json,
// edited from the in-app Settings page. Reuses a Google Desktop OAuth client
// (loopback flow) for both Sheets and Gmail (gmail.compose, drafts only).

import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { homedir } from "node:os";
import { runPipeline } from "./pipeline.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4319;
const DATA_DIR = join(__dirname, "data");
const SETTINGS_PATH = join(DATA_DIR, "settings.json");
const PUBLIC_DIR = join(__dirname, "public");
const REDIRECT_URI = `http://localhost:${PORT}/api/auth/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.compose",
];
// Sheet columns, in order (A..S). ResearchJSON carries the rich research-report
// data (per-field confidence, sourced signals, structured flags) as a JSON blob —
// kept out of the flat columns so Dashboard/Table/Drawer are unaffected.
const COLUMNS = [
  "Date", "Company", "Role", "Location", "JobURL", "Recipient", "RecipientTitle",
  "Email", "EmailConfidence", "Channel", "Status", "FollowUp", "GapThesis",
  "DraftId", "Source", "Notes", "Subject", "EmailBody", "ResearchJSON",
];
const LAST_COL = "S"; // 19 columns, A..S
const STATUSES = ["Researched", "Drafted", "Sent", "Replied", "Interview", "Offer", "Closed"];

// ---------- settings ----------
const DEFAULT_SETTINGS = {
  google: { clientId: "", clientSecret: "" },
  sheet: { id: "", tab: "Sheet1" },
  sender: { name: "", email: "", signature: "" },
  resumePath: "",
  hunterKey: "",
  followUpDays: 5,
  engine: "claude-cli", // "claude-cli" (subscription) | "api" (Anthropic API key)
  anthropicApiKey: "",
  templates: [], // [{ name, subject, body }] reusable email templates
  defaultTemplateName: "", // auto-fills new drafts
  oauth: { refreshToken: "", accessToken: "", expiry: 0, account: "" },
};

async function loadSettings() {
  if (!existsSync(SETTINGS_PATH)) return structuredClone(DEFAULT_SETTINGS);
  try {
    const raw = JSON.parse(await readFile(SETTINGS_PATH, "utf8"));
    return deepMerge(structuredClone(DEFAULT_SETTINGS), raw);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}
async function saveSettings(s) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(s, null, 2));
}
function deepMerge(base, over) {
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k])) {
      base[k] = deepMerge(base[k] || {}, over[k]);
    } else if (over[k] !== undefined) {
      base[k] = over[k];
    }
  }
  return base;
}
// Never leak secrets to the client; report presence instead.
function redactSettings(s) {
  return {
    google: { clientId: s.google.clientId, clientSecret: s.google.clientSecret ? "********" : "" },
    sheet: s.sheet,
    sender: s.sender,
    resumePath: s.resumePath,
    hunterKey: s.hunterKey ? "********" : "",
    followUpDays: s.followUpDays,
    engine: s.engine || "claude-cli",
    anthropicApiKey: s.anthropicApiKey ? "********" : "",
    templates: s.templates || [],
    defaultTemplateName: s.defaultTemplateName || "",
    oauth: { connected: !!s.oauth.refreshToken, account: s.oauth.account },
  };
}

// ---------- google auth ----------
async function getAccessToken(settings) {
  const o = settings.oauth;
  if (!o.refreshToken) throw new Error("Not connected to Google. Open Settings → Connect Google.");
  if (o.accessToken && Date.now() < o.expiry - 60_000) return o.accessToken;
  const body = new URLSearchParams({
    client_id: settings.google.clientId,
    client_secret: settings.google.clientSecret,
    refresh_token: o.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${data.error_description || data.error || res.status}`);
  settings.oauth.accessToken = data.access_token;
  settings.oauth.expiry = Date.now() + (data.expires_in || 3600) * 1000;
  await saveSettings(settings);
  return data.access_token;
}

async function googleFetch(settings, url, opts = {}) {
  const token = await getAccessToken(settings);
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Google API ${res.status}`);
  return data;
}

// ---------- sheet helpers ----------
async function ensureHeaders(settings) {
  const { id, tab } = settings.sheet;
  const range = encodeURIComponent(`${tab}!A1:${LAST_COL}1`);
  const data = await googleFetch(settings, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`);
  const have = (data.values && data.values[0]) || [];
  if (have.length === 0) {
    await googleFetch(
      settings,
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: [COLUMNS] }) }
    );
  }
}

async function readJobs(settings) {
  const { id, tab } = settings.sheet;
  if (!id) throw new Error("No Sheet configured. Open Settings and set your Sheet ID.");
  const range = encodeURIComponent(`${tab}!A1:${LAST_COL}`);
  const data = await googleFetch(settings, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`);
  const rows = data.values || [];
  const jobs = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const job = { rowNumber: i + 1 };
    COLUMNS.forEach((c, idx) => (job[c] = r[idx] ?? ""));
    jobs.push(job);
  }
  return jobs;
}

function jobToRow(job) {
  return COLUMNS.map((c) => job[c] ?? "");
}

async function appendJob(settings, job) {
  await ensureHeaders(settings);
  const { id, tab } = settings.sheet;
  const range = encodeURIComponent(`${tab}!A1`);
  const data = await googleFetch(
    settings,
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [jobToRow(job)] }) }
  );
  const m = /![A-Z]+(\d+)/.exec(data.updates?.updatedRange || "");
  return { rowNumber: m ? Number(m[1]) : null };
}

async function updateJob(settings, rowNumber, job) {
  const { id, tab } = settings.sheet;
  const range = encodeURIComponent(`${tab}!A${rowNumber}:${LAST_COL}${rowNumber}`);
  await googleFetch(
    settings,
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values: [jobToRow(job)] }) }
  );
}

// ---------- gmail draft ----------
function buildMime({ to, subject, html }) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}
async function createGmailDraft(settings, { to, subject, html }) {
  const raw = buildMime({ to, subject, html });
  const data = await googleFetch(
    settings,
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    { method: "POST", body: JSON.stringify({ message: { raw } }) }
  );
  return data.id;
}

// ---------- misc ----------
function addBusinessDays(from, n) {
  const d = new Date(from);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}
function sendJSON(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
async function serveStatic(res, urlPath) {
  const file = urlPath === "/" ? "/index.html" : urlPath;
  const full = join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR) || !existsSync(full)) { res.writeHead(404); res.end("Not found"); return; }
  const body = await readFile(full);
  res.writeHead(200, { "Content-Type": MIME[extname(full)] || "application/octet-stream" });
  res.end(body);
}

// ---------- request router ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    // ---- API ----
    if (p === "/api/settings" && req.method === "GET") {
      return sendJSON(res, 200, { settings: redactSettings(await loadSettings()), statuses: STATUSES, columns: COLUMNS });
    }
    if (p === "/api/settings" && req.method === "POST") {
      const patch = await readBody(req);
      const s = await loadSettings();
      // Ignore redacted placeholders so we don't overwrite real secrets with "********".
      const clean = stripPlaceholders(patch);
      const merged = deepMerge(s, clean);
      await saveSettings(merged);
      return sendJSON(res, 200, { settings: redactSettings(merged) });
    }
    if (p === "/api/settings/import-google" && req.method === "POST") {
      const credPath = join(homedir(), ".config", "coldpitch", "credentials.json");
      if (!existsSync(credPath)) return sendJSON(res, 404, { error: "No credentials.json at ~/.config/coldpitch/" });
      const c = JSON.parse(await readFile(credPath, "utf8")).installed;
      const s = await loadSettings();
      s.google.clientId = c.client_id;
      s.google.clientSecret = c.client_secret;
      await saveSettings(s);
      return sendJSON(res, 200, { settings: redactSettings(s) });
    }
    if (p === "/api/auth/google" && req.method === "GET") {
      const s = await loadSettings();
      if (!s.google.clientId || !s.google.clientSecret)
        return sendJSON(res, 400, { error: "Set Google Client ID + Secret in Settings first (or Import)." });
      const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: s.google.clientId,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
      });
      res.writeHead(302, { Location: authUrl });
      return res.end();
    }
    if (p === "/api/auth/callback" && req.method === "GET") {
      const code = url.searchParams.get("code");
      const s = await loadSettings();
      const body = new URLSearchParams({
        code, client_id: s.google.clientId, client_secret: s.google.clientSecret,
        redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
      });
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
      });
      const data = await r.json();
      if (!r.ok) { res.writeHead(400); return res.end("OAuth failed: " + (data.error_description || data.error)); }
      s.oauth.refreshToken = data.refresh_token || s.oauth.refreshToken;
      s.oauth.accessToken = data.access_token;
      s.oauth.expiry = Date.now() + (data.expires_in || 3600) * 1000;
      // fetch account email
      try {
        const prof = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${data.access_token}` },
        }).then((x) => x.json());
        s.oauth.account = prof.emailAddress || "";
      } catch {}
      await saveSettings(s);
      res.writeHead(302, { Location: "/?connected=1" });
      return res.end();
    }
    if (p === "/api/auth/status" && req.method === "GET") {
      const s = await loadSettings();
      return sendJSON(res, 200, { connected: !!s.oauth.refreshToken, account: s.oauth.account });
    }
    if (p === "/api/jobs" && req.method === "GET") {
      const s = await loadSettings();
      return sendJSON(res, 200, { jobs: await readJobs(s) });
    }
    if (p === "/api/jobs" && req.method === "POST") {
      const s = await loadSettings();
      const j = await readBody(req);
      const job = {
        Date: j.Date || new Date().toISOString().slice(0, 10),
        Company: j.Company || "", Role: j.Role || "", Location: j.Location || "",
        JobURL: j.JobURL || "", Recipient: j.Recipient || "", RecipientTitle: j.RecipientTitle || "",
        Email: j.Email || "", EmailConfidence: j.EmailConfidence || "", Channel: j.Channel || "email",
        Status: j.Status || "Researched",
        FollowUp: j.FollowUp || addBusinessDays(new Date(), s.followUpDays || 5),
        GapThesis: j.GapThesis || "", DraftId: j.DraftId || "", Source: j.Source || "manual", Notes: j.Notes || "",
        Subject: j.Subject || "", EmailBody: j.EmailBody || "",
      };
      await appendJob(s, job);
      return sendJSON(res, 200, { ok: true });
    }
    if (p.startsWith("/api/jobs/") && req.method === "PATCH") {
      const rowNumber = Number(p.split("/")[3]);
      const s = await loadSettings();
      const jobs = await readJobs(s);
      const existing = jobs.find((x) => x.rowNumber === rowNumber);
      if (!existing) return sendJSON(res, 404, { error: "Row not found" });
      const patch = await readBody(req);
      const merged = { ...existing, ...patch };
      await updateJob(s, rowNumber, merged);
      return sendJSON(res, 200, { ok: true });
    }
    if (p.match(/^\/api\/jobs\/\d+\/draft$/) && req.method === "POST") {
      const rowNumber = Number(p.split("/")[3]);
      const s = await loadSettings();
      const jobs = await readJobs(s);
      const job = jobs.find((x) => x.rowNumber === rowNumber);
      if (!job) return sendJSON(res, 404, { error: "Row not found" });
      const { subject, html } = await readBody(req);
      if (!job.Email) return sendJSON(res, 400, { error: "No recipient email on this job." });
      const draftId = await createGmailDraft(s, { to: job.Email, subject, html });
      const merged = { ...job, DraftId: draftId, Subject: subject, EmailBody: html, Status: job.Status === "Researched" ? "Drafted" : job.Status };
      await updateJob(s, rowNumber, merged);
      return sendJSON(res, 200, { ok: true, draftId });
    }
    if (p === "/api/pipeline" && req.method === "POST") {
      const s = await loadSettings();
      const { jobUrl, jd } = await readBody(req);
      if (!jobUrl && !jd) return sendJSON(res, 400, { error: "Provide a job URL or JD text." });

      const startedAt = Date.now();
      let record, resumeMissing;
      try {
        ({ record, resumeMissing } = await runPipeline({ jobUrl, jd, settings: s }));
      } catch (err) {
        // Genuine failure to research (dead link, no JD, nothing extractable) is an
        // expected outcome, not a server error — respond 200 so the client can
        // render its Failure state instead of a generic error toast.
        return sendJSON(res, 200, { ok: false, failure: true, reason: err.message, url: jobUrl || "" });
      }
      if (record.failed) {
        return sendJSON(res, 200, { ok: false, failure: true, reason: record.failureReason || "Could not research this posting.", url: jobUrl || "" });
      }
      const ranSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      const researchedAt = new Date().toISOString();

      const researchData = {
        recipientConfidence: record.recipientConfidence || "none",
        recipientReason: record.recipientReason || "",
        gapConfidence: record.gapConfidence || "none",
        signals: Array.isArray(record.signals) ? record.signals : [],
        flags: Array.isArray(record.flags) ? record.flags : [],
        ranSeconds, researchedAt,
      };
      if (resumeMissing && !researchData.flags.some((f) => /résumé|resume/i.test(f.text || ""))) {
        researchData.flags.push({ mark: "⚠", text: "No résumé available — claims in the draft are generic role-fit statements, not verified achievements.", fix: "Attach résumé" });
      }

      const job = {
        Date: new Date().toISOString().slice(0, 10),
        Company: record.company || "", Role: record.role || "", Location: record.location || "",
        JobURL: jobUrl || "", Recipient: record.recipient || "", RecipientTitle: record.recipientTitle || "",
        Email: record.email || "", EmailConfidence: record.emailConfidence || "none",
        Channel: record.channel || "email", Status: "Drafted",
        FollowUp: addBusinessDays(new Date(), s.followUpDays || 5),
        GapThesis: record.gapThesis || "", DraftId: "", Source: "coldpitch-ai",
        Notes: record.notes || "",
        Subject: record.subject || "", EmailBody: record.emailBody || "",
        ResearchJSON: JSON.stringify(researchData),
      };
      const { rowNumber } = await appendJob(s, job);
      return sendJSON(res, 200, { ok: true, record, resumeMissing, ranSeconds, researchedAt, flags: researchData.flags, rowNumber });
    }

    // ---- static ----
    if (req.method === "GET") return serveStatic(res, p);
    res.writeHead(405); res.end("Method not allowed");
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
});

function stripPlaceholders(obj) {
  const out = Array.isArray(obj) ? [] : {};
  for (const k of Object.keys(obj || {})) {
    const v = obj[k];
    if (v === "********") continue;
    if (v && typeof v === "object") out[k] = stripPlaceholders(v);
    else out[k] = v;
  }
  return out;
}

server.listen(PORT, () => {
  console.log(`Job Mission Control running → http://localhost:${PORT}`);
});
