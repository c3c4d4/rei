# REI Bot (Tomoyo Campus)

REI is the Discord bot that powers Tomoyo Campus project execution, public peer review, and internal point economy.

## System Model

- Every member starts with a 60-day blackhole countdown.
- Every member starts with 2 evaluation points.
- Each user can have only one active project (`open` or `delivered`) at a time.
- Reviews are public thread-based sessions, not anonymous or private.
- Claiming a review escrows 1 point from the evaluatee.
- Reviewer keeps the escrowed point whether the project is approved or rejected.
- If the reviewer misses the 24h deadline, the evaluatee is refunded, reviewer loses 1 point, and 1 point is burned.

## Commands

- Projects: `/project start`, `/project status`, `/project list`, `/project concluded`
- Delivery: `/delivery submit`
- Reviews: `/review open`, `/review claim`, `/review score`, `/review reviewer`, `/review status`, `/review log`
- Progression: `/profile status`, `/profile gift`, `/blackhole status`, `/blackhole freeze`, `/pool`
- Admin: `/rei config ...`, `/rei state`, `/rei kickstart`

## Admin Kickoff Checklist

1. Configure review thread channel: `/rei config review-channel`
2. Optionally configure announcements: `/rei config channel`
3. Configure member roles: `/rei config roles`
4. Start everyone at the same timestamp: `/rei kickstart confirm:true`
5. Post `introduction.md` in `#introduction` and attach `README_TEMPLATE.md`

## Local Operations

- Install deps: `npm install`
- Build: `npm run build`
- Deploy slash commands: `npm run deploy-commands`
- Run in dev: `npm run dev`
- Restart service: `systemctl restart rei-bot.service`
- Service status: `systemctl status rei-bot.service --no-pager`

## Intro Posting Helper

If you want REI to post the guide text to a channel:

- Set `GUIDE_CHANNEL_ID` in environment
- Run: `npx tsx scripts/post-guide.ts`

## Docs

- Server message copy: `introduction.md`
- Delivery README template: `README_TEMPLATE.md`
