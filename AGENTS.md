# AGENTS.md

## Purpose
This file gives coding agents enough context to operate REI without repeated prompts.
Use it as the default runbook for architecture, deployment, and production checks.

## Product Model
- REI is a Discord bot for project execution, peer review, and progression tracking.
- Every member has a blackhole countdown and can extend it by completing approved work.
- Members can be active or observer, can use freeze days, and can be auto-banned when countdown expires.
- Reviews are thread-based and tied to project contracts.

## Architecture Map

### Runtime Entry Points
- `src/index.ts`: registers commands/events and logs into Discord.
- `src/events/ready.ts`: applies migrations, starts scheduler, runs onboarding sync.
- `src/events/interaction-create.ts`: routes slash commands and centralizes error replies.
- `src/events/guild-create.ts`: ensures guild exists in DB, reschedules monitors, onboarding sync.
- `src/events/guild-member-add.ts`: onboarding for each new member.
- `src/deploy-commands.ts`: out-of-band slash command registration.

### Command Surface
- `src/commands/project.ts`: project start/status/list/concluded.
- `src/commands/delivery.ts`: delivery submission.
- `src/commands/review.ts`: open/claim/score/reviewer/status/log review flow.
- `src/commands/blackhole.ts`: blackhole status and freeze.
- `src/commands/profile.ts`: profile status and gifting points.
- `src/commands/pool.ts`: evaluation pool stats.
- `src/commands/admin.ts` (`/rei ...`): config, member state, kickstart.

### Core Services
- `src/services/onboarding.service.ts`: guild/member onboarding and role sync.
- `src/services/member.service.ts`: create/read members and bootstrap wallet/freeze state.
- `src/services/blackhole.service.ts`: timeline, freeze, award days, expiry enforcement.
- `src/services/project-contract.service.ts`: contract lifecycle and overdue failure settlement.
- `src/services/review-thread.service.ts`: review thread state machine and deadline settlement.
- `src/services/wallet.service.ts`: points balances and ledger entries.
- `src/services/profile.service.ts`: profile snapshot and XP computation.
- `src/services/daily-status-digest.service.ts`: daily midday status report to announcements channel.
- `src/services/event-log.service.ts`: writes operational events to `events_log`.
- `src/services/kickstart.service.ts`: destructive guild reset + reseed.

### Data Domains
Defined in `src/db/schema.ts`:
- Guild config and cadence: `guilds`, `cycles`.
- Member progression: `members`, `member_state_history`.
- Economy: `wallets`, `wallet_ledger`.
- Work/review lifecycle: `project_contracts`, `review_threads`, `projects`, `deliveries`, `review_assignments`, `reviews`.
- Ops/event records: `discord_scheduled_events`, `events_log`.

## Scheduler and Automation
- `src/scheduler/index.ts` runs a per-guild monitor tick immediately and then every 60 minutes.
- Each tick runs in parallel:
  - `blackholeService.settleExpiredMembers`
  - `projectContractService.settleExpiredContracts`
  - `reviewThreadService.settleExpiredReviewDeadlines`
  - `dailyStatusDigestService.maybeSendDailyDigest`

### Daily Midday Status Digest
- Logic: `src/services/daily-status-digest.service.ts`.
- Destination: configured `guilds.announcementChannelId`.
- Time gate: only after local hour >= 12 (`guilds.timezone`, default `America/Sao_Paulo`).
- Actual send time: first scheduler tick after noon (not guaranteed exactly at 12:00:00).
- Sorting: members are sorted from fewer days left to more days left.
- Paging: auto-chunks into multiple embed pages when text is too large.
- Dedupe: uses `events_log` with `event_type='report_generated'` and payload kind `daily_blackhole_status`.

## Deployment and Operations

### Local/Build Commands
- Install: `npm install`
- Build: `npm run build`
- Start compiled bot: `npm run start`
- Dev mode: `npm run dev`
- Migrations: `npm run db:migrate`
- Deploy slash commands: `npm run deploy-commands`

### Production Service
Systemd service name: `rei-bot.service`
- Restart: `systemctl restart rei-bot.service`
- Status: `systemctl status rei-bot.service --no-pager -l`
- Logs: `journalctl -u rei-bot.service -n 200 --no-pager`

Unit currently runs:
- `ExecStart=/usr/bin/node /root/rei/dist/index.js`
- `WorkingDirectory=/root/rei`
- `EnvironmentFile=/root/rei/.env`

### Environment
Primary vars (see `README.md` and `.env.example`):
- Required: `BOT_TOKEN`, `CLIENT_ID`
- Optional: `DEV_GUILD_ID`, `DATABASE_PATH`, `LOG_LEVEL`

## Operational Runbook

### After Any Code Change
1. `npm run build`
2. `systemctl restart rei-bot.service`
3. `systemctl status rei-bot.service --no-pager -l`
4. `journalctl -u rei-bot.service -n 50 --no-pager`

### Verify Single Bot Process
Avoid duplicate instances (manual + systemd).
- Check: `pgrep -af "node.*(dist/index.js|tsx.*src/index.ts)"`
- Expected in prod: one `/usr/bin/node /root/rei/dist/index.js` process.

### Check Next Daily Digest Time
- Get São Paulo current time: `TZ=America/Sao_Paulo date`
- Digest will send on the first hourly monitor tick after 12:00 local time.
- If it does not send:
  - Ensure `/rei config channel` is set (`guilds.announcement_channel_id` not null).
  - Check `guilds.timezone` is valid.
  - Check service logs for digest errors.
  - Check `events_log` dedupe record for same local date.

### Onboarding/Role Troubleshooting
- New member timers start when member row is created in DB (`memberService.getOrCreateMember`).
- Role assignment failures are logged but do not block member creation.
- If someone joined while bot was offline, onboarding may occur later during sync.

## Agent Working Rules for This Repo
- Prefer service-level fixes over command-level duplication.
- Keep business logic in `src/services/*`; commands should orchestrate and respond.
- Preserve DB schema compatibility; add migrations for schema changes.
- Do not edit `dist/` manually. Build from `src/`.
- When investigating production behavior, trust `journalctl` and DB state over assumptions.
