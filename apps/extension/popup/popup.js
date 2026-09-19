const fields = ["company", "role", "contact", "url", "notes"];
const status = document.getElementById("status");

// Pre-fill from content script
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_JOB" }, (data) => {
    if (chrome.runtime.lastError || !data) return; // not a job page
    fields.forEach((f) => {
      if (data[f]) document.getElementById(f).value = data[f];
    });
  });
});

document.getElementById("job-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {};
  fields.forEach((f) => (data[f] = document.getElementById(f).value.trim()));
  data.date = new Date().toISOString().split("T")[0];

  setStatus("Logging…", "");

  const res = await chrome.runtime.sendMessage({ type: "LOG_JOB", data });

  if (res?.ok) {
    setStatus("Logged!", "ok");
    setTimeout(() => window.close(), 800);
  } else {
    setStatus(res?.error || "Failed", "err");
  }
});

document.getElementById("settings-link").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function setStatus(msg, cls) {
  status.textContent = msg;
  status.className = cls;
}
