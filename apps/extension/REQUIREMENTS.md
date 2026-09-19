# Requirements

## Problem

Job hunting involves sending cold emails to HR/managers. After each application, you manually switch tabs, copy details (company, role, contact), and paste them into a tracking spreadsheet. Repetitive and slow.

## Goal

A Chrome extension that auto-captures job application details and appends them to a Google Sheet with one click.

## Core Features

### Must Have
- [ ] Detect job listing pages (LinkedIn, Naukri, Indeed, company career pages)
- [ ] Extract: company name, job title, contact name/email (if visible), job URL
- [ ] One-click "Log Application" button (popup or page action)
- [ ] Append extracted row to a user-configured Google Sheet
- [ ] OAuth2 Google sign-in to authorize Sheets access

### Nice to Have
- [ ] Editable fields in popup before logging (in case auto-extract is wrong)
- [ ] Show last 5 logged entries in popup
- [ ] Auto-fill cold email template with extracted details
- [ ] Status indicator: "Already logged" if URL exists in sheet

## Non-Goals (v1)
- Mobile support
- Multi-sheet / multi-user
- Email sending from extension

## Data Shape (Sheet columns)
| Date | Company | Role | Contact | URL | Notes |

## Constraints
- Manifest V3 (Chrome's current standard)
- No backend server — Sheets API called directly from extension
- Minimal permissions: `identity`, `storage`, `activeTab`, `https://sheets.googleapis.com/*`
