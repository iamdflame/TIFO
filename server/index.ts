/**
 * TIFO server.
 *
 * Express app that:
 *  - manages match rooms (live TxLINE rooms + Replay Director rooms)
 *  - fans MatchState out to browsers over SSE
 *  - serves the built web app in production
 *
 * TxLINE credentials are optional: without them, TIFO runs replay-only using
 * bundled reels + any recorded real matches in data/recordings.
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MatchListItem, RecordedMatch, ServerStatus, TxFixture } from '../shared/types.js';
import { teamCode } from './engine.js';
import { LiveRoom, ReplayRoom, type Room } from './rooms.js';
import { TxLineClient } from './txline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// tiny .env loader (no dependency)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const PORT = Number(process.env.PORT ?? 8090);
const WORLD_CUP_COMPETITION_ID = Number(process.env.TXLINE_COMPETITION_ID ?? 72);

// -- TxLINE client (optional) -------------------------------------------------

const network = (process.env.TXLINE_NETWORK ?? 'mainnet') as 'mainnet' | 'devnet';
const origin = process.env.TXLINE_ORIGIN
  ?? (network === 'devnet' ? 'https://txline-dev.txodds.com' : 'https://txline.txodds.com');

const tx = process.env.TXLINE_API_TOKEN
  ? new TxLineClient({ origin, apiToken: process.env.TXLINE_API_TOKEN, jwt: process.env.TXLINE_JWT })
  : null;

let txHealthy = false;
if (tx) {
  void tx.health().then(ok => {
    txHealthy = ok;
    console.log(ok ? `[txline] connected to ${origin}` : `[txline] configured but health check failed on ${origin}`);
  });
} else {
  console.log('[txline] no TXLINE_API_TOKEN — replay-only mode (run `npm run activate` for live data)');
}

// -- recorded matches (bundled samples + real recordings) ----------------------

function loadRecorded(): Map<number, RecordedMatch> {
  const out = new Map<number, RecordedMatch>();
  for (const dir of [path.join(ROOT, 'data', 'samples'), path.join(ROOT, 'data', 'recordings')]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RecordedMatch;
        out.set(rec.fixture.FixtureId, rec);
      } catch (err) {
        console.error(`[recordings] failed to load ${f}:`, (err as Error).message);
      }
    }
  }
  return out;
}
const recorded = loadRecorded();
console.log(`[recordings] ${recorded.size} replayable matches loaded`);

// -- rooms ---------------------------------------------------------------------

const rooms = new Map<number, Room>();

function getRoom(fixtureId: number): Room | null {
  const existing = rooms.get(fixtureId);
  if (existing) return existing;

  const rec = recorded.get(fixtureId);
  if (rec) {
    const room = new ReplayRoom(rec);
    rooms.set(fixtureId, room);
    return room;
  }
  if (tx && liveFixtures.has(fixtureId)) {
    const room = new LiveRoom(liveFixtures.get(fixtureId)!, tx);
    rooms.set(fixtureId, room);
    return room;
  }
  return null;
}

// reap idle rooms (no listeners for 10 min)
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.listenerCount === 0 && now - room.lastActive > 10 * 60_000) {
      room.close();
      rooms.delete(id);
      console.log(`[rooms] reaped idle room ${id}`);
    }
  }
}, 60_000);

// -- live fixture list (refreshed every 2 min) -----------------------------------

const liveFixtures = new Map<number, TxFixture>();
async function refreshFixtures() {
  if (!tx) return;
  try {
    const today = Math.floor(Date.now() / 86_400_000);
    const fixtures = await tx.fixturesSnapshot(WORLD_CUP_COMPETITION_ID, today - 1);
    liveFixtures.clear();
    for (const f of fixtures) liveFixtures.set(f.FixtureId, f);
    txHealthy = true;
  } catch (err) {
    console.error('[txline] fixtures refresh failed:', (err as Error).message);
  }
}
if (tx) {
  void refreshFixtures();
  setInterval(refreshFixtures, 120_000);
}

// -- HTTP API --------------------------------------------------------------------

const app = express();
app.use(express.json());

app.get('/api/status', (_req, res) => {
  const status: ServerStatus = {
    live: !!tx && txHealthy,
    network: tx ? network : null,
    replays: recorded.size,
    uptime: process.uptime(),
  };
  res.json(status);
});

app.get('/api/matches', (_req, res) => {
  const items: MatchListItem[] = [];
  for (const f of liveFixtures.values()) {
    const p1Home = f.Participant1IsHome !== false;
    const room = rooms.get(f.FixtureId);
    items.push({
      fixtureId: f.FixtureId,
      competition: f.Competition,
      home: p1Home ? f.Participant1 : f.Participant2,
      away: p1Home ? f.Participant2 : f.Participant1,
      homeCode: teamCode(p1Home ? f.Participant1 : f.Participant2),
      awayCode: teamCode(p1Home ? f.Participant2 : f.Participant1),
      startTime: f.StartTime,
      source: 'live',
      phase: room?.state.phase,
      score: room ? { home: room.state.home.goals, away: room.state.away.goals } : undefined,
    });
  }
  for (const rec of recorded.values()) {
    const f = rec.fixture;
    const p1Home = f.Participant1IsHome !== false;
    items.push({
      fixtureId: f.FixtureId,
      competition: f.Competition,
      home: p1Home ? f.Participant1 : f.Participant2,
      away: p1Home ? f.Participant2 : f.Participant1,
      homeCode: teamCode(p1Home ? f.Participant1 : f.Participant2),
      awayCode: teamCode(p1Home ? f.Participant2 : f.Participant1),
      startTime: f.StartTime,
      source: 'replay',
      label: rec.meta?.label,
      synthetic: rec.meta?.synthetic,
    });
  }
  items.sort((a, b) => (a.source === b.source ? a.startTime - b.startTime : a.source === 'live' ? -1 : 1));
  res.json(items);
});

app.get('/api/match/:id', (req, res) => {
  const room = getRoom(Number(req.params.id));
  if (!room) return void res.status(404).json({ error: 'unknown fixture' });
  res.json(room.state);
});

app.get('/api/match/:id/stream', (req, res) => {
  const room = getRoom(Number(req.params.id));
  if (!room) return void res.status(404).json({ error: 'unknown fixture' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: state\ndata: ${JSON.stringify(room.state)}\n\n`);

  const unsub = room.subscribe((state, moments) => {
    res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
    for (const m of moments) res.write(`event: moment\ndata: ${JSON.stringify(m)}\n\n`);
  });
  const ping = setInterval(() => res.write(`: ping\n\n`), 25_000);

  req.on('close', () => { clearInterval(ping); unsub(); });
});

app.post('/api/match/:id/replay', (req, res) => {
  const room = getRoom(Number(req.params.id));
  if (!room || !(room instanceof ReplayRoom)) return void res.status(404).json({ error: 'not a replay room' });
  const { action, value } = req.body as { action: 'play' | 'pause' | 'seek' | 'speed' | 'restart'; value?: number };
  if (!['play', 'pause', 'seek', 'speed', 'restart'].includes(action)) return void res.status(400).json({ error: 'bad action' });
  room.control(action, value);
  res.json({ ok: true, replay: room.state.replay });
});

// -- static (production build) ------------------------------------------------------

const dist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`\nTIFO server → http://localhost:${PORT}`);
  console.log(`mode: ${tx ? `LIVE (${network}, ${origin})` : 'replay-only'} · ${recorded.size} replay reels\n`);
});
