# Typowanko ⚽

World Cup 2026 betting app for friends. Built with React + Vite + Dexie (IndexedDB).

## Features

- **Leaderboard** — live point standings for all players
- **All 104 WC 2026 fixtures** pre-loaded (72 group stage + knockout)
- **Player bets** — moderator enters exact-score bets per player per game
- **Odds table** — enter decimal odds for each score (0:0 – 5:5) per game
- **Lock results** — saves the final score, auto-calculates points
- **Local-first storage** — host data lives in IndexedDB and can be synced to Cloudflare D1
- **Viewer mode** — friends can paste a Viewer ID to preview leaderboards, fixtures, bet history and scores
- **Player mode** — each player can paste their Player ID and add/edit only their own upcoming bets
- **Knockout team editing** — update team names as the tournament progresses

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

The project goal is to stay free to run. Keep changes compatible with the Cloudflare Workers Free
and D1 Free limits unless the maintainer explicitly chooses a paid plan.

- Automatic result refresh is client-triggered, not cron-triggered. When a host/viewer/player has the app open, the frontend asks the Worker at most once per minute to refresh completed results.
- The Worker only calls api-football.com for unlocked matches whose kickoff was at least two hours ago.
- To avoid multiple api-football.com calls when several players open the app at the same time, the Worker first writes `autoResultsLastCheckedAt` with a conditional D1 revision update. Only the request that successfully claims that revision is allowed to call api-football.com; concurrent requests return the latest snapshot without hitting api-football.com.
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

If a player guesses the correct exact score and the odds for that score are set, they receive `odds` points (e.g. odds 5.75 → 5.75 pts). No partial credit.
