# M5.1 — Shared pregame scheduler

## Architecture and real activation state

OddsPapi → protected bounded worker → Neon snapshots/current/history → short hard-expiring read cache → every visitor. No provider call is reachable from normal navigation or `/api/odds`.

Implementation is scheduler-ready, **not continuously running**. `ODDS_AUTOMATION_ENABLED=false`; automatic GET returns 503 without a provider call. Authenticated POST executes the exact same due-selection/budget/recovery pipeline and is labeled CONTROLLED. Preview refresh is denied. Health reads cannot start a worker.

An approved external scheduler should tick every five minutes. The policy decides whether a paid request is due. Each invocation has at most four total provider calls, one retry per feed, 30-second request timeouts, a 140-second upstream start deadline, a 180-second function bound and a three-minute renewable lease. It never runs an infinite loop or detached job. Account reconciliation counts against the run cap, but is documented as unmetered.

## Durable behavior

1. Acquire the existing advisory worker lock and unique RUNNING lease. A second job receives conflict before contacting OddsPapi. Expired leases are recorded as INTERRUPTED and safely reclaimed; old workers cannot write without a live lease.
2. Validate the DB-resident audited catalogue. Replay at most three unapplied snapshots before considering fresh requests. Large recovery backlogs stop for the existing bounded resume command.
3. Discover targets from existing canonical DB fixtures, only for the four audited M5 tournaments. Exclude terminal fixtures and every kickoff at or before now. No Sportmonks discovery/ingestion is performed.
4. Select due bookmaker/tournament targets and batch tournament IDs into one request per book. Recheck eligibility immediately before each batch.
5. Reconcile the account window if necessary, then atomically reserve each billable attempt under the budget lock, before network IO.
6. Save complete normalized snapshots before applying them. Commit quote changes and target success timestamps together; preserve original observations on failure. Successful withdrawals close only that response's book/tournament scope. Old snapshots cannot override newer prices.
7. Persist bounded exponential target backoff (15–360 minutes). One failed feed does not prevent the other feed from succeeding. Job states are READY, RUNNING, SUCCEEDED, PARTIAL, FAILED, BUDGET_STOPPED; legacy INTERRUPTED jobs remain auditable.

No manual or automatic invocation can extend the independent 15-minute quote expiry. At the earlier provider/canonical kickoff, prices and actions close even if a fixture's stored status has not yet caught up. Meaningful history is price/status changes only, not every read or replay.

## Health

Authenticated health reports last DB discovery, refresh, automatic invocation/refresh separately, next policy due time, next expected run only when scheduling is enabled, fixture count, last successful feeds, per-target failures/backoff, lease, safe error codes and billing counters. It includes no provider account identifiers, API credentials or affiliate destinations. A no-work tick preserves previous refresh evidence. Configured automation is healthy only with a recent observed automatic invocation; configuration alone is not operational proof.

## Operator commands

Use ignored server environment files on an authorized host. Never paste values into shell commands or reports.

```sh
pnpm m5.1:plan      # DB-only dry run
pnpm m5.1:audit     # integrity/accounting, zero provider calls
pnpm m5.1:replay    # saved snapshots, duplicate-lease and idempotency proof
pnpm m5.1:run       # deliberate bounded CONTROLLED due refresh; consumes quota
pnpm m5:resume     # recover unapplied saved responses, no new upstream fetch
```

The protected HTTP QA helper accepts only localhost:3300 or livasports.com. `--invoke` is an explicit bounded refresh, not a scheduler. Do not run it as ordinary navigation QA.
