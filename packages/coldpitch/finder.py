# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "dnspython",
# ]
# ///
"""Email discovery + verification helper for /coldpitch. ToS-clean, no SMTP probing.

  uv run finder.py mx <domain>            # MX lookup — can the domain receive mail?
  uv run finder.py github <username>      # public commit emails from a dev's GitHub
  uv run finder.py verify <email>         # MX of the email's domain (+ Hunter verify if key)
  uv run finder.py pattern <first> <last> <domain>   # candidate patterns + MX sanity
  uv run finder.py hunter <domain> [first] [last]    # Hunter.io finder (needs key)

Optional Hunter.io: put the key in ~/.config/coldpitch/hunter.key to enable real
per-mailbox verification / domain search. Without it, verification is MX-only
(domain-level) and confidence stays "inferred".
"""

import json
import sys
import urllib.request
from pathlib import Path

import dns.resolver

HUNTER_KEY_PATH = Path.home() / ".config" / "coldpitch" / "hunter.key"


def _hunter_key():
    return HUNTER_KEY_PATH.read_text().strip() if HUNTER_KEY_PATH.exists() else None


def mx(domain: str):
    try:
        recs = sorted(dns.resolver.resolve(domain, "MX"), key=lambda r: r.preference)
        hosts = [r.exchange.to_text().rstrip(".") for r in recs]
        provider = ""
        joined = " ".join(hosts).lower()
        if "outlook" in joined or "protection.outlook" in joined:
            provider = "Microsoft 365"
        elif "google" in joined or "googlemail" in joined:
            provider = "Google Workspace"
        return {"domain": domain, "accepts_mail": True, "mx": hosts, "provider": provider}
    except Exception as e:
        return {"domain": domain, "accepts_mail": False, "error": type(e).__name__}


def github(username: str):
    url = f"https://api.github.com/users/{username}/events/public"
    req = urllib.request.Request(url, headers={"User-Agent": "coldpitch-finder"})
    emails = {}
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            events = json.load(r)
    except Exception as e:
        return {"username": username, "error": type(e).__name__}
    for ev in events:
        for c in ev.get("payload", {}).get("commits", []):
            a = c.get("author", {}) or {}
            em, nm = a.get("email"), a.get("name")
            if em and "noreply.github.com" not in em:
                emails[em] = nm
    return {"username": username, "commit_emails": [{"email": e, "name": n} for e, n in emails.items()]}


def hunter_verify(email: str):
    key = _hunter_key()
    if not key:
        return None
    url = f"https://api.hunter.io/v2/email-verifier?email={email}&api_key={key}"
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            d = json.load(r)["data"]
        return {"status": d.get("status"), "score": d.get("score"), "smtp_check": d.get("smtp_check")}
    except Exception as e:
        return {"error": type(e).__name__}


def hunter_find(domain, first=None, last=None):
    key = _hunter_key()
    if not key:
        return {"error": "no_hunter_key", "hint": f"put an API key in {HUNTER_KEY_PATH}"}
    if first and last:
        url = f"https://api.hunter.io/v2/email-finder?domain={domain}&first_name={first}&last_name={last}&api_key={key}"
    else:
        url = f"https://api.hunter.io/v2/domain-search?domain={domain}&api_key={key}"
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return json.load(r)["data"]
    except Exception as e:
        return {"error": type(e).__name__}


def verify(email: str):
    domain = email.split("@", 1)[1]
    out = {"email": email, "mx": mx(domain)}
    h = hunter_verify(email)
    if h is not None:
        out["hunter"] = h
    else:
        out["note"] = "MX-only (no Hunter key) — domain deliverability only, mailbox NOT confirmed"
    return out


def patterns(first, last, domain):
    f, l = first.lower(), last.lower()
    cands = [f"{f}@{domain}", f"{f}.{l}@{domain}", f"{f}{l}@{domain}",
             f"{f[0]}{l}@{domain}", f"{f}_{l}@{domain}", f"{f}-{l}@{domain}"]
    return {"domain_mx": mx(domain), "candidates": cands,
            "note": "patterns are guesses; confirm against a public example or Hunter before use"}


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__); sys.exit(2)
    cmd = a[0]
    if cmd == "mx":
        res = mx(a[1])
    elif cmd == "github":
        res = github(a[1])
    elif cmd == "verify":
        res = verify(a[1])
    elif cmd == "pattern":
        res = patterns(a[1], a[2], a[3])
    elif cmd == "hunter":
        res = hunter_find(a[1], a[2] if len(a) > 2 else None, a[3] if len(a) > 3 else None)
    else:
        print(__doc__); sys.exit(2)
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
