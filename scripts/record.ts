/**
 * TIFO — record a real TxLINE match for the Replay Director.
 *
 * Pulls the full score history (/api/scores/historical) and odds updates for a
 * fixture and saves them to data/recordings/<fixtureId>.json, ready to be
 * replayed through the TIFO engine.
 *
 * Usage:
 *   npm run record -- <fixtureId>
 *   npm run record -- --list            # list current World Cup fixtures
 *
 * Requires TXLINE_API_TOKEN in .env (run `npm run activate` first).
 * Note: /api/scores/historical covers fixtures that started between two weeks
 * and six hours ago. Odds history is reconstructed from hourly snapshots.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RecordedMatch, TxOdds } from '../shared/types.js';
import { TxLineClient } from '../server/txline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// naive .env loader (no dep)
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const network = process.env.TXLINE_NETWORK ?? 'mainnet';
const origin = process.env.TXLINE_ORIGIN ?? (network === 'devnet' ? 'https://txline-dev.txodds.com' : 'https://txline.txodds.com');
const apiToken = process.env.TXLINE_API_TOKEN;
if (!apiToken) {
  console.error('TXLINE_API_TOKEN missing — run `npm run activate` first.');
  process.exit(1);
}

const tx = new TxLineClient({ origin, apiToken, jwt: process.env.TXLINE_JWT });
const args = process.argv.slice(2);

async function main() {
  if (args.includes('--list')) {
    const today = Math.floor(Date.now() / 86_400_000);
    const fixtures = await tx.fixturesSnapshot(72, today - 14);
    for (const f of fixtures.sort((a, b) => a.StartTime - b.StartTime)) {
      console.log(`${f.FixtureId}  ${new Date(f.StartTime).toISOString()}  ${f.Participant1} v ${f.Participant2}`);
    }
    return;
  }

  const fixtureId = Number(args.find(a => /^\d+$/.test(a)));
  if (!fixtureId) {
    console.error('Usage: npm run record -- <fixtureId>   (or --list)');
    process.exit(1);
  }

  console.log(`recording fixture ${fixtureId} from ${origin}…`);
  const scores = await tx.scoresHistorical(fixtureId);
  if (!scores.length) throw new Error('no historical score data (fixture must have started 6h–2wk ago)');
  console.log(`  ${scores.length} score updates`);

  // fixture metadata
  const first = scores[0];
  const today = Math.floor(first.startTime / 86_400_000);
  const fixtures = await tx.fixturesSnapshot(first.competitionId, today - 1).catch(() => []);
  const fixture = fixtures.find(f => f.FixtureId === fixtureId) ?? {
    Ts: first.ts, StartTime: first.startTime, Competition: 'FIFA World Cup 2026',
    CompetitionId: first.competitionId, FixtureGroupId: first.fixtureGroupId,
    Participant1Id: first.participant1Id, Participant1: first.participant1 ?? `Team ${first.participant1Id}`,
    Participant2Id: first.participant2Id, Participant2: first.participant2 ?? `Team ${first.participant2Id}`,
    FixtureId: fixtureId, Participant1IsHome: first.participant1IsHome,
  };

  // odds: sample historical snapshots at 5-minute steps across the match window
  const startTs = first.startTime - 60 * 60_000;
  const endTs = scores[scores.length - 1].ts + 5 * 60_000;
  const odds: TxOdds[] = [];
  const seen = new Set<string>();
  for (let t = startTs; t <= endTs; t += 5 * 60_000) {
    try {
      const snap = await tx.oddsSnapshot(fixtureId, t);
      for (const o of snap) {
        if (seen.has(o.MessageId)) continue;
        seen.add(o.MessageId);
        odds.push(o);
      }
    } catch { /* interval without data */ }
  }
  odds.sort((a, b) => a.Ts - b.Ts);
  console.log(`  ${odds.length} odds updates`);

  const rec: RecordedMatch = {
    fixture, scores, odds,
    meta: { label: `${fixture.Participant1} v ${fixture.Participant2} · recorded from TxLINE`, synthetic: false },
  };
  const out = path.join(ROOT, 'data', 'recordings');
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${fixtureId}.json`);
  fs.writeFileSync(file, JSON.stringify(rec));
  console.log(`✅ saved ${file}`);
}

main().catch(err => { console.error('❌', err.message ?? err); process.exit(1); });
