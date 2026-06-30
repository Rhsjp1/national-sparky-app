# Developer Time Tracking — Hermes + Supabase + Git

This repo uses two complementary sources of truth for developer time:

1. **Explicit sessions** via `timelog.py` → Supabase `dev_time_log`.
2. **Implicit historical baseline** from Git commit timestamps.

Together they give a realistic view of time invested in projects like National Sparky, Hermes, and Logistics Health.

## Explicit Time: `timelog.py` + Supabase

For current and future work, time is logged explicitly:

- `python3 timelog.py projects` — list registered infra projects.
- `python3 timelog.py start <slug> "short note"` — start a session.
- `python3 timelog.py stop <slug> "optional note"` — stop the session.
- `python3 timelog.py status` — show open sessions.
- `python3 timelog.py report <slug> [--days N] [--with-git-baseline]` — summarize recent time.

Notes are optional but recommended. Use the standard note format:
`<feature-area>: <short description>`

Examples: `"exam-ui: NC exam calculator wiring"`, `"nc-rules: license class mapping"`, `"infra: Supabase auth cleanup"`.

Common areas: `exam-ui`, `nc-rules`, `infra`, `docs`, `billing`, `auth`, `deploy`.

This makes later filtering trivial and keeps reports readable.

Sessions auto-close any stale open row for the same slug so you don’t end up with overlapping open sessions.

## Historical Baseline: Git Commit Clustering

Before `timelog.py` existed, time on National Sparky was reconstructed from Git commit history:

- Commits for `Rhsjp1/national-sparky-app` were clustered into sessions:
  - A gap **> 75 minutes** starts a new session.
  - Each session gets **+20 minutes** pre-commit buffer and **+10 minutes** wrap-up buffer.
- Large diff sizes (e.g., `node_modules` installs) do **not** increase time; only timestamps and gaps matter.

This approach produced:

- **15 distinct sessions** and **~886 minutes ≈ 14.8 hours** of Sparky work between May 27 and June 29, based purely on git activity.
- It’s a **floor**, not a ceiling: browser/Vercel/Supabase console work not captured by git is omitted.

Going forward, `timelog.py` is the primary source of truth; git analysis is a one-time historical baseline.

## Combined View: Git Baseline + Supabase Forward Log

For Sparky specifically, reports can include:

- Historical git-based baseline for the fixed window (May 27–Jun 29).
- Explicit Supabase-logged hours for later dates.

That makes it clear how much time was spent before the logging system existed, versus after.

## Project Registry

Only projects with real infrastructure are accepted:

- Must have a live Supabase, GitHub, and/or Vercel footprint.
- Registered slugs come from the `dev_projects` Supabase table.
- Anything not registered is rejected by `timelog.py` to prevent silent data leakage into wrong tables.

Known projects: `sparky`, `hermes`, `logistics-health`.

## Recommended Usage

- Start `timelog.py` when beginning focused work on a registered project.
- Stop when wrapping that block, adding a short note if helpful.
- Use git-based reconstruction only for past periods before `timelog.py` was in place, or to spot-check session clustering assumptions.

## Example Workflow

```bash
python3 timelog.py start sparky "exam-ui: NC exam calculator wiring"
# ... later ...
python3 timelog.py stop sparky
python3 timelog.py start hermes "infra: B2B scheduler skill"
# end of day
python3 timelog.py report sparky --with-git-baseline
```

## Optional Shortcut

If you call `timelog.py` frequently, add this alias:

```bash
alias timelog='python3 /home/righthandservicesbyjp/national-sparky-app/timelog.py'
```

Then run: `timelog start sparky "note"` / `timelog report sparky --with-git-baseline`

Add the alias to your shell rc to keep it between sessions.

This keeps current numbers precise without losing the reality of earlier, unlogged work.
