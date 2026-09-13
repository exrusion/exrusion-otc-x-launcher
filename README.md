# OTC X Launcher

An isolated X-triggered launcher for OTC-supported pairs. The frontend, Railway backend, PostgreSQL database, browser profile, ports, PID files, logs, and macOS service are independent of every existing agent.

## Fixed isolation boundaries

- Chrome profile: `/Users/adam/otc-x-launcher/chrome-profile`
- Chrome debugging port: `9337`
- Local listener health port: `8799`
- PID/log directory: `/Users/adam/otc-x-launcher/runtime`
- macOS label: `com.otcx.launcher-agent`

`scripts/restart-agent.sh` only stops PIDs whose command line contains this project or this Chrome profile. It never uses `pkill`, never closes the default Chrome profile, and never addresses another agent.

## Launch modes

`LAUNCH_MODE=test` exercises detection, validation, database state, retries, the website feed, and the single-reply queue without broadcasting a Solana transaction. `LAUNCH_MODE=live` is intentionally blocked until an official OTC integration credential and signing arrangement are configured.

The verified OTC behavior and integration boundary are recorded in
[`docs/OTC_INTEGRATION_SPEC.md`](docs/OTC_INTEGRATION_SPEC.md).

## Services

- Website: Next.js/Vinext frontend with Launches, Supported Pairs, Activity, and
  How to Post routes.
- API: Node service with PostgreSQL-backed idempotency, processing state,
  retries, heartbeat recovery, and exactly-once reply claiming.
- Listener: Playwright CDP process connected only to the isolated Chrome profile
  on port `9337`.
- Database: private Railway PostgreSQL with a dedicated persistent volume.

## Test-mode verification

```bash
npm test --prefix backend
node --check agent/src/listener.mjs
npm run build
```

A true X end-to-end test additionally requires the dedicated agent X account to
be signed into the isolated Chrome profile. Post a new message that tags the
configured handle and includes exactly one image plus these fields:

```text
launch
Name: Example Token
Ticker: EXAMPLE
Pair: AAPLx
```

The listener discovers the mention itself; no post URL is supplied to the API.
