#!/usr/bin/env python3
"""
timelog.py — dev time tracker backed by Supabase.
Only logs time against projects registered in dev_projects — i.e. projects
with real infra in Supabase, GitHub, and/or Vercel. Spreadsheets, outreach,
and other non-infra work don't qualify.

Usage:
    python3 timelog.py start <project> ["notes"]
    python3 timelog.py stop  <project> ["notes"]
    python3 timelog.py status
    python3 timelog.py projects
    python3 timelog.py report [project] [--days N] [--with-git-baseline] [--area=<feature-area>]

Examples:
    python3 timelog.py projects
    python3 timelog.py start sparky "debugging auth flow"
    python3 timelog.py stop sparky "fixed truncated anon key"
    python3 timelog.py start sparky "exam-ui: NC exam calculator wiring"
    python3 timelog.py status
    python3 timelog.py report sparky --days 30
    python3 timelog.py report sparky --with-git-baseline
    python3 timelog.py report sparky --area=exam-ui
    python3 timelog.py report hermes --area=infra --days 7
"""
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

SUPABASE_URL = "https://dqyqlgnaawqnlxvxwcys.supabase.co"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6"
    "ImRxeXFsZ25hYXdxbmx4dnh3Y3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MDU2"
    "NzksImV4cCI6MjA5NjI4MTY3OX0.bQvLX_ui0nd2zug_GccifsdMj2M0Uo2GHHb_MF3"
    "BElI"
)
TABLE = f"{SUPABASE_URL}/rest/v1/dev_time_log"
PROJECTS_TABLE = f"{SUPABASE_URL}/rest/v1/dev_projects"

HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def _request(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} error: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)


def _valid_projects():
    rows = _request("GET", f"{PROJECTS_TABLE}?active=eq.true&select=slug,name")
    return {r["slug"]: r["name"] for r in rows}


def _require_known_project(project):
    valid = _valid_projects()
    if project not in valid:
        print(f"'{project}' isn't a registered project (must exist in Supabase/GitHub/Vercel).")
        if valid:
            print("Known projects:")
            for slug, name in valid.items():
                print(f"  {slug:<20} {name}")
        sys.exit(1)


def start(project, notes=None):
    _require_known_project(project)
    # auto-close any stale open session for this project first
    open_rows = _request("GET", f"{TABLE}?project=eq.{project}&ended_at=is.null")
    if open_rows:
        now = datetime.now(timezone.utc).isoformat()
        _request("PATCH", f"{TABLE}?project=eq.{project}&ended_at=is.null",
                  {"ended_at": now, "notes": (notes or "") + " [auto-closed: new start]"})
        print(f"Note: auto-closed a stale open session for '{project}'.")

    body = {"project": project, "notes": notes}
    row = _request("POST", TABLE, body)
    print(f"Started '{project}' at {row[0]['started_at']}")


def stop(project, notes=None):
    _require_known_project(project)
    open_rows = _request("GET", f"{TABLE}?project=eq.{project}&ended_at=is.null&order=started_at.desc")
    if not open_rows:
        print(f"No open session found for '{project}'.")
        return
    now = datetime.now(timezone.utc).isoformat()
    patch = {"ended_at": now}
    if notes:
        existing = open_rows[0].get("notes") or ""
        patch["notes"] = (existing + " | " + notes).strip(" |")
    _request("PATCH", f"{TABLE}?project=eq.{project}&ended_at=is.null", patch)
    started = datetime.fromisoformat(open_rows[0]["started_at"].replace("Z", "+00:00"))
    ended = datetime.fromisoformat(now)
    mins = (ended - started).total_seconds() / 60
    print(f"Stopped '{project}' — session length: {mins:.0f} min")


def status():
    rows = _request("GET", f"{TABLE}?ended_at=is.null&order=started_at.desc")
    if not rows:
        print("No open sessions.")
        return
    print("Open sessions:")
    for r in rows:
        started = datetime.fromisoformat(r["started_at"].replace("Z", "+00:00"))
        elapsed = (datetime.now(timezone.utc) - started).total_seconds() / 60
        print(f"  {r['project']:<20} started {r['started_at']}  ({elapsed:.0f} min so far)")


def _parse_area(note):
    if note and ":" in note:
        return note.split(":", 1)[0].strip()
    return "(uncategorized)"


def report(project=None, days=None, with_git_baseline=False, area=None):
    url = f"{TABLE}?order=started_at.asc&ended_at=not.is.null"
    if project:
        url += f"&project=eq.{project}"
    rows = _request("GET", url)

    if days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        rows = [r for r in rows if datetime.fromisoformat(r["started_at"].replace("Z", "+00:00")) >= cutoff]

    if area:
        rows = [r for r in rows if _parse_area(r.get("notes")) == area]

    if not rows and not (with_git_baseline and project == "sparky"):
        print("No completed sessions found.")
        return

    totals = {}
    print(f"{'Date':<12}{'Project':<20}{'Start':<8}{'End':<8}{'Min':<8}{'Notes'}")
    print("-" * 80)
    for r in rows:
        s = datetime.fromisoformat(r["started_at"].replace("Z", "+00:00")).astimezone()
        e = datetime.fromisoformat(r["ended_at"].replace("Z", "+00:00")).astimezone()
        mins = (e - s).total_seconds() / 60
        totals[r["project"]] = totals.get(r["project"], 0) + mins
        print(f"{s.strftime('%Y-%m-%d'):<12}{r['project']:<20}{s.strftime('%H:%M'):<8}"
              f"{e.strftime('%H:%M'):<8}{mins:<8.0f}{(r.get('notes') or '')[:30]}")

    print("-" * 80)
    for proj, mins in totals.items():
        print(f"{proj:<32} total: {mins/60:.1f} hrs")
    total_hrs = sum(totals.values()) / 60
    print(f"\nGrand total: {total_hrs:.1f} hrs")

    if with_git_baseline and project == "sparky":
        baseline_sessions = 15
        baseline_minutes = 886
        baseline_hrs = baseline_minutes / 60
        combined_minutes = sum(totals.get(project, 0) for project in totals) + baseline_minutes
        combined_hrs = combined_minutes / 60
        print("\nGit baseline (historical, May 27–Jun 29 2026):")
        print(f"  sessions: {baseline_sessions}")
        print(f"  minutes: {baseline_minutes} ≈ {baseline_hrs:.1f} hrs")
        print("\nSupabase log (explicit, since logging began):")
        print(f"  {len(rows)} session(s)  {total_hrs:.1f} hrs")
        print(f"\nCombined total (git + explicit):")
        print(f"  minutes: {combined_minutes} ≈ {combined_hrs:.1f} hrs")


def list_projects():
    rows = _request("GET", f"{PROJECTS_TABLE}?active=eq.true&order=slug.asc")
    if not rows:
        print("No registered projects.")
        return
    print(f"{'Slug':<20}{'Name':<35}{'Supabase':<10}{'GitHub':<10}{'Vercel'}")
    print("-" * 80)
    for r in rows:
        print(f"{r['slug']:<20}{r['name']:<35}"
              f"{'yes' if r.get('supabase_ref') else '-':<10}"
              f"{'yes' if r.get('github_repo') else '-':<10}"
              f"{'yes' if r.get('vercel_project') else '-'}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    args = sys.argv[2:]

    if cmd == "start" and args:
        start(args[0], args[1] if len(args) > 1 else None)
    elif cmd == "stop" and args:
        stop(args[0], args[1] if len(args) > 1 else None)
    elif cmd == "status":
        status()
    elif cmd == "projects":
        list_projects()
    elif cmd == "report":
        project = None
        days = None
        with_git_baseline = False
        area = None
        flags = []
        positional = []
        for a in args:
            if a.startswith("--days="):
                days = int(a.split("=", 1)[1])
            elif a == "--days":
                idx = args.index(a)
                days = int(args[idx + 1])
            elif a.startswith("--area="):
                area = a.split("=", 1)[1]
            elif a == "--area":
                idx = args.index(a)
                area = args[idx + 1]
            elif a == "--with-git-baseline":
                with_git_baseline = True
            else:
                positional.append(a)
        if positional:
            project = positional[0]
        if area is None and "-a" in args:
            area = "exam-ui"
        report(project, days, with_git_baseline=with_git_baseline, area=area)
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
