importScripts("config.js");

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const JMC_ORIGIN = "http://localhost:4319";

function sendToActiveTab(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, msg, () => {
      if (chrome.runtime.lastError?.message?.includes("Receiving end does not exist")) {
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, files: ["content.js"] },
          () => chrome.tabs.sendMessage(tab.id, msg)
        );
      }
    });
  });
}

chrome.action.onClicked.addListener(() => sendToActiveTab({ type: "TOGGLE_PANEL" }));

chrome.runtime.onInstalled.addListener(() => {
  const items = [
    { id: "company",      title: "Fill → Company" },
    { id: "role",         title: "Fill → Role" },
    { id: "contact",      title: "Fill → Contact Name" },
    { id: "contactEmail", title: "Fill → Contact Email" },
  ];
  items.forEach(({ id, title }) =>
    chrome.contextMenus.create({ id, title, contexts: ["selection"], parentId: undefined })
  );
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const field = info.menuItemId;
  const value = info.selectionText?.trim();
  if (!value || !tab) return;
  chrome.tabs.sendMessage(tab.id, { type: "FILL_FIELD", field, value }, () => {
    if (chrome.runtime.lastError?.message?.includes("Receiving end does not exist")) {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["content.js"] },
        () => chrome.tabs.sendMessage(tab.id, { type: "FILL_FIELD", field, value })
      );
    }
  });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.sendMessage(tabId, { type: "REFRESH" }, () => {
    void chrome.runtime.lastError; // suppress error if content script not injected
  });
});

const cmdFieldMap = {
  fill_company: "company",
  fill_role:    "role",
  fill_contact: "contact",
};

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "open_panel") { sendToActiveTab({ type: "TOGGLE_PANEL" }); return; }
  const field = cmdFieldMap[cmd];
  if (field) sendToActiveTab({ type: "FILL_FROM_SELECTION", field });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "LOG_JOB") {
    appendToSheet(msg.data).then(sendResponse).catch((err) =>
      sendResponse({ ok: false, error: err.message })
    );
    return true;
  }
  if (msg.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }
  if (msg.type === "START_RESEARCH") {
    // Fire-and-forget: Job Mission Control's own pipeline researches, drafts,
    // and appends the row itself (its own sheet/OAuth) — we don't also append.
    fetch(`${JMC_ORIGIN}/api/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobUrl: msg.jobUrl }),
    })
      .then((r) => r.json())
      .then((d) => console.log("[job-tracker] research", d.ok ? "started" : "failed:", d.error || ""))
      .catch((err) => console.error("[job-tracker] could not reach Job Mission Control:", err.message));
  }
});

async function appendToSheet(data) {
  const { sheetId, sheetTab } = await chrome.storage.sync.get(["sheetId", "sheetTab"]);
  if (!sheetId) throw new Error("No sheet ID configured. Open settings.");
  const tab = sheetTab || "Sheet1";

  const token = await getAuthToken();
  const row = [data.date, data.company, data.role, data.url, "Applied", data.contact || "", data.contactEmail || ""];
  const range = encodeURIComponent(`'${tab}'!A1`);

  const res = await fetch(
    `${SHEETS_API}/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Sheets API error");
  }

  return { ok: true };
}

const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.compose",
];

function getAuthToken() {
  return new Promise((resolve, reject) => {
    const redirectUri = chrome.identity.getRedirectURL();
    console.log("Redirect URI:", redirectUri);
    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      `client_id=${encodeURIComponent(OAUTH_CLIENT_ID)}` +
      `&response_type=token` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(OAUTH_SCOPES.join(" "))}`;

    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      const match = responseUrl?.match(/[#&]access_token=([^&]+)/);
      if (match) resolve(decodeURIComponent(match[1]));
      else reject(new Error("No token in response"));
    });
  });
}
