const sheetIdEl  = document.getElementById("sheetId");
const sheetTabEl = document.getElementById("sheetTab");
const status     = document.getElementById("status");

chrome.storage.sync.get(["sheetId", "sheetTab"], ({ sheetId, sheetTab }) => {
  if (sheetId)  sheetIdEl.value  = sheetId;
  if (sheetTab) sheetTabEl.value = sheetTab;
});

document.getElementById("save").addEventListener("click", () => {
  const sheetId  = sheetIdEl.value.trim();
  const sheetTab = sheetTabEl.value.trim();
  if (!sheetId || !sheetTab) return;
  chrome.storage.sync.set({ sheetId, sheetTab }, () => {
    status.textContent = "Saved!";
    setTimeout(() => (status.textContent = ""), 1500);
  });
});
