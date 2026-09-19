# Job Tracker — Setup Guide

## What you need
- Chrome or Arc browser
- A Google account
- A Google Sheet to track applications

---

## Step 1 — Load the Extension

1. Open Chrome → go to `chrome://extensions`
2. Top-right → enable **Developer mode**
3. Click **Load unpacked**
4. Select the `apps/extension` folder from this repository
5. Note the **Extension ID** shown (you'll need it in Step 3)

---

## Step 2 — Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → create a new sheet
2. Add these headers in Row 1:
   ```
   Date | Company Name | Role | Link | Status
   ```
3. Name your tab (bottom of screen) — remember the exact name
4. Copy the Sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit
   ```

---

## Step 3 — Google Cloud Setup

### 3a. Create a project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Top-left dropdown → **New Project** → name it anything → Create

### 3b. Enable Sheets API
1. Left menu → **APIs & Services** → **Enable APIs & Services**
2. Search **Google Sheets API** → Enable

### 3c. OAuth Consent Screen
1. Left menu → **APIs & Services** → **OAuth consent screen**
2. User type → **External** → Create
3. Fill in:
   - App name: `Job Tracker`
   - User support email: your email
   - Developer email: your email
4. Click **Save and Continue**
5. Scopes → **Add or Remove Scopes** → paste these two and click Update:
   ```
   https://www.googleapis.com/auth/spreadsheets
   https://www.googleapis.com/auth/gmail.compose
   ```
6. Save and Continue
7. Test users → **+ Add Users** → add your Gmail → Save and Continue

### 3d. Create OAuth Credential
1. Left menu → **APIs & Services** → **Credentials**
2. **+ Create Credentials** → **OAuth 2.0 Client ID**
3. Application type → **Web application**
4. Name: `Job Tracker Extension`
5. Under **Authorized redirect URIs** → **+ Add URI** → paste:
   ```
   https://ijcabenbcfmdmcokjedkdoamkppdjnjn.chromiumapp.org/
   ```
6. Click **Create** → copy the **Client ID**

---

## Step 4 — Add your Client ID to the extension

1. Open the `apps/extension` folder
2. Open `background.js` in any text editor
3. Find line 1 and replace the client ID:
   ```js
   const OAUTH_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com";
   ```
4. Save the file
5. Go back to `chrome://extensions` → click the **refresh icon** on Job Tracker

---

## Step 5 — Configure the extension

1. Click the Job Tracker icon in Chrome toolbar
2. Click ⚙ (settings icon) in the panel
3. Enter:
   - **Sheet ID**: the ID you copied in Step 2
   - **Sheet Tab Name**: exact tab name (e.g. `Sheet1`)
4. Click **Save**

---

## How to use

| Action | How |
|---|---|
| Open/close panel | `Cmd+Shift+J` (Mac) / `Ctrl+Shift+J` (Windows) |
| Auto-fill a field | Select text on page → small popup appears → click the field name |
| Log to sheet | Fill in the form → click **Update Log** |
| First time only | Google sign-in popup will appear → click Allow |

Fields auto-fill from LinkedIn, Indeed, and Naukri job pages.

---

## Troubleshooting

**No Google sign-in popup** → Make sure your email is added as a test user (Step 3c)

**400 redirect_uri_mismatch** → Double-check the redirect URI in Google Console includes the trailing slash

**Extension not working on a page** → Reload the tab after loading the extension
