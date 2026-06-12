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

4. Deploy the Worker:

```bash
npm run sync:deploy
```

5. In GitHub repo variables, set `SYNC_API_BASE` to the deployed Worker URL, for example:

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

## Scoring

If a player guesses the correct exact score and the odds for that score are set, they receive `odds` points (e.g. odds 5.75 → 5.75 pts). No partial credit.
