let overlayHost = null;
let popoverHost = null;
let lastSelection = "";
let contacts = [{ name: "", email: "" }];
let agentEnabled = true;
let pendingJobData = null;
let lastAgentJobUrl = ""; // set right before firing START_RESEARCH; lets "Open dashboard" deep-link to that job's report

const DRAFT_KEY = "jt:draft";
const JMC_URL = "http://localhost:4319";

// ── Selection popover ─────────────────────────────────────

document.addEventListener("mouseup", (ev) => {
  if (overlayHost?.contains(ev.target) || popoverHost?.contains(ev.target)) return;
  setTimeout(() => {
    const s = window.getSelection().toString().trim();
    removePopover();
    if (s) { lastSelection = s; showPopover(s); }
  }, 10);
});

document.addEventListener("mousedown", (ev) => {
  if (popoverHost && !popoverHost.contains(ev.target)) removePopover();
});

function showPopover(selectedText) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const rect = sel.getRangeAt(0).getBoundingClientRect();

  popoverHost = document.createElement("div");
  const top = window.innerHeight - rect.bottom > 50
    ? rect.bottom + 6
    : rect.top - 38;

  popoverHost.style.cssText = [
    "position:fixed",
    `left:${rect.left + rect.width / 2}px`,
    `top:${top}px`,
    "transform:translateX(-50%)",
    "z-index:2147483646",
    "display:flex",
    "gap:3px",
    "background:#1e1e1e",
    "border-radius:6px",
    "padding:4px",
    "box-shadow:0 3px 12px rgba(0,0,0,.45)",
    "font-family:system-ui,sans-serif",
  ].join(";");

  [
    ["company", "Company"],
    ["role",    "Role"],
    ["contact", "Contact"],
    ["email",   "Email"],
  ].forEach(([type, label]) => {
    const btn = document.createElement("span");
    btn.textContent = label;
    btn.style.cssText = [
      "display:inline-block",
      "color:#fff",
      "font-size:11px",
      "padding:3px 8px",
      "border-radius:4px",
      "cursor:pointer",
      "border:1px solid rgba(255,255,255,.2)",
      "user-select:none",
      "white-space:nowrap",
    ].join(";");
    btn.addEventListener("mouseover", () => (btn.style.background = "rgba(255,255,255,.15)"));
    btn.addEventListener("mouseout",  () => (btn.style.background = ""));
    btn.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ensureOverlayVisible();
      const shadow = overlayHost.shadowRoot;
      if (type === "contact" || type === "email") {
        fillNextContactSlot(type === "contact" ? "name" : "email", selectedText, shadow);
      } else {
        shadow.getElementById(type).value = selectedText;
        saveDraft(shadow);
      }
      removePopover();
    });
    popoverHost.appendChild(btn);
  });

  document.body.appendChild(popoverHost);
}

function removePopover() {
  popoverHost?.remove();
  popoverHost = null;
}

function ensureOverlayVisible() {
  if (!overlayHost) { toggleOverlay(); return; }
  if (!overlayHost.isConnected) document.body.appendChild(overlayHost);
  overlayHost.style.display = "";
}

// ── Messages ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "TOGGLE_PANEL")  toggleOverlay();
  if (msg.type === "EXTRACT_JOB")  sendResponse(extractJobData());
  if (msg.type === "REFRESH") {
    // Re-sync form from storage so contacts added on another tab/page show up
    if (overlayHost?.isConnected) loadDraft(overlayHost.shadowRoot);
    checkForNewJob();
  }
  if (msg.type === "FILL_FIELD") {
    ensureOverlayVisible();
    const shadow = overlayHost.shadowRoot;
    if (msg.field === "contact")      fillNextContactSlot("name",  msg.value, shadow);
    else if (msg.field === "contactEmail") fillNextContactSlot("email", msg.value, shadow);
    else shadow.getElementById(msg.field).value = msg.value;
  }
  if (msg.type === "FILL_FROM_SELECTION") {
    if (lastSelection) {
      ensureOverlayVisible();
      const shadow = overlayHost.shadowRoot;
      if (msg.field === "contact")      fillNextContactSlot("name",  lastSelection, shadow);
      else if (msg.field === "contactEmail") fillNextContactSlot("email", lastSelection, shadow);
      else shadow.getElementById(msg.field).value = lastSelection;
    }
  }
});

// ── SPA navigation ────────────────────────────────────────

let lastUrl = location.href;
let checkTimer = null;

function scheduleCheck(delay) {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(checkForNewJob, delay);
}

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    scheduleCheck(800);
  }
}).observe(document, { subtree: true, childList: true });

new MutationObserver(() => {
  scheduleCheck(1000);
}).observe(document, {
  subtree: true,
  childList: true,
  attributeFilter: ["data-job-id", "data-view-name"],
});

function checkForNewJob() {
  const newData = extractJobData();

  if (!newData.company && !newData.role) return;

  if (overlayHost?.isConnected) {
    const shadow = overlayHost.shadowRoot;
    const currentCompany = shadow.getElementById("company").value.trim();
    // Only show banner if a different company was scraped
    if (newData.company === currentCompany) return;
    pendingJobData = newData;
    if (overlayHost.style.display !== "none") {
      shadow.getElementById("new-job-banner").style.display = "flex";
    }
  } else {
    pendingJobData = newData;
  }
}

// Persist draft when switching away from tab
document.addEventListener("visibilitychange", () => {
  if (document.hidden && overlayHost?.isConnected) {
    saveDraft(overlayHost.shadowRoot);
  }
});

// ── Contact list (flat, scrollable — no pagination) ────────

function renderContactRows(shadow) {
  const wrap = shadow.getElementById("contact-rows");
  wrap.innerHTML = contacts.map((c, i) => `
    <div class="contact-row" data-i="${i}">
      <input class="cname" data-i="${i}" value="${e(c.name)}" placeholder="Name">
      <div class="cdiv"></div>
      <input class="cemail" data-i="${i}" value="${e(c.email)}" placeholder="Email">
      <button type="button" class="cremove" data-i="${i}" aria-label="Remove contact">×</button>
    </div>`).join("");

  wrap.querySelectorAll(".cname").forEach((el) => el.addEventListener("input", () => {
    contacts[+el.dataset.i].name = el.value; saveDraft(shadow);
  }));
  wrap.querySelectorAll(".cemail").forEach((el) => el.addEventListener("input", () => {
    contacts[+el.dataset.i].email = el.value; saveDraft(shadow);
  }));
  wrap.querySelectorAll(".cremove").forEach((el) => el.addEventListener("click", () => {
    contacts.splice(+el.dataset.i, 1);
    if (!contacts.length) contacts.push({ name: "", email: "" });
    renderContactRows(shadow);
    saveDraft(shadow);
  }));

  const count = shadow.getElementById("ccount");
  count.textContent = contacts.length > 4 ? `${contacts.length} — list scrolls` : "";
  wrap.style.maxHeight = contacts.length > 4 ? "196px" : "none";
  wrap.style.overflowY = contacts.length > 4 ? "auto" : "visible";
  wrap.style.paddingRight = contacts.length > 4 ? "4px" : "0";
}

function fillNextContactSlot(key, value, shadow) {
  let idx = contacts.findIndex((c) => !c[key].trim());
  if (idx === -1) { contacts.push({ name: "", email: "" }); idx = contacts.length - 1; }
  contacts[idx][key] = value;
  renderContactRows(shadow);
  saveDraft(shadow);
}

// ── Draft persistence ───────────────────────────────────────

function saveDraft(shadow) {
  const draft = {
    company: shadow.getElementById("company").value,
    role:    shadow.getElementById("role").value,
    url:     shadow.getElementById("url").value,
    contacts: [...contacts],
    agent:   agentEnabled,
  };
  chrome.storage.local.set({ [DRAFT_KEY]: draft });
  updateMonogram(shadow);
}

function loadDraft(shadow) {
  chrome.storage.local.get(DRAFT_KEY, (result) => {
    const d = result[DRAFT_KEY];
    if (d) {
      if (d.company) shadow.getElementById("company").value = d.company;
      if (d.role)    shadow.getElementById("role").value    = d.role;
      // Only trust a stored URL if it's a draft-in-progress for THIS page —
      // otherwise keep the freshly-scraped current-page URL already in the field.
      if (d.url && d.url === location.href) shadow.getElementById("url").value = d.url;
      if (typeof d.agent === "boolean") agentEnabled = d.agent;
      contacts = d.contacts?.length ? d.contacts : [{ name: "", email: "" }];
      renderContactRows(shadow);
      setAgentUI(shadow);
    }
    updateMonogram(shadow);
    if (pendingJobData) {
      shadow.getElementById("new-job-banner").style.display = "flex";
    }
  });
}

function updateMonogram(shadow) {
  const company = shadow.getElementById("company").value;
  shadow.getElementById("company-mono").textContent = monogram(company);
}

function monogram(name) {
  return (name || "?").replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

// ── Agent toggle ─────────────────────────────────────────────

function setAgentUI(shadow) {
  const box = shadow.getElementById("agent-box");
  const card = shadow.getElementById("agent-card");
  const saveBtn = shadow.getElementById("save-btn");
  box.textContent = agentEnabled ? "✓" : "";
  box.style.background = agentEnabled ? "#1F6B4E" : "#FFFFFF";
  box.style.borderColor = agentEnabled ? "#1F6B4E" : "#D6D0C5";
  card.style.background = agentEnabled ? "#F3F7F4" : "#FFFFFF";
  card.style.borderColor = agentEnabled ? "#DDE9E2" : "#E7E3DA";
  saveBtn.textContent = agentEnabled ? "Save and start research" : "Save application";
}

// ── Overlay ───────────────────────────────────────────────

function toggleOverlay() {
  if (overlayHost) {
    if (!overlayHost.isConnected) {
      // LinkedIn's SPA removed us from the DOM — re-attach without losing data
      document.body.appendChild(overlayHost);
    }
    const hidden = overlayHost.style.display === "none";
    overlayHost.style.display = hidden ? "" : "none";
    return;
  }

  const data = extractJobData();
  overlayHost = document.createElement("div");
  overlayHost.style.cssText = "position:fixed;top:56px;right:16px;z-index:2147483647;";

  const shadow = overlayHost.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;550;600;650;700&family=JetBrains+Mono:wght@400;500&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      .panel{width:380px;background:#FFFFFF;border-radius:14px;box-shadow:0 18px 44px rgba(25,24,22,.18);font-family:'Inter',-apple-system,Helvetica,sans-serif;font-size:13px;color:#191816;overflow:hidden;-webkit-font-smoothing:antialiased;animation:pop 140ms ease}
      @keyframes pop{from{transform:scale(.985);opacity:0}to{transform:scale(1);opacity:1}}
      input,button{font:inherit}
      input::placeholder{color:#B5AEA3}

      .header{display:flex;align-items:center;gap:9px;padding:13px 15px;border-bottom:1px solid #EFEBE3;background:#FCFBF9}
      .jm{width:22px;height:22px;border-radius:6px;background:#1F6B4E;color:#EAF3EE;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
      .title{font-size:13.5px;font-weight:650;letter-spacing:-.015em}
      .spacer{flex:1}
      .dash-link{font-size:11.5px;font-weight:550;color:#5A554C;text-decoration:none;cursor:pointer}
      .dash-link:hover{color:#1F6B4E;text-decoration:underline}
      .gear{border:none;background:transparent;cursor:pointer;color:#A8A299;font-size:14px;padding:2px;line-height:1}
      .gear:hover{color:#3B3831}

      .body{padding:14px 15px 16px}
      .strip{display:flex;align-items:center;gap:9px;padding:9px 11px;margin-bottom:13px;background:#F3F7F4;border:1px solid #DDE9E2;border-radius:9px}
      .strip .dot{width:6px;height:6px;border-radius:50%;background:#1F6B4E;flex:none}
      .strip .t{font-size:11.5px;color:#1F6B4E;font-weight:550;line-height:1.35}

      .banner{display:none;align-items:center;gap:10px;padding:10px 11px;margin-bottom:13px;background:#FBF7EF;border:1px solid #F0E4CE;border-radius:9px}
      .banner .dot{width:6px;height:6px;border-radius:50%;background:#E08A2B;flex:none}
      .banner .t{flex:1;font-size:11.5px;color:#7A5210;font-weight:550;line-height:1.35}
      .banner-yes{border:1px solid #E4D3B4;background:#FFFFFF;color:#7A5210;cursor:pointer;font-size:11px;font-weight:600;padding:4px 8px;border-radius:6px;white-space:nowrap}
      .banner-x{cursor:pointer;color:#B5AEA3;background:transparent;border:none;font-size:13px;line-height:1;padding:0 2px}

      label.f-label{display:block;font-size:10.5px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:#A8A299;margin-bottom:5px}
      .company-field{display:flex;align-items:center;gap:9px;padding:0 11px;margin-bottom:12px;border:1px solid #E0DBD1;border-radius:9px;background:#FFFFFF}
      .company-field:focus-within{border-color:#1F6B4E}
      .mono-tile{width:20px;height:20px;border-radius:5px;background:#E6F1EB;color:#1F6B4E;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
      #company{flex:1;border:none;outline:none;padding:9px 0;font-size:13.5px;color:#191816;background:transparent;width:100%}
      #role{width:100%;border:1px solid #E0DBD1;border-radius:9px;padding:9px 11px;font-size:13.5px;margin-bottom:12px;outline:none;color:#191816}
      #role:focus{border-color:#1F6B4E}

      .url-row{display:flex;align-items:center;gap:8px;padding:8px 11px;margin-bottom:12px;border:1px solid #E7E3DA;border-radius:9px;background:#F7F5F1}
      #url{flex:1;min-width:0;border:none;outline:none;background:transparent;font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#6E6A63;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #url:not([readonly]){color:#191816}
      .url-edit{border:none;background:transparent;color:#5A554C;cursor:pointer;font-size:11px;font-weight:600;padding:0;white-space:nowrap}

      .c-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}
      .c-head label{font-size:10.5px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:#A8A299}
      #ccount{font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#A8A299}
      .c-add{border:1px solid #E0DBD1;background:#FFFFFF;color:#3B3831;cursor:pointer;font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px}
      #contact-rows{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
      .contact-row{display:flex;align-items:center;border:1px solid #E0DBD1;border-radius:9px;overflow:hidden;flex:none}
      .contact-row .cname{width:38%;min-width:0;border:none;outline:none;padding:8px 10px;font-size:12.5px;background:transparent}
      .cdiv{width:1px;align-self:stretch;background:#EFEBE3;flex:none}
      .contact-row .cemail{flex:1;min-width:0;border:none;outline:none;padding:8px 10px;font-size:12px;font-family:'JetBrains Mono',monospace;background:transparent}
      .cremove{border:none;background:transparent;color:#C7C0B5;cursor:pointer;font-size:14px;padding:0 9px;line-height:1;flex:none}
      .cremove:hover{color:#9A4A34}

      .agent-card{display:flex;gap:10px;align-items:flex-start;padding:11px;border:1px solid #E7E3DA;background:#FFFFFF;border-radius:10px;cursor:pointer;margin-bottom:14px}
      .agent-box{width:16px;height:16px;border-radius:5px;border:1.5px solid #D6D0C5;background:#FFFFFF;color:#FFFFFF;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none;margin-top:1px}
      .agent-title{font-size:12.5px;font-weight:600}
      .agent-sub{font-size:11.5px;color:#5A554C;line-height:1.4;margin-top:2px}

      #save-btn{width:100%;border:1px solid #1F6B4E;background:#1F6B4E;color:#F6FAF8;cursor:pointer;padding:11px;border-radius:10px;font-size:13.5px;font-weight:650;letter-spacing:-.01em}
      #save-btn:hover{background:#175539;border-color:#175539}
      #save-btn:disabled{opacity:.7;cursor:default}
      #save-error{color:#9A4A34;font-size:11.5px;margin-top:8px;text-align:center;min-height:0}

      .footnote{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:11px}
      .footnote span{font-size:11px;color:#5A554C}

      #view-saved{display:none;padding:30px 22px 22px;text-align:center}
      .saved-check{width:38px;height:38px;border-radius:50%;background:#E6F1EB;color:#1F6B4E;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 13px}
      .saved-title{font-size:15px;font-weight:650;letter-spacing:-.015em}
      .saved-body{font-size:12.5px;color:#6E6A63;margin-top:5px;line-height:1.45}
      .saved-actions{display:flex;gap:8px;margin-top:18px}
      .saved-actions button{flex:1;cursor:pointer;padding:9px;border-radius:9px;font-size:12.5px;font-weight:600}
      #log-another{border:1px solid #E0DBD1;background:#FFFFFF;color:#3B3831}
      #open-dash{border:1px solid #1F6B4E;background:#1F6B4E;color:#F6FAF8}
    </style>
    <div class="panel">
      <div class="header">
        <div class="jm">JM</div>
        <div class="title">Log application</div>
        <div class="spacer"></div>
        <a class="dash-link" id="dash-link" href="${JMC_URL}" target="_blank" rel="noopener">Dashboard ↗</a>
        <button type="button" class="gear" id="settings" aria-label="Settings">⚙</button>
        <button type="button" class="gear" id="close" aria-label="Close">✕</button>
      </div>

      <div id="view-form" class="body">
        <div class="strip" id="capture-strip" style="display:none">
          <div class="dot"></div>
          <div class="t">Read from this page — check the fields before saving</div>
        </div>

        <div class="banner" id="new-job-banner">
          <div class="dot"></div>
          <div class="t">New job detected — update?</div>
          <button type="button" class="banner-yes" id="banner-yes">Yes</button>
          <button type="button" class="banner-x" id="banner-x">✕</button>
        </div>

        <label class="f-label">Company</label>
        <div class="company-field">
          <div class="mono-tile" id="company-mono">?</div>
          <input id="company" placeholder="Company name" value="${e(data.company)}">
        </div>

        <label class="f-label">Role</label>
        <input id="role" placeholder="Job title" value="${e(data.role)}">

        <label class="f-label">Posting URL</label>
        <div class="url-row">
          <input id="url" readonly value="${e(data.url)}">
          <button type="button" class="url-edit" id="url-edit">Edit</button>
        </div>

        <div class="c-head">
          <label>Contacts</label>
          <span id="ccount"></span>
          <div class="spacer" style="flex:1"></div>
          <button type="button" class="c-add" id="c-add">+ Add</button>
        </div>
        <div id="contact-rows"></div>

        <div class="agent-card" id="agent-card">
          <div class="agent-box" id="agent-box"></div>
          <div>
            <div class="agent-title">Research and draft a cold email</div>
            <div class="agent-sub">The agent finds the gap and writes a draft. It stops there — you approve it in the dashboard.</div>
          </div>
        </div>

        <button type="button" id="save-btn">Save application</button>
        <div id="save-error"></div>

        <div class="footnote">
          <svg width="10" height="12" viewBox="0 0 11 13" fill="none" aria-hidden="true"><path d="M2.5 5.5V3.6a3 3 0 0 1 6 0v1.9" stroke="#5A554C" stroke-width="1.4" fill="none"></path><rect x="1" y="5.5" width="9" height="6.5" rx="2" fill="#5A554C"></rect></svg>
          <span>Saved to your own sheet · nothing is sent</span>
        </div>
      </div>

      <div id="view-saved">
        <div class="saved-check">✓</div>
        <div class="saved-title"></div>
        <div class="saved-body"></div>
        <div class="saved-actions">
          <button type="button" id="log-another">Log another</button>
          <button type="button" id="open-dash">Open dashboard</button>
        </div>
      </div>
    </div>`;

  // ── field draft-saving ──
  ["company", "role"].forEach((id) => {
    shadow.getElementById(id).addEventListener("input", () => saveDraft(shadow));
  });
  shadow.getElementById("url").addEventListener("input", () => saveDraft(shadow));

  // Posting URL — read-only display with an Edit affordance
  shadow.getElementById("url-edit").addEventListener("click", () => {
    const urlInput = shadow.getElementById("url");
    urlInput.removeAttribute("readonly");
    urlInput.focus();
    urlInput.select();
  });

  // Contacts
  shadow.getElementById("c-add").addEventListener("click", () => {
    contacts.push({ name: "", email: "" });
    renderContactRows(shadow);
    saveDraft(shadow);
    const rows = shadow.querySelectorAll(".cname");
    rows[rows.length - 1]?.focus();
  });

  // Agent opt-in toggle
  shadow.getElementById("agent-card").addEventListener("click", () => {
    agentEnabled = !agentEnabled;
    setAgentUI(shadow);
    saveDraft(shadow);
  });

  // New job banner
  shadow.getElementById("banner-yes").addEventListener("click", () => {
    if (!pendingJobData) return;
    shadow.getElementById("company").value = pendingJobData.company || "";
    shadow.getElementById("role").value    = pendingJobData.role    || "";
    shadow.getElementById("url").value     = pendingJobData.url     || "";
    contacts = [{ name: "", email: "" }]; // new company — reset contacts
    renderContactRows(shadow);
    saveDraft(shadow);
    pendingJobData = null;
    shadow.getElementById("new-job-banner").style.display = "none";
  });
  shadow.getElementById("banner-x").addEventListener("click", () => {
    pendingJobData = null;
    shadow.getElementById("new-job-banner").style.display = "none";
  });

  // Save
  shadow.getElementById("save-btn").addEventListener("click", async () => {
    const urlVal = shadow.getElementById("url").value.trim();
    const companyVal = shadow.getElementById("company").value.trim();
    const roleVal = shadow.getElementById("role").value.trim();
    setSaveError(shadow, "");

    if (agentEnabled) {
      lastAgentJobUrl = urlVal;
      chrome.runtime.sendMessage({ type: "START_RESEARCH", jobUrl: urlVal });
      chrome.storage.local.remove(DRAFT_KEY);
      showSavedState(shadow, true);
      return;
    }
    lastAgentJobUrl = "";

    const payload = {
      date: today(), company: companyVal, role: roleVal, url: urlVal,
      contact:      contacts.map((c) => c.name.trim()).filter(Boolean).join(", "),
      contactEmail: contacts.map((c) => c.email.trim()).filter(Boolean).join(", "),
    };
    const btn = shadow.getElementById("save-btn");
    btn.disabled = true; btn.textContent = "Saving…";
    const res = await chrome.runtime.sendMessage({ type: "LOG_JOB", data: payload });
    btn.disabled = false;
    if (res?.ok) {
      chrome.storage.local.remove(DRAFT_KEY);
      showSavedState(shadow, false);
    } else {
      setAgentUI(shadow); // restores button label
      setSaveError(shadow, res?.error || "Failed to save. Check Settings.");
    }
  });

  // Saved-state actions
  shadow.getElementById("log-another").addEventListener("click", () => resetForm(shadow));
  shadow.getElementById("open-dash").addEventListener("click", () => {
    // If research is running for this job, jump straight to its live report
    // instead of the plain dashboard — no second /api/pipeline call is made.
    const url = lastAgentJobUrl ? `${JMC_URL}/?reportJobUrl=${encodeURIComponent(lastAgentJobUrl)}` : JMC_URL;
    window.open(url, "_blank");
  });
  shadow.getElementById("dash-link").addEventListener("click", (ev) => { ev.preventDefault(); window.open(JMC_URL, "_blank"); });

  shadow.getElementById("settings").addEventListener("click", () =>
    chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" })
  );
  shadow.getElementById("close").addEventListener("click", () => {
    overlayHost.style.display = "none";
  });

  document.body.appendChild(overlayHost);

  renderContactRows(shadow);
  setAgentUI(shadow);
  updateMonogram(shadow); // reflect the initial scrape immediately; loadDraft corrects it if a draft exists
  loadDraft(shadow);
  shadow.getElementById("capture-strip").style.display = (data.company || data.role) ? "flex" : "none";

  if (!data.company && !data.role) {
    setTimeout(checkForNewJob, 1200);
  }
}

function showSavedState(shadow, agentOn) {
  const firstNamed = contacts.find((c) => c.name.trim());
  const title = agentOn ? "Saved · agent is researching" : "Saved to Mission Control";
  const body = agentOn
    ? (firstNamed
        ? `A draft for ${firstNamed.name.trim().split(" ")[0]} will be waiting in your dashboard in a few minutes. Nothing sends.`
        : "Add a contact in the dashboard and the agent will draft the email there.")
    : "You can draft the email any time from the dashboard.";
  shadow.getElementById("view-form").style.display = "none";
  const saved = shadow.getElementById("view-saved");
  saved.querySelector(".saved-title").textContent = title;
  saved.querySelector(".saved-body").textContent = body;
  saved.style.display = "block";
}

function resetForm(shadow) {
  shadow.getElementById("company").value = "";
  shadow.getElementById("role").value = "";
  shadow.getElementById("url").value = location.href;
  shadow.getElementById("url").setAttribute("readonly", "");
  contacts = [{ name: "", email: "" }];
  renderContactRows(shadow);
  updateMonogram(shadow);
  shadow.getElementById("capture-strip").style.display = "none";
  shadow.getElementById("view-saved").style.display = "none";
  shadow.getElementById("view-form").style.display = "block";
}

function setSaveError(shadow, msg) {
  shadow.getElementById("save-error").textContent = msg || "";
}

// ── Helpers ───────────────────────────────────────────────

function e(s) {
  return (s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ── Scrapers ──────────────────────────────────────────────

function extractJobData() {
  const host = location.hostname;
  if (host.includes("linkedin.com")) return scrapeLinkedIn();
  if (host.includes("indeed.com"))   return scrapeIndeed();
  if (host.includes("naukri.com"))   return scrapeNaukri();
  return { company: "", role: "", contact: "", url: location.href, date: today() };
}

function scrapeLinkedIn() {
  let role =
    text(".job-details-jobs-unified-top-card__job-title h1") ||
    text(".jobs-unified-top-card__job-title h1") ||
    text("h1.t-24");

  let company =
    text(".job-details-jobs-unified-top-card__company-name a") ||
    text(".job-details-jobs-unified-top-card__company-name") ||
    text(".jobs-unified-top-card__company-name a");

  if (!role || !company) {
    const panel =
      document.querySelector(".jobs-search__job-details--container") ||
      document.querySelector(".scaffold-layout__detail") ||
      document.querySelector(".jobs-search-two-pane__detail-view") ||
      document.querySelector("[data-view-name='jobs-details']") ||
      document.querySelector(".job-view-layout");

    const root = panel || document;

    if (!role) {
      const h1 = root.querySelector("h1");
      role = (h1?.innerText || h1?.textContent || "").trim();
    }
    if (!company) {
      const link = root.querySelector('a[href*="/company/"]');
      company = (link?.innerText || link?.textContent || "").trim();
    }
  }

  return { company, role, contact: "", url: location.href, date: today() };
}

function scrapeIndeed() {
  return {
    company: text('[data-testid="inlineHeader-companyName"] span'),
    role:    text('[data-testid="jobsearch-JobInfoHeader-title"]'),
    contact: "",
    url:     location.href,
    date:    today(),
  };
}

function scrapeNaukri() {
  return {
    company: text(".jd-header-comp-name a") || text(".jd-header-comp-name"),
    role:    text(".jd-header-title"),
    contact: "",
    url:     location.href,
    date:    today(),
  };
}

function text(sel) {
  const el = document.querySelector(sel);
  return (el?.innerText?.trim() || el?.textContent?.trim()) || "";
}

function today() {
  return new Date().toISOString().split("T")[0];
}
