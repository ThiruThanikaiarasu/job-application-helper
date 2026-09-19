# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Chrome extension that detects job listings and cold-email contexts, extracts key data (company, role, contact), and appends it to a Google Sheet — eliminating manual tab-switching and copy-paste during job applications.

## Stack

- Manifest V3 Chrome Extension
- Vanilla JS (content scripts, background service worker, popup)
- Google Sheets API v4 (via OAuth2)

## Key Files (once built)

- `manifest.json` — permissions, content script patterns, service worker
- `background.js` — OAuth token management, Sheets API calls
- `content.js` — DOM scraping logic per job site
- `popup/` — user-facing UI to confirm/edit before appending to sheet

## Dev Workflow

Load unpacked extension: Chrome → `chrome://extensions` → Developer mode → Load unpacked → select project root.

Reload after changes: Extensions page → refresh icon, or use a hot-reload tool like `web-ext`.

No build step unless bundling is added later.

## Architecture Notes

Content scripts run per-tab and extract structured job data `{ company, role, contact, url, date }`. They message the background worker which holds the OAuth token and makes the Sheets API request. Popup lets user review/edit before submit.

Site-specific scrapers live in `content.js` (or split by domain). Pattern-match on `manifest.json` `matches` array.
