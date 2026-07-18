/**
 * Generates TIFO's bundled sample reels: full matches in exact TxLINE schema
 * (Scores + OddsPayload records) so the product is instantly experienceable
 * with zero credentials.
 *
 * These reels are SYNTHETIC and clearly labeled as such in the UI. With
 * TXLINE_API_TOKEN configured, TIFO lists real fixtures and can record real
 * TxLINE historical matches with `npm run record -- <fixtureId>`.
 *
 * Usage: npm run samples
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RecordedMatch, TxOdds, TxScores } from '../shared/types.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'samples');

// deterministic PRNG
let seed = 20260714;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const between = (a: number, b: number) => a + rnd() * (b - a);

type EvType =
  | 'goal' | 'pen_goal' | 'pen_miss' | 'own_goal' | 'shot_on' | 'shot_off' | 'woodwork' | 'shot_blocked'
  | 'corner' | 'yellow' | 'red' | 'var_goal_disallowed' | 'var_check_stands' | 'offside' | 'fk_danger'
  | 'sub' | 'water_break' | 'pen_awarded';

interface ScriptEvent { min: number; side: 1 | 2; type: EvType }

interface MatchScript {
  fixtureId: number;
  p1: string; p1Id: number;
  p2: string; p2Id: number;
  label: string;
  note: string;
  kickoffIso: string;
  priorHome: number; priorDraw: number; // prior market %, away = 100 - home - draw
  events: ScriptEvent[];
  extraTime?: boolean;
  shootout?: { order: Array<1 | 2>; scored: boolean[] }; // penalty shootout sequence
}

// ---------------------------------------------------------------------------
// Narrative scripts
// ---------------------------------------------------------------------------

const SCRIPTS: MatchScript[] = [
  {
    fixtureId: 92260714,
    p1: 'Brazil', p1Id: 501, p2: 'France', p2Id: 502,
    label: 'Semi-final · The Comeback',
    note: 'France strike early, VAR chalks off their second, a missed penalty — and Brazil turn it around at the death.',
    kickoffIso: '2026-07-14T23:00:00Z',
    priorHome: 46.2, priorDraw: 26.4,
    events: [
      { min: 6, side: 1, type: 'shot_off' },
      { min: 9, side: 2, type: 'corner' },
      { min: 13, side: 1, type: 'woodwork' },
      { min: 19, side: 2, type: 'goal' },
      { min: 24, side: 1, type: 'yellow' },
      { min: 27, side: 1, type: 'shot_on' },
      { min: 31, side: 2, type: 'shot_blocked' },
      { min: 36, side: 1, type: 'corner' },
      { min: 39, side: 1, type: 'offside' },
      { min: 44, side: 2, type: 'shot_off' },
      { min: 49, side: 1, type: 'fk_danger' },
      { min: 52, side: 1, type: 'goal' },
      { min: 57, side: 2, type: 'sub' },
      { min: 60, side: 2, type: 'shot_on' },
      { min: 63, side: 2, type: 'var_goal_disallowed' },
      { min: 68, side: 1, type: 'corner' },
      { min: 71, side: 2, type: 'yellow' },
      { min: 75, side: 2, type: 'pen_awarded' },
      { min: 76, side: 2, type: 'pen_miss' },
      { min: 79, side: 1, type: 'sub' },
      { min: 83, side: 1, type: 'shot_on' },
      { min: 85, side: 1, type: 'corner' },
      { min: 88, side: 1, type: 'goal' },
      { min: 92, side: 2, type: 'shot_off' },
    ],
  },
  {
    fixtureId: 92260715,
    p1: 'Argentina', p1Id: 503, p2: 'England', p2Id: 504,
    label: 'Semi-final · The Shootout',
    note: 'England lead, a late Argentina penalty forces extra time, and it goes all the way to sudden-death spot kicks.',
    kickoffIso: '2026-07-15T23:00:00Z',
    priorHome: 41.8, priorDraw: 28.1,
    events: [
      { min: 5, side: 1, type: 'corner' },
      { min: 11, side: 2, type: 'shot_off' },
      { min: 17, side: 1, type: 'shot_on' },
      { min: 23, side: 2, type: 'fk_danger' },
      { min: 34, side: 2, type: 'goal' },
      { min: 38, side: 1, type: 'yellow' },
      { min: 43, side: 1, type: 'shot_blocked' },
      { min: 50, side: 1, type: 'corner' },
      { min: 54, side: 1, type: 'woodwork' },
      { min: 58, side: 2, type: 'yellow' },
      { min: 63, side: 1, type: 'sub' },
      { min: 66, side: 2, type: 'shot_on' },
      { min: 70, side: 1, type: 'corner' },
      { min: 74, side: 2, type: 'water_break' },
      { min: 77, side: 1, type: 'pen_awarded' },
      { min: 78, side: 1, type: 'pen_goal' },
      { min: 84, side: 2, type: 'sub' },
      { min: 89, side: 2, type: 'shot_off' },
      { min: 96, side: 1, type: 'shot_on' },
      { min: 101, side: 2, type: 'corner' },
      { min: 106, side: 1, type: 'yellow' },
      { min: 112, side: 2, type: 'woodwork' },
      { min: 118, side: 1, type: 'shot_blocked' },
    ],
    extraTime: true,
    shootout: {
      order: [1, 2, 1, 2, 1, 2, 1, 2, 1, 2],
      scored: [true, true, true, false, true, true, false, true, true, false],
    },
  },
  {
    fixtureId: 92260716,
    p1: 'Spain', p1Id: 505, p2: 'Morocco', p2Id: 506,
    label: 'Quarter-final · The Upset',
    note: 'Spain cruise into a two-goal lead — then Morocco produce the storm of the tournament.',
    kickoffIso: '2026-07-11T20:00:00Z',
    priorHome: 58.9, priorDraw: 23.5,
    events: [
      { min: 8, side: 1, type: 'shot_on' },
      { min: 14, side: 1, type: 'goal' },
      { min: 20, side: 1, type: 'corner' },
      { min: 26, side: 2, type: 'yellow' },
      { min: 33, side: 1, type: 'goal' },
      { min: 41, side: 2, type: 'shot_off' },
      { min: 47, side: 2, type: 'sub' },
      { min: 52, side: 2, type: 'goal' },
      { min: 56, side: 2, type: 'corner' },
      { min: 60, side: 1, type: 'yellow' },
      { min: 64, side: 2, type: 'shot_on' },
      { min: 67, side: 1, type: 'red' },
      { min: 73, side: 2, type: 'goal' },
      { min: 76, side: 1, type: 'sub' },
      { min: 81, side: 2, type: 'woodwork' },
      { min: 89, side: 2, type: 'goal' },
      { min: 93, side: 1, type: 'shot_off' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

const POSSESSION_TYPES = ['SafePossession', 'AttackPossession', 'DangerPossession', 'HighDangerPossession'];

function generate(script: MatchScript): RecordedMatch {
  const kickoff = Date.parse(script.kickoffIso);
  const startTime = kickoff;
  const scores: TxScores[] = [];
  const odds: TxOdds[] = [];
  let seq = 0;
  let msgN = 0;

  const tot = {
    1: { Goals: 0, YellowCards: 0, RedCards: 0, Corners: 0 },
    2: { Goals: 0, YellowCards: 0, RedCards: 0, Corners: 0 },
  };

  // market state
  let pHome = script.priorHome;
  let pDraw = script.priorDraw;

  const base = (gameState: string, ts: number, clockSec: number, running: boolean): TxScores => ({
    fixtureId: script.fixtureId,
    gameState,
    startTime,
    isTeam: true,
    fixtureGroupId: 9001,
    competitionId: 72,
    countryId: 0,
    sportId: 1,
    participant1IsHome: true,
    participant1Id: script.p1Id,
    participant2Id: script.p2Id,
    action: 'update',
    id: script.fixtureId,
    ts,
    connectionId: 1,
    seq: seq++,
    confirmed: true,
    clock: { running, seconds: clockSec },
    scoreSoccer: {
      Participant1: { Total: { ...tot[1] } },
      Participant2: { Total: { ...tot[2] } },
    },
  });

  const pushOdds = (ts: number, gameState: string, inRunning: boolean) => {
    const pAway = 100 - pHome - pDraw;
    const pct = [pHome, pDraw, pAway];
    const margin = 1.045;
    odds.push({
      FixtureId: script.fixtureId,
      MessageId: `sample-${script.fixtureId}-${msgN++}`,
      Ts: ts,
      Bookmaker: 'TxODDS StablePrice',
      BookmakerId: 0,
      SuperOddsType: 'StablePrice',
      GameState: gameState,
      InRunning: inRunning,
      MarketParameters: '',
      MarketPeriod: 'FullTime',
      PriceNames: ['1', 'X', '2'],
      Prices: pct.map(p => Math.round((100 / (p * margin)) * 1000)),
      Pct: pct.map(p => p.toFixed(3)),
    });
  };

  /** nudge market toward a side; strength in percentage points */
  const swing = (side: 1 | 2 | 0, points: number) => {
    if (side === 1) { pHome += points; pDraw -= points * 0.35; }
    else if (side === 2) { pHome -= points; pDraw -= points * 0.35; }
    else { pDraw += points; pHome -= points * 0.5; }
    pHome = Math.min(94, Math.max(2, pHome));
    pDraw = Math.min(60, Math.max(2, pDraw));
    if (pHome + pDraw > 97) pDraw = 97 - pHome;
  };

  /** drift the draw up / decisiveness as the match state demands */
  const drift = (minute: number) => {
    const diff = tot[1].Goals - tot[2].Goals;
    if (diff === 0 && minute > 60) swing(0, 0.5 + (minute - 60) * 0.04); // level late → draw rises
    if (diff > 0) swing(1, 0.25 + minute * 0.004);
    if (diff < 0) swing(2, 0.25 + minute * 0.004);
    swing(rnd() > 0.5 ? 1 : 2, between(-0.4, 0.4));
  };

  // pre-match odds (T-60m .. kickoff)
  for (let m = -60; m < 0; m += 5) {
    swing(rnd() > 0.5 ? 1 : 2, between(-0.3, 0.3));
    pushOdds(kickoff + m * 60_000, 'NS', false);
  }

  // pre-match score record
  scores.push(base('NS', kickoff - 15 * 60_000, 0, false));

  interface Period { gs: string; fromMin: number; toMin: number; clockFrom: number; wall: (min: number) => number }
  // wall time per period includes the breaks that precede it (HT 15', pre-ET 5', ET-HT 3')
  const HT_BREAK = 15 * 60_000, ET_BREAK = 5 * 60_000, ET_HT_BREAK = 3 * 60_000;

  const periods: Period[] = [
    { gs: 'H1', fromMin: 0, toMin: 45, clockFrom: 0, wall: m => kickoff + m * 60_000 },
    { gs: 'H2', fromMin: 45, toMin: 90, clockFrom: 45 * 60, wall: m => kickoff + m * 60_000 + HT_BREAK },
  ];
  if (script.extraTime) {
    periods.push(
      { gs: 'ET1', fromMin: 90, toMin: 105, clockFrom: 90 * 60, wall: m => kickoff + m * 60_000 + HT_BREAK + ET_BREAK },
      { gs: 'ET2', fromMin: 105, toMin: 120, clockFrom: 105 * 60, wall: m => kickoff + m * 60_000 + HT_BREAK + ET_BREAK + ET_HT_BREAK },
    );
  }

  const evAt = (min: number) => script.events.filter(e => e.min === min);
  let lastPossSide: 1 | 2 = 1;

  const emitEvent = (e: ScriptEvent, ts: number, clockSec: number, gs: string) => {
    const s = base(gs, ts, clockSec, true);
    const minute = Math.floor(clockSec / 60) + 1;
    const d: NonNullable<TxScores['dataSoccer']> = { Participant: e.side, Minutes: minute };
    switch (e.type) {
      case 'goal': {
        // brief HighDanger + possible-goal radar before the strike
        const pre = base(gs, ts - 9_000, clockSec - 9, true);
        pre.action = 'possession';
        pre.possession = e.side;
        pre.possessionType = 'HighDangerPossession';
        (e.side === 1 ? (pre.parti1StateSoccer = { PossibleEvent: { Goal: true, Penalty: false, Corner: false } })
                      : (pre.parti2StateSoccer = { PossibleEvent: { Goal: true, Penalty: false, Corner: false } }));
        scores.push(pre);
        tot[e.side].Goals++;
        s.scoreSoccer = { Participant1: { Total: { ...tot[1] } }, Participant2: { Total: { ...tot[2] } } };
        s.action = 'goal';
        d.Action = 'goal'; d.Goal = true;
        swing(e.side, between(14, 22));
        break;
      }
      case 'pen_awarded': s.action = 'penalty'; d.Action = 'penalty'; d.Penalty = true; swing(e.side, between(7, 10)); break;
      case 'pen_goal':
        tot[e.side].Goals++;
        s.scoreSoccer = { Participant1: { Total: { ...tot[1] } }, Participant2: { Total: { ...tot[2] } } };
        s.action = 'goal'; d.Action = 'goal'; d.Goal = true; d.Penalty = true;
        swing(e.side, between(12, 18));
        break;
      case 'pen_miss': s.action = 'penalty'; d.Action = 'penalty'; d.Penalty = true; d.Outcome = 'Missed'; swing(e.side, -between(6, 9)); break;
      case 'own_goal': {
        const benefiting = e.side === 1 ? 2 : 1;
        tot[benefiting].Goals++;
        s.scoreSoccer = { Participant1: { Total: { ...tot[1] } }, Participant2: { Total: { ...tot[2] } } };
        s.action = 'goal'; d.Action = 'goal'; d.Goal = true;
        swing(benefiting as 1 | 2, between(14, 20));
        break;
      }
      case 'shot_on': s.action = 'shot'; d.Action = 'shot'; d.Outcome = 'OnTarget'; swing(e.side, between(0.8, 1.6)); break;
      case 'shot_off': s.action = 'shot'; d.Action = 'shot'; d.Outcome = 'OffTarget'; swing(e.side, between(0.2, 0.7)); break;
      case 'woodwork': s.action = 'shot'; d.Action = 'shot'; d.Outcome = 'Woodwork'; swing(e.side, between(1.5, 2.5)); break;
      case 'shot_blocked': s.action = 'shot'; d.Action = 'shot'; d.Outcome = 'Blocked'; swing(e.side, between(0.3, 0.8)); break;
      case 'corner':
        tot[e.side].Corners++;
        s.scoreSoccer = { Participant1: { Total: { ...tot[1] } }, Participant2: { Total: { ...tot[2] } } };
        s.action = 'corner'; d.Action = 'corner'; d.Corner = true;
        swing(e.side, between(0.4, 1));
        break;
      case 'yellow':
        tot[e.side].YellowCards++;
        s.scoreSoccer = { Participant1: { Total: { ...tot[1] } }, Participant2: { Total: { ...tot[2] } } };
        s.action = 'yellow_card'; d.Action = 'yellow_card'; d.YellowCard = true;
        swing(e.side, -between(0.5, 1.2));
        break;
      case 'red':
        tot[e.side].RedCards++;
        s.scoreSoccer = { Participant1: { Total: { ...tot[1] } }, Participant2: { Total: { ...tot[2] } } };
        s.action = 'red_card'; d.Action = 'red_card'; d.RedCard = true;
        swing(e.side, -between(9, 14));
        break;
      case 'var_goal_disallowed': {
        // goal scored -> VAR check -> overturned
        tot[e.side].Goals++;
        s.scoreSoccer = { Participant1: { Total: { ...tot[1] } }, Participant2: { Total: { ...tot[2] } } };
        s.action = 'goal'; d.Action = 'goal'; d.Goal = true;
        scores.push(s);
        swing(e.side, between(12, 18));
        pushOdds(ts + 5_000, gs, true);

        const varStart = base(gs, ts + 20_000, clockSec + 20, false);
        varStart.action = 'var';
        varStart.dataSoccer = { Action: 'var', VAR: true, Type: 'Goal', Participant: e.side };
        varStart.possibleEventSoccer = { RedCard: false, YellowCard: false, VAR: true };
        scores.push(varStart);

        tot[e.side].Goals--;
        const varEnd = base(gs, ts + 95_000, clockSec + 95, true);
        varEnd.action = 'var_end';
        varEnd.dataSoccer = { Action: 'var_end', Outcome: 'Overturned', Participant: e.side };
        scores.push(varEnd);
        swing(e.side, -between(11, 16));
        pushOdds(ts + 100_000, gs, true);
        return; // fully handled
      }
      case 'var_check_stands': {
        s.action = 'var'; d.Action = 'var'; d.VAR = true; d.Type = 'Penalty';
        scores.push(s);
        const varEnd = base(gs, ts + 70_000, clockSec + 70, true);
        varEnd.action = 'var_end';
        varEnd.dataSoccer = { Action: 'var_end', Outcome: 'Stands', Participant: e.side };
        scores.push(varEnd);
        return;
      }
      case 'offside': s.action = 'free_kick'; d.Action = 'free_kick'; d.FreeKickType = 'Offside'; break;
      case 'fk_danger': s.action = 'free_kick'; d.Action = 'free_kick'; d.FreeKickType = 'HighDanger'; swing(e.side, between(0.6, 1.2)); break;
      case 'sub': s.action = 'substitution'; d.Action = 'substitution'; break;
      case 'water_break': s.action = 'comment'; d.Action = 'comment'; d.Text = 'Water-drinking break'; break;
    }
    s.dataSoccer = d;
    scores.push(s);
    pushOdds(ts + 4_000, gs, true);
  };

  for (const period of periods) {
    // phase-change record
    const phaseStart = base(period.gs, period.wall(period.fromMin) - 20_000, period.clockFrom, true);
    phaseStart.action = 'status';
    scores.push(phaseStart);
    if (period.gs === 'H2') pushOdds(period.wall(period.fromMin) - 60_000, 'HT', true);

    for (let min = period.fromMin; min < period.toMin; min++) {
      const wall = period.wall(min);
      const clockSec = min * 60;

      // scripted events this minute
      for (const e of evAt(min + 1)) emitEvent(e, wall + between(5_000, 40_000), clockSec + Math.round(between(5, 50)), period.gs);

      // ambient possession noise every ~2-3 minutes
      if (min % 2 === (period.fromMin % 2) && rnd() > 0.25) {
        lastPossSide = rnd() > 0.5 ? lastPossSide : lastPossSide === 1 ? 2 : 1;
        const upcoming = script.events.find(e => e.min > min && e.min <= min + 4 && (e.type === 'goal' || e.type === 'woodwork' || e.type === 'shot_on'));
        const level = upcoming && upcoming.side === lastPossSide ? (rnd() > 0.4 ? 2 : 3) : Math.floor(rnd() * 2.4);
        const p = base(period.gs, wall + 55_000, clockSec + 55, true);
        p.action = 'possession';
        p.possession = lastPossSide;
        p.possessionType = POSSESSION_TYPES[level];
        scores.push(p);
      }

      // market drift every ~3 minutes
      if (min % 3 === 0) { drift(min); pushOdds(wall + 30_000, period.gs, true); }
    }

    // period end
    const endGs = period.gs === 'H1' ? 'HT' : period.gs === 'H2' ? (script.extraTime ? 'WET' : 'F') : period.gs === 'ET1' ? 'HTET' : (script.shootout ? 'WPE' : 'FET');
    const endRec = base(endGs, period.wall(period.toMin) + 60_000, period.toMin * 60, false);
    endRec.action = 'status';
    scores.push(endRec);
  }

  // penalty shootout
  if (script.shootout) {
    const peStartWall = periods[periods.length - 1].wall(120) + 6 * 60_000;
    const peRec = base('PE', peStartWall, 120 * 60, false);
    peRec.action = 'status';
    scores.push(peRec);
    const pens = { 1: 0, 2: 0 };
    script.shootout.order.forEach((side, i) => {
      const ts = peStartWall + (i + 1) * 75_000;
      const scored = script.shootout!.scored[i];
      if (scored) {
        pens[side]++;
        tot[side].Goals++; // TxLINE PE goals appear in totals during shootout
      }
      const rec = base('PE', ts, 120 * 60, false);
      rec.action = 'penalty';
      rec.dataSoccer = { Action: 'penalty', Participant: side, Penalty: true, Outcome: scored ? 'Scored' : 'Missed' };
      scores.push(rec);
      swing(side, scored ? 4 : -6);
      pushOdds(ts + 3_000, 'PE', true);
    });
    const done = base('FPE', peStartWall + (script.shootout.order.length + 2) * 75_000, 120 * 60, false);
    done.action = 'status';
    scores.push(done);
  }

  scores.sort((a, b) => a.ts - b.ts || a.seq - b.seq);
  odds.sort((a, b) => a.Ts - b.Ts);

  return {
    fixture: {
      Ts: kickoff - 86_400_000,
      StartTime: startTime,
      Competition: 'FIFA World Cup 2026',
      CompetitionId: 72,
      FixtureGroupId: 9001,
      Participant1Id: script.p1Id,
      Participant1: script.p1,
      Participant2Id: script.p2Id,
      Participant2: script.p2,
      FixtureId: script.fixtureId,
      Participant1IsHome: true,
    },
    scores,
    odds,
    meta: { label: script.label, synthetic: true, note: script.note },
  };
}

// ---------------------------------------------------------------------------

fs.mkdirSync(OUT, { recursive: true });
for (const script of SCRIPTS) {
  const rec = generate(script);
  const file = path.join(OUT, `${rec.fixture.FixtureId}.json`);
  fs.writeFileSync(file, JSON.stringify(rec));
  console.log(`${file}  —  ${rec.scores.length} score updates, ${rec.odds.length} odds updates  (${rec.meta?.label})`);
}
console.log('Sample reels generated.');
