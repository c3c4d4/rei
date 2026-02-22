# REI Bot (Tomoyo Campus)

REI is a Discord bot for Tomoyo Campus project execution, public peer review, and progression tracking.

## Core Model

- Every member starts with a 60-day blackhole countdown.
- Every member starts with 2 evaluation points.
- Each user can have only one active project (`open` or `delivered`) at a time.
- Reviews are public, thread-based, and non-anonymous.
- Claiming a review escrows 1 point from the evaluatee.
- Reviewer keeps the escrowed point whether the project is approved or rejected.
- If the reviewer misses the 24h deadline, the evaluatee is refunded, reviewer loses 1 point, and 1 point is burned.

## Command Groups

- Projects: `/project start`, `/project status`, `/project list`, `/project concluded`
- Delivery: `/delivery submit`
- Reviews: `/review open`, `/review claim`, `/review score`, `/review reviewer`, `/review status`, `/review log`
- Progression: `/profile status`, `/profile gift`, `/blackhole status`, `/blackhole freeze`, `/pool`
- Admin: `/rei config ...`, `/rei state`, `/rei kickstart`

## Prerequisites

- Node.js 20+
- A Discord application with a bot token and application ID
- Permissions to add the bot to your Discord server

## Quick Start

1. Install dependencies: `npm install`
2. Copy env template: `cp .env.example .env`
3. Fill required values in `.env` (see table below)
4. Ensure local DB folder exists: `mkdir -p data`
5. Run migrations: `npm run db:migrate`
6. Register slash commands: `npm run deploy-commands`
7. Start in development: `npm run dev`

For production:

- Build: `npm run build`
- Start compiled bot: `npm run start`

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `BOT_TOKEN` | Yes | - | Discord bot token |
| `CLIENT_ID` | Yes | - | Discord application client ID |
| `DEV_GUILD_ID` | No | - | If set, commands are registered to one guild (faster iteration) |
| `DATABASE_PATH` | No | `./data/rei.db` | Local SQLite/libSQL file path |
| `LOG_LEVEL` | No | `info` | One of `debug`, `info`, `warn`, `error` |

## Admin Kickoff Checklist

1. Configure review thread channel: `/rei config review-channel`
2. Optionally configure announcements: `/rei config channel`
3. Configure member roles: `/rei config roles`
4. Start everyone at the same timestamp: `/rei kickstart confirm:true`
5. Post `introduction.md` in `#introduction` and attach `README_TEMPLATE.md`

## Local Operations

- Install deps: `npm install`
- Build: `npm run build`
- Run migrations: `npm run db:migrate`
- Deploy slash commands: `npm run deploy-commands`
- Run in dev: `npm run dev`
- Restart service: `systemctl restart rei-bot.service`
- Service status: `systemctl status rei-bot.service --no-pager`

## Security Notes (Public Repo)

- Never commit `.env` or private keys/certs.
- Local DB files (`data/*.db*`, `*.sqlite*`) are intentionally gitignored.
- If any token was exposed at any point, rotate it in Discord Developer Portal.

## Intro Posting Helper

If you want REI to post the guide text to a channel:

- Set `GUIDE_CHANNEL_ID` in environment
- Run: `npx tsx scripts/post-guide.ts`

## Docs

- Server message copy: `introduction.md`
- Delivery README template: `README_TEMPLATE.md`
