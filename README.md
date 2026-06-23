# Typowanko ⚽

World Cup 2026 score prediction app for friends. This is a non-commercial,
no-real-money league used by a dozen or so friends, most of them on phones. Keep
the project as close to free to run as possible for as long as possible.

Built with React + Vite + Dexie (IndexedDB).

## Features

- **Leaderboard** — live point standings, rank changes, exact/1X2 hit counts and recent form
- **All 104 WC 2026 fixtures** pre-loaded (72 group stage + knockout)
- **Mobile-friendly match list** — next-24h typer zone, next-match preview, round/status filters and quick bet status
- **Player bets** — moderator enters exact-score bets per player per game
- **Self-service player betting** — Player IDs let friends add/edit only their own upcoming bets
- **Odds table** — fetch or enter decimal odds for exact scores (0:0 – 5:5) and 1X2 match outcomes
- **Lock results** — saves the final score, auto-calculates exact-score and 1X2 points
- **Automatic result refresh** — optional API-FOOTBALL integration can lock completed matches after kickoff
- **Local-first storage** — host data lives in IndexedDB and can be synced to Cloudflare D1
- **JSON backups** — host can download backups, viewers/players can download their local cache
- **Viewer mode** — friends can paste a Viewer ID to preview leaderboards, fixtures, bet history and scores
- **Player mode** — each player can paste their Player ID and add/edit only their own upcoming bets
- **Knockout team editing** — update team names as the tournament progresses
- **Fun stats** — player history, progress chart, streaks, recent scoring events, close misses, biggest misses, missed odds, most similar typers and contrarian picks

## Setup

```bash
npm install
npm run dev
```

## Cloud sync

The app stays hosted on GitHub Pages. Sync is handled by a small Cloudflare Worker backed by
D1. The host's existing IndexedDB data is never cleared by migration; the first cloud sync
downloads a JSON backup before uploading the snapshot.

### Cloudflare setup

1. Create a free Cloudflare D1 database:

```bash
npx wrangler d1 create typowanko-sync
```

2. Copy the returned database ID into `wrangler.toml`.

3. Apply the migration:

```bash
npm run sync:migrate
```

4. Add the API-FOOTBALL key for automatic result refresh:

```bash
npx wrangler secret put API_FOOTBALL_KEY
```

5. Deploy the Worker:

```bash
npm run sync:deploy
```

6. In GitHub repo variables, set `SYNC_API_BASE` to the deployed Worker URL, for example:

```text
https://typowanko-sync.<your-subdomain>.workers.dev
```

Local Worker testing:

```bash
npm run sync:migrate:local
npm run sync:dev
```

For local frontend testing against a Worker, create `.env.local`:

```text
VITE_SYNC_API_BASE=http://localhost:8787
```

## Deploy to GitHub Pages

Push to `main` — the GitHub Actions workflow in `.github/workflows/deploy.yml` will build and publish automatically.

> After deploying, go to **Settings → Pages** in your GitHub repo and set Source to **GitHub Actions**.

The workflow expects the GitHub repo variable `SYNC_API_BASE` to contain the
deployed Worker URL. It also maps the optional repository secret
`FOOTBALL_DATA_API_KEY` to `VITE_API_FOOTBALL_KEY` for browser-side API-FOOTBALL
calls. Vite env values are bundled into the frontend, so do not treat
`VITE_API_FOOTBALL_KEY` as private; prefer the Worker secret
`API_FOOTBALL_KEY` for cloud automatic result refresh, and use the browser
Settings override only when exposing that key is acceptable.

## Cloudflare

Point a Cloudflare DNS CNAME to `<your-username>.github.io`. Set SSL/TLS to **Full** and enable the **Always Use HTTPS** rule.

## Data persistence

Host bets, odds, scores and player data are stored in IndexedDB in the browser. Deploying a new
version of the app does not clear existing data — Dexie handles schema migrations automatically.

When cloud sync is enabled:

- Host mode writes locally first, then uploads a full snapshot to D1.
- Viewer and Player modes import snapshots into a separate IndexedDB database named `typowanko-view-<leagueId>`.
- Viewer/Player imports never overwrite the host's `typowanko` IndexedDB database.
- The Host ID can update the cloud snapshot; the Viewer ID can only read it.
- Player IDs can read the league and submit only that player's own bets for upcoming fixtures.
- Player bet writes go through the Worker and use conditional D1 revisions, so they do not push full browser snapshots.

## Operational guardrails for future agents

The project goal is to stay free to run. It is a small, non-commercial friends
league, not a paid betting product. Most users are on phones, so keep core flows
fast, readable and usable on mobile. Keep changes compatible with the Cloudflare
Workers Free and D1 Free limits unless the maintainer explicitly chooses a paid
plan.

- Automatic result refresh is client-triggered, not cron-triggered. When a host/viewer/player has the app open, the frontend checks once per minute but debounces Worker refresh requests to at most once every 3 minutes.
- The Worker only calls api-football.com for unlocked matches whose kickoff was at least two hours ago.
- To avoid multiple api-football.com calls when several players open the app at the same time, the Worker also writes `autoResultsLastCheckedAt` with a conditional D1 revision update and enforces the same 3-minute league-level throttle. Only the request that successfully claims that revision is allowed to call api-football.com; concurrent requests return the latest snapshot without hitting api-football.com.
- Do not move api-football.com result polling directly into viewer/player browsers for cloud leagues. That would multiply API calls by the number of open clients and expose or require API keys client-side.
- API-FOOTBALL/api-sports.io has a project limit of 7,500 requests/day. Treat that as the primary external API budget for both result and odds features; future automation must batch, throttle, cache, or skip work to stay well below this limit.
- Bet locking is enforced in both places: the frontend hides/blocks editing immediately after kickoff, and the Worker rejects Player ID bet writes after kickoff or once the fixture is locked.
- Current free-tier assumptions to re-check before major changes:
  - Cloudflare Workers Free: 100,000 requests/day, 10 ms CPU/request, 50 subrequests/request.
  - Cloudflare D1 Free: 5 million rows read/day, 100,000 rows written/day, 5 GB total storage.
  - D1 Free daily read/write limits reset at 00:00 UTC; if the limits are exceeded, D1 returns errors rather than continuing normally.
- This app should remain comfortably below those limits for a small friends league. Avoid high-frequency polling, per-player result polling, large full-table scans, or schema changes that write many rows per sync.
- Official references used for these limits: Cloudflare Workers limits (`https://developers.cloudflare.com/workers/platform/limits/`) and Cloudflare D1 pricing/limits (`https://developers.cloudflare.com/d1/platform/pricing/`).

## Scoring

- Exact score: if a player guesses the correct exact score and the exact-score odd for that result is set, they receive `odds` points (e.g. odds 5.75 → 5.75 pts).
- 1X2 outcome: if the exact score is wrong but the player picked the correct winner/draw and 1X2 odds are set for the match, they receive the matching 1X2 odd.
- If the required odd is missing, the bet receives 0 points.
- Leaderboard ties are sorted by total points, exact hits, 1X2 hits, then player name.
