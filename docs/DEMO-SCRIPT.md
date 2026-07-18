# TIFO — Demo Video Script (≤ 5:00)

Record at 1080p+, system audio ON (the crowd engine is the star). Suggested tool: OBS / Screen Studio. Practice once at 16× replay speed so events land inside your talking beats.

---

### 0:00–0:25 — The hook (lobby on screen)
> "Every live-score app tells you *what happened*. Nothing makes you *feel* it happening. This is TIFO — a broadcast-grade second screen for the World Cup, built entirely on TxODDS's TxLINE real-time feed, activated on-chain through Solana. The match you can feel."

Show the lobby: brand, REPLAY/LIVE pill, match cards.

### 0:25–0:55 — Enter the stadium (open *The Comeback*, press Play at 4×, turn on **Crowd**)
> "Turn the sound on. That crowd isn't a recording — it's synthesized live in the browser, and it's listening to TxLINE. When the feed reports HighDanger possession, the crowd swells. Watch the radar — TxLINE tells us a goal is *possible* before it's confirmed."

Point at the ⚡ GOAL THREAT chip and the pressure map surging.

### 0:55–1:30 — The goal (let the 19' France goal hit)
> "...and GOAL. Full-screen takeover, screen shake, confetti, the crowd erupts — and on a phone, it buzzes in your hand. Every event type has its own haptic signature."

Then toggle **Radio**:
> "And TIFO calls the game out loud — radio commentary generated per moment, quoting the real demargined market: *'the market now makes France favourites'*. That number comes straight from TxLINE's odds stream."

### 1:30–2:10 — The market river + moments feed
Scroll to the win-probability river.
> "This is the story of the match as the market saw it — TxLINE's demargined three-way probabilities, drawn as a river, with every goal and VAR stamped where the river bends. And every raw feed update becomes a broadcast moment in the feed on the right."

### 2:10–2:50 — Drama pack (seek to ~60%, speed 16×)
Let the 63' goal → VAR → OVERTURNED → 75' penalty → miss sequence play.
> "Watch what the engine does with a VAR storm: goal... VAR check... OVERTURNED — the score rolls back because we diff TxLINE's authoritative totals, we don't guess. Penalty awarded... missed — hear the groan. That's four takeovers, four crowd reactions, four market swings, all driven by one SSE stream."

### 2:50–3:20 — CALL IT + the 88' winner
Make a call (BRA), let the 88' winner settle it.
> "CALL IT is a no-stakes streak game settled by the feed itself — call the next goal before it happens. And... CALLED IT. Streak plus one. And that's the comeback complete."

### 3:20–3:50 — Full-time recap + Replay Director
Let FT hit; the recap card auto-appears.
> "Full-time generates a shareable recap card — score, the probability river, the story beats. And this whole match was the Replay Director: recorded TxLINE timelines re-run through the *exact same engine* as live, at up to 64× with seek. Judges: every match you missed is one click from being felt again."

### 3:50–4:30 — How it works + Solana (show README architecture / activate script)
> "Under the hood: one deterministic reducer turns TxLINE scores and odds into state and moments; live rooms hold TxLINE's SSE streams with resume; access is activated on-chain — our script subscribes via the txoracle Solana program, signs the transaction with the wallet, and exchanges it for an API token. Endpoints used: fixtures, scores snapshot, updates, historical and stream, odds snapshot, updates and stream."

### 4:30–5:00 — Business + close (lobby again)
> "Monetization: free tier on the delayed feed; TIFO Prime on the real-time level-12 feed paid in TxL on Solana; and the senses layer white-labels to any sportsbook or broadcaster as an SDK. TIFO — built on TxLINE. The match you can feel."

---

**Pre-flight checklist**
- [ ] `npm start` running, reels regenerated (`npm run samples`)
- [ ] Browser sound permitted (click Crowd once before recording)
- [ ] Restart the reel before recording (`Restart` button)
- [ ] Mobile clip (optional): 10s of haptics + takeover on a phone for the accessibility beat
