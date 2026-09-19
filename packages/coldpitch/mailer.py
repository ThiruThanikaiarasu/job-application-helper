# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "google-api-python-client",
#   "google-auth-oauthlib",
#   "google-auth",
# ]
# ///
"""Self-contained Gmail draft creator for the /coldpitch skill.

Independent of any other project. Uses its own OAuth store at
~/.config/coldpitch/ (credentials.json + cached token.json), authenticated as
your Gmail account with the gmail.compose scope (drafts only — never sends).

Usage:
  uv run mailer.py --check                 # print the authenticated Gmail account
  uv run mailer.py <payload.json>          # create draft(s) from a JSON payload

payload.json:
  { "to": "x@y.com", "subject": "...", "html_body": "<p>...</p>" }
  or  { "to": ["a@x.com","b@y.com"], "subject": "...", "html_body": "..." }
Prints one DRAFT_ID line per draft created.
"""

import base64
import json
import sys
from email.mime.text import MIMEText
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Drafts only. Never request send/read scopes.
SCOPES = ["https://www.googleapis.com/auth/gmail.compose"]

CONFIG_DIR = Path.home() / ".config" / "coldpitch"
CREDENTIALS_PATH = CONFIG_DIR / "credentials.json"
TOKEN_PATH = CONFIG_DIR / "token.json"


def get_credentials() -> Credentials:
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_PATH.exists():
                raise FileNotFoundError(
                    f"Missing OAuth client at {CREDENTIALS_PATH}. Put a Desktop-app "
                    "OAuth client JSON (Gmail API enabled) there and re-run to consent."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        TOKEN_PATH.write_text(creds.to_json())
    return creds


def gmail_service():
    return build("gmail", "v1", credentials=get_credentials())


def create_draft(service, to_email: str, subject: str, html_body: str) -> str:
    msg = MIMEText(html_body, "html")
    msg["to"] = to_email
    msg["subject"] = subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    draft = service.users().drafts().create(userId="me", body={"message": {"raw": raw}}).execute()
    return draft["id"]


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print("usage: mailer.py --check | mailer.py <payload.json>", file=sys.stderr)
        sys.exit(2)

    if args[0] == "--check":
        prof = gmail_service().users().getProfile(userId="me").execute()
        print("ACCOUNT:", prof.get("emailAddress"))
        return

    if args[0] == "--delete":
        gmail_service().users().drafts().delete(userId="me", id=args[1]).execute()
        print("DELETED", args[1])
        return

    payload = json.loads(Path(args[0]).read_text())
    to = payload["to"]
    recipients = to if isinstance(to, list) else [to]
    service = gmail_service()
    for addr in recipients:
        draft_id = create_draft(service, addr, payload["subject"], payload["html_body"])
        print(f"DRAFT_ID {addr} {draft_id}")


if __name__ == "__main__":
    main()
