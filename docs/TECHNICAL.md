# TIFO — Technical Documentation

## Overview

TIFO is a single Node.js service (Express + TypeScript, ESM, run with `tsx`) serving a Vite/React SPA. It consumes TxLINE REST + SSE, reduces the raw feed into a rich `MatchState`, and fans it out to browsers over its own SSE endpoint. A Replay Director re-runs recorded TxLINE timelines through the identical pipeline.

```
                    ┌─────────────────────────── server ───────────────────────────┐
TxLINE REST ───────►│ TxLineClient ──► LiveRoom ──┐                                │
TxLINE SSE  ───────►│  (auth, retry,              ├──► engine.ts ──► MatchState    │──► SSE ──► React app
                    │   reconnect)                │    (pure reducer)  + Moments   │
data/*.json ───────►│ ReplayRoom (Replay Director)┘                                │
                    └──────────────────────────────────────────────────────────────┘
```

## TxLINE endpoints used

All endpoints are consumed by [server/txline.ts](../server/txline.ts) (data plane) and [scripts/activate.ts](../scripts/activate.ts) (auth plane).

### Auth / activation
| Endpoint | Use |
|---|---|
| `POST {origin}/auth/guest/start` | obtain the 30-day guest JWT (auto-renewed on 401) |
| `POST {origin}/api/token/activate` | exchange `{txSig, walletSignature, leagues}` for the long-lived API token after the on-chain `subscribe` |
| txoracle Solana program `subscribe(serviceLevelId, weeks)` | on-chain subscription — mainnet `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`, devnet `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` (official IDLs bundled in [scripts/idl](../scripts/idl)) |

### Data plane (headers: `Authorization: Bearer <jwt>` + `X-Api-Token: <token>`)
| Endpoint | Use in TIFO |
|---|---|
| `GET /api/fixtures/snapshot?competitionId=72&startEpochDay=…` | lobby fixture list (refreshed every 2 min) |
| `GET /api/scores/snapshot/{fixtureId}` | room hydration on first viewer |
| `GET /api/scores/updates/{fixtureId}` | backfill of score history when joining mid-match |
| `GET /api/scores/stream?fixtureId=…` (SSE) | the heartbeat of the app — every action, clock tick, possession danger state, possible-event radar |
| `GET /api/scores/historical/{fixtureId}` | `npm run record` — full timelines for the Replay Director |
| `GET /api/odds/snapshot/{fixtureId}?asOf=…` | odds hydration + historical odds sampling for recordings |
| `GET /api/odds/updates/{fixtureId}` | odds backfill |
| `GET /api/odds/stream?fixtureId=…` (SSE) | live demargined probabilities → win-probability river, market-swing detection, commentary |
| `GET /health` | status probe |

### Fields the experience is built from
- `gameState`, `clock`, `action` — phases, clocks, whistles
- `scoreSoccer.Participant{1,2}.Total.{Goals,YellowCards,RedCards,Corners}` — authoritative score diffing (incl. shootout pens during `PE` and VAR chalk-offs when totals decrease)
- `dataSoccer` (`Action`, `Outcome`, `FreeKickType`, `Type`, `Penalty`, `VAR`…) — shots, woodwork, penalties, VAR lifecycle, subs
- `possession` + `possessionType` (`Safe/Attack/Danger/HighDanger Possession`) — momentum EMA + crowd audio intensity
- `parti{1,2}StateSoccer.PossibleEvent` + `possibleEventSoccer` — the "radar" chips shown *before* events are confirmed
- odds `Pct[]` (demargined) + `PriceNames[]`, `MarketPeriod`, `SuperOddsType` — 3-way full-time market → probability river, favourite lines in commentary, big-swing moments

## The engine (server/engine.ts)

A **pure, deterministic reducer**: `applyScore(state, update)` / `applyOdds(state, update)` return `Moment[]` and mutate a `MatchState`. Properties:

- **Replayable** — seek in a replay = re-fold the timeline prefix from scratch; identical inputs produce identical states, so live and replay are the same code path.
- Momentum is an EMA over possession danger levels; goals/corners/shots kick it directly.
- Score changes are diffed from `Total` (never inferred from actions), making the engine robust to out-of-order or missing action records; goal-total *decreases* are surfaced as VAR chalk-offs.
- A seeded pundit ([server/pundit.ts](../server/pundit.ts)) renders each moment as broadcast commentary and quotes the current demargined market.

## Rooms & transport (server/rooms.ts, server/index.ts)

- `LiveRoom`: hydrates from snapshot+updates (dedup by `seq`/`MessageId`), then holds both TxLINE SSE streams with exponential-backoff reconnect and `Last-Event-ID` resume.
- `ReplayRoom`: schedules the merged score+odds timeline against wall-clock with speed 1–64×, capping dead time at 20s ("gap skip"), and supports `play/pause/seek/speed/restart`.
- Browser transport: `GET /api/match/:id/stream` emits `event: state` (full state) + `event: moment` (per new moment) with 25s pings. Rooms are reaped after 10 idle minutes.

## Frontend (web/)

React 18 + Vite 6, custom CSS (no UI framework). Notable pieces:

- **Crowd engine** ([web/src/lib/audio.ts](../web/src/lib/audio.ts)) — fully procedural Web Audio graph: looped pink-noise bed (band-pass + LFO undulation) whose gain/brightness track danger; synthesized roars (filtered noise sweeps + drum hits), groans, gasps, warbling referee whistles, and low sawtooth chant bursts when the mood is high. No audio assets are shipped.
- **Radio** ([web/src/lib/radio.ts](../web/src/lib/radio.ts)) — Web Speech API with a priority queue; goals cancel and jump the queue.
- **Haptics** ([web/src/lib/haptics.ts](../web/src/lib/haptics.ts)) — per-event `navigator.vibrate` signatures.
- **Pressure map / probability river** — hand-rolled canvas renderers at 60fps with eased values, DPR-aware.
- **Takeovers** — full-screen GOAL/VAR/RED/PEN/FT overlays with screen shake and confetti.
- **CALL IT** — client-side streak game settled purely by stream moments (localStorage, no accounts, no stakes).
- **Recap card** — canvas-rendered 960×1200 PNG poster (score, probability river, story beats) generated at full-time.

## Sample reels vs real data

`npm run samples` generates three scripted matches **in the exact TxLINE wire schema** (same types the client parses off the real feed), deterministic via a seeded PRNG, clearly labeled `synthetic: true` and shown as `SAMPLE REEL` in the UI. They exist because judging happens after fixtures end. `npm run record -- <fixtureId>` captures real matches from `/api/scores/historical` + odds snapshots into the same format.

## Deployment

Single process, no database:

```bash
npm install && npm run samples && npm run build && npm start   # PORT env respected
```

Works on Render/Railway/Fly (needs long-lived responses for SSE; avoid serverless platforms that buffer or cap streaming). Set `TXLINE_*` env vars (or run `npm run activate`) to enable live mode.

## Environment

See [.env.example](../.env.example): `TXLINE_NETWORK`, `TXLINE_API_TOKEN`, `TXLINE_JWT` (optional), `TXLINE_ORIGIN`/`TXLINE_COMPETITION_ID`/`PORT`/`SOLANA_RPC` (optional).
