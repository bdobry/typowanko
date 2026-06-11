# Typowanko ⚽

World Cup 2026 betting app for friends. Built with React + Vite + Dexie (IndexedDB).

## Features

- **Leaderboard** — live point standings for all players
- **All 104 WC 2026 fixtures** pre-loaded (72 group stage + knockout)
- **Player bets** — moderator enters exact-score bets per player per game
- **Odds table** — enter decimal odds for each score (0:0 – 5:5) per game
- **Lock results** — saves the final score, auto-calculates points
- **Local storage** — all data lives in your browser's IndexedDB; nothing sent to any server
- **Knockout team editing** — update team names as the tournament progresses

## Setup

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

Push to `main` — the GitHub Actions workflow in `.github/workflows/deploy.yml` will build and publish automatically.

> After deploying, go to **Settings → Pages** in your GitHub repo and set Source to **GitHub Actions**.

## Cloudflare

Point a Cloudflare DNS CNAME to `<your-username>.github.io`. Set SSL/TLS to **Full** and enable the **Always Use HTTPS** rule.

## Data persistence

All bets, odds, scores and player data are stored in IndexedDB in the browser. Deploying a new version of the app does not clear existing data — Dexie handles schema migrations automatically.

## Scoring

If a player guesses the correct exact score and the odds for that score are set, they receive `odds` points (e.g. odds 5.75 → 5.75 pts). No partial credit.
