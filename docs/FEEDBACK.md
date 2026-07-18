# Feedback on the TxLINE API

Written while building TIFO. Overall: the feed is genuinely excellent for consumer experiences — low-latency, semantically rich, and the possession danger states + possible-event radar are unique differentiators no scores API we've used exposes. Feedback below is offered in the spirit of making it even easier to build on.

## What we loved

1. **`possessionType` danger levels and `PossibleEvent` radar.** These made TIFO's core idea possible — the crowd audio swells *before* the goal, exactly like a real stadium. This is the API's killer feature; we'd suggest marketing it harder.
2. **Demargined `Pct` on odds updates.** Not having to demargin ourselves removed a whole class of bugs and made the win-probability river trivial to build honestly.
3. **SSE everywhere.** Plain `EventSource`/`fetch` semantics, `Last-Event-ID` resume, no websocket handshake complexity. Reconnect logic was ~30 lines.
4. **Guest JWT flow.** Being able to start with `POST /auth/guest/start` and defer wallet work was a great onboarding ramp.
5. **On-chain activation** was smoother than expected once the message format was clear — and the free devnet/mainnet level-1 tier is a perfect hackathon on-ramp.

## Friction we hit

1. **The `walletSignature` message format** (`` `${txSig}:${leagues.join(',')}:${jwt}` ``, with the empty-leagues case collapsing to `txSig::jwt`) had to be reverse-engineered from example code. A one-line spec in the docs (plus a JS snippet using `nacl.sign.detached`) would save every team an hour.
2. **Historical odds require sampling.** `/api/scores/historical/{fixtureId}` returns the full score timeline in one call — brilliant — but there is no `/api/odds/historical`. We reconstructed odds history by sweeping `oddsSnapshot?asOf=` in 5-minute steps and deduping on `MessageId`. A matching historical odds endpoint would make replay/analysis products much easier.
3. **The 6-hour-to-2-week window on historical scores** means a match can't be recorded immediately at full-time. Even a 1-hour lower bound would let recap products publish while fans still care.
4. **Type looseness on a few fields.** `statusSoccerId` and `possessionType` sometimes serialize as strings and sometimes as objects; `Pct` mixes numeric strings with `"NA"`. Consistent types (or a published JSON Schema per message) would harden client codegen.
5. **Participant names aren't on score updates** — only IDs plus `participant1IsHome`. Every consumer has to join against the fixtures snapshot; embedding the two names (or a `/api/participants` lookup) would remove a dependency.
6. **Discoverability of the 3-way market.** Odds updates carry many `SuperOddsType`/`MarketPeriod` combinations; identifying "the" full-time 1X2 to display required trial and error. A documented list of `SuperOddsType` values (and which have `Pct`) would help.
7. **Docs nits:** the OpenAPI YAML is comprehensive but the human docs don't mention `startEpochDay` is *days since epoch* (we guessed); the fixtures snapshot's behaviour when `startEpochDay` is in the past vs future could be spelled out.

## Wishlist

- Player-level data (`PlayerId` exists on `dataSoccer` — a name lookup endpoint would unlock lineups/scorer names).
- A `?from=` parameter on `/api/scores/updates` for cheap partial backfills.
- Webhook or push option for fixture list changes so pollers can be retired.
- xG or shot-location coordinates, even coarse (box/outside), would supercharge visualizations like our pressure map.
