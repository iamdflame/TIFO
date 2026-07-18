# TIFO — the match you can feel

**A broadcast-grade second screen for the FIFA World Cup 2026, built entirely on TxODDS TxLINE real-time data.**

Most live-score apps tell you *what happened*. TIFO makes you **feel it happening** — a synthesized stadium crowd that swells with TxLINE's danger states, radio commentary spoken the second an event lands, win-probability rivers drawn from demargined market data, haptic goals that buzz in your hand, and cinematic full-screen takeovers for the moments that matter.

> Submission for the TxODDS World Cup Hackathon — *Consumer and Fan Experiences* track.

---

## What makes TIFO different

| Sense | How | Powered by |
|---|---|---|
| 👂 **Hear it** | Procedural crowd audio synthesized in the browser (Web Audio — zero samples). The crowd hums, swells on `HighDangerPossession`, roars on goals, groans at missed penalties, gasps during VAR checks. Referee whistles mark kickoff/HT/FT. | TxLINE possession danger states + score actions |
| 📻 **Radio** | A generated radio commentator speaks every big moment, weaving live market numbers into the call: *"The market now makes France 61% favourites."* | TxLINE scores stream + demargined odds |
| 📳 **Feel it** | Haptic signatures per event — goals, reds, penalties each have their own vibration pattern (mobile). | TxLINE scores stream |
| 👀 **See it** | Animated pressure map, win-probability river with event markers, possible-event radar (*"⚡ GOAL THREAT — FRA"* before the goal is even confirmed), full-screen GOAL/VAR/RED takeovers with screen shake and confetti. | TxLINE `possibleEvent` radar + odds + scores |
| 🎮 **Play it** | *CALL IT* — a no-stakes streak game settled live by the feed itself: call the next goal before it happens. | TxLINE scores stream |
| 🔁 **Relive it** | The **Replay Director** re-runs any finished match through the exact same engine at 1×–64× with seek — because the best World Cup moments deserve a second life. Full-time generates a shareable **recap card** PNG. | recorded TxLINE streams |

Everything above runs off **one deterministic reducer**: live SSE data and replays flow through the same engine, so what judges see in replay is byte-for-byte what fans get live.

## Quickstart (zero credentials — 60 seconds)

```bash
npm install
npm run samples   # generate the bundled demo reels
npm run build     # build the web app
npm start         # → http://localhost:8090
```

Open the URL, pick a reel, press **Play**, and turn on **Crowd + Radio**.

> The three bundled reels (*The Comeback*, *The Shootout*, *The Upset*) are **synthetic data in the exact TxLINE wire schema**, clearly labeled `SAMPLE REEL` in the UI. They exist so the experience is instantly judgeable after matches have ended. Live matches and recordings use the real TxLINE feed.

## Going live (real TxLINE data via Solana)

TxLINE access is activated **on-chain**. TIFO ships the whole flow as one script:

```bash
npm run activate -- --network mainnet --level 12 --weeks 4
```

The script: generates/loads a Solana keypair → creates the TxL token account → calls the txoracle program's `subscribe` instruction → obtains a guest JWT → signs `txSig::jwt` with the wallet (ed25519) → activates via `POST /api/token/activate` → writes credentials to `.env`. Restart the server and live World Cup fixtures (competition 72) appear in the lobby with real-time SSE streams.

Record any finished match (started 6h–2wk ago) for the Replay Director:

```bash
npm run record -- --list          # list World Cup fixtures
npm run record -- <fixtureId>     # save to data/recordings/
```

## Development

```bash
npm run dev    # server on :8090 + Vite HMR on :5173
```

## Architecture

```
TxLINE (SSE + REST) ──► TxLineClient ──► LiveRoom  ─┐
                                                     ├─► engine.ts (pure reducer) ─► MatchState + Moments
data/*.json (recorded) ─► ReplayRoom (director) ────┘            │
                                                                 ▼
                                              Express SSE fan-out ─► React app
                                              (crowd audio · radio TTS · haptics ·
                                               canvas pitch/river · takeovers · recap)
```

- [server/engine.ts](server/engine.ts) — deterministic reducer: TxLINE updates → match state, momentum, danger, moments
- [server/rooms.ts](server/rooms.ts) — live rooms (SSE w/ auto-reconnect + Last-Event-ID) & the Replay Director (seek = re-fold the timeline)
- [server/pundit.ts](server/pundit.ts) — seeded commentary generator that quotes the live market
- [web/src/lib/audio.ts](web/src/lib/audio.ts) — the procedural crowd engine
- [docs/TECHNICAL.md](docs/TECHNICAL.md) — full technical documentation + **TxLINE endpoints used**
- [docs/FEEDBACK.md](docs/FEEDBACK.md) — feedback on the TxLINE API

## Monetization path

Freemium second screen: free tier rides the 60s-delayed feed; **TIFO Prime** (real-time level-12 feed, paid in TxL/USDC on Solana) unlocks zero-delay senses, watch-party rooms and recap history. B2B: white-label the senses layer to sportsbooks/broadcasters as an SDK — crowd + radio + takeovers as a drop-in for any TxLINE consumer. CALL IT streaks are a natural on-ramp for licensed free-to-play promotions.

## Legal note

TIFO displays probabilities and plays a free prediction game for pride only — no wagering, no stakes, no odds-taking.
