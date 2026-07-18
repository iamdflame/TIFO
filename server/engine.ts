/**
 * TIFO match engine.
 *
 * A pure, replayable reducer that folds raw TxLINE score + odds updates into a
 * fan-facing MatchState: score, phase, momentum, danger, win probabilities and
 * a typed feed of broadcast "moments".
 *
 * Because it is pure, the exact same engine powers live matches, historical
 * TxLINE replays and the bundled sample reels — and seeking inside a replay is
 * just re-folding a prefix of the timeline.
 */

import type {
  MatchState, Moment, MomentKind, Phase, Side, TeamState,
  TxFixture, TxOdds, TxScores,
} from '../shared/types.js';
import { punditLine } from './pundit.js';

const PHASES: Phase[] = ['NS','H1','HT','H2','F','WET','ET1','HTET','ET2','FET','WPE','PE','FPE','I','A','C','P'];

const TEAM_CODES: Record<string, string> = {
  brazil: 'BRA', france: 'FRA', argentina: 'ARG', england: 'ENG', spain: 'ESP',
  portugal: 'POR', germany: 'GER', netherlands: 'NED', italy: 'ITA', belgium: 'BEL',
  croatia: 'CRO', morocco: 'MAR', uruguay: 'URU', colombia: 'COL', mexico: 'MEX',
  usa: 'USA', 'united states': 'USA', canada: 'CAN', japan: 'JPN', 'south korea': 'KOR',
  senegal: 'SEN', ghana: 'GHA', nigeria: 'NGA', australia: 'AUS', ecuador: 'ECU',
  switzerland: 'SUI', denmark: 'DEN', poland: 'POL', serbia: 'SRB', wales: 'WAL',
  cameroon: 'CMR', tunisia: 'TUN', 'costa rica': 'CRC', 'saudi arabia': 'KSA',
  iran: 'IRN', qatar: 'QAT', norway: 'NOR', austria: 'AUT', scotland: 'SCO', egypt: 'EGY',
  algeria: 'ALG', 'ivory coast': 'CIV', paraguay: 'PAR', panama: 'PAN', jordan: 'JOR',
  uzbekistan: 'UZB', 'new zealand': 'NZL', 'south africa': 'RSA', ukraine: 'UKR', turkey: 'TUR',
};

export function teamCode(name: string): string {
  const k = name.trim().toLowerCase();
  if (TEAM_CODES[k]) return TEAM_CODES[k];
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 3).toUpperCase();
  return words.map(w => w[0]).join('').slice(0, 3).toUpperCase();
}

function newTeam(name: string, id: number): TeamState {
  return { name, id, code: teamCode(name), goals: 0, corners: 0, yellows: 0, reds: 0, shots: 0, shotsOnTarget: 0, pens: 0 };
}

export function initialState(fixture: TxFixture, source: 'live' | 'replay'): MatchState {
  const p1Home = fixture.Participant1IsHome !== false;
  const homeName = p1Home ? fixture.Participant1 : fixture.Participant2;
  const awayName = p1Home ? fixture.Participant2 : fixture.Participant1;
  const homeId = p1Home ? fixture.Participant1Id : fixture.Participant2Id;
  const awayId = p1Home ? fixture.Participant2Id : fixture.Participant1Id;
  return {
    fixtureId: fixture.FixtureId,
    competition: fixture.Competition,
    startTime: fixture.StartTime,
    phase: 'NS',
    clockSeconds: 0,
    clockRunning: false,
    minute: 0,
    home: newTeam(homeName, homeId),
    away: newTeam(awayName, awayId),
    momentum: 0,
    danger: 0,
    dangerSide: null,
    possibleEvents: { goal: null, penalty: null, corner: null, var: false },
    probs: null,
    probHistory: [],
    moments: [],
    lastUpdateTs: 0,
    source,
    replay: null,
    updates: 0,
  };
}

// -- helpers -----------------------------------------------------------------

/** participant number (1|2) -> home/away side */
function sideOf(participant: number | undefined, p1IsHome: boolean): Side | null {
  if (participant !== 1 && participant !== 2) return null;
  return (participant === 1) === p1IsHome ? 'home' : 'away';
}

function phaseOf(u: TxScores): Phase | null {
  const raw = typeof u.gameState === 'string' && u.gameState
    ? u.gameState
    : typeof u.statusSoccerId === 'string'
      ? u.statusSoccerId
      : u.statusSoccerId && typeof u.statusSoccerId === 'object'
        ? Object.keys(u.statusSoccerId)[0]
        : null;
  if (!raw) return null;
  const up = raw.toUpperCase() as Phase;
  return PHASES.includes(up) ? up : null;
}

function possessionTypeLevel(pt: TxScores['possessionType']): number {
  const s = typeof pt === 'string' ? pt : pt && typeof pt === 'object' ? Object.keys(pt)[0] ?? '' : '';
  const k = s.toLowerCase();
  if (k.includes('highdanger')) return 3;
  if (k.includes('danger')) return 2;
  if (k.includes('attack')) return 1;
  return 0;
}

function displayMinute(state: MatchState): number {
  const s = state.clockSeconds;
  switch (state.phase) {
    case 'NS': return 0;
    case 'H1': return Math.min(45 + 8, Math.floor(s / 60) + 1);
    case 'HT': return 45;
    case 'H2': return Math.min(90 + 12, Math.floor(s / 60) + 1);
    case 'F': case 'WET': return 90;
    case 'ET1': return Math.min(105 + 5, Math.floor(s / 60) + 1);
    case 'HTET': return 105;
    case 'ET2': return Math.min(120 + 5, Math.floor(s / 60) + 1);
    case 'FET': case 'WPE': case 'PE': case 'FPE': return 120;
    default: return Math.floor(s / 60);
  }
}

let momentSeq = 0;
function moment(state: MatchState, kind: MomentKind, side: Side | null, headline: string, detail: string, ts: number, meta?: Moment['meta']): Moment {
  return {
    id: `${state.fixtureId}-${ts}-${momentSeq++}`,
    kind, ts, side,
    minute: state.minute,
    headline, detail,
    score: { home: state.home.goals, away: state.away.goals },
    probs: state.probs,
    meta,
  };
}

const totals = (t?: { Total?: { Goals: number; YellowCards: number; RedCards: number; Corners: number } }) =>
  t?.Total ?? { Goals: 0, YellowCards: 0, RedCards: 0, Corners: 0 };

// -- score update reducer ----------------------------------------------------

export function applyScore(state: MatchState, u: TxScores): Moment[] {
  const out: Moment[] = [];
  const p1IsHome = u.participant1IsHome !== false;
  state.lastUpdateTs = u.ts;
  state.updates++;

  // clock & phase
  if (u.clock) {
    state.clockSeconds = u.clock.seconds;
    state.clockRunning = u.clock.running;
  }
  const ph = phaseOf(u);
  if (ph && ph !== state.phase) {
    const prev = state.phase;
    state.phase = ph;
    state.minute = displayMinute(state);
    const label: Partial<Record<Phase, [string, string]>> = {
      H1: ['KICK-OFF', 'We are underway.'],
      HT: ['HALF-TIME', 'The whistle goes for the break.'],
      H2: ['SECOND HALF', 'Back underway.'],
      F: ['FULL-TIME', 'It is all over.'],
      WET: ['EXTRA TIME LOOMS', 'Level after ninety. Thirty more minutes.'],
      ET1: ['EXTRA TIME', 'Extra time begins.'],
      HTET: ['ET BREAK', 'Halfway through extra time.'],
      ET2: ['ET SECOND HALF', 'Fifteen minutes left to settle it.'],
      FET: ['END OF EXTRA TIME', 'Still level. Penalties.'],
      WPE: ['PENALTIES NEXT', 'The shootout is coming.'],
      PE: ['PENALTY SHOOTOUT', 'From twelve yards. No hiding place.'],
      FPE: ['DECIDED ON PENALTIES', 'The shootout settles it.'],
      I: ['MATCH INTERRUPTED', 'Play has been stopped.'],
      A: ['MATCH ABANDONED', 'The match has been abandoned.'],
    };
    const l = label[ph];
    if (l) {
      const kind: MomentKind = ph === 'H1' ? 'kickoff' : (ph === 'F' || ph === 'FET' || ph === 'FPE') ? 'full_time' : 'phase';
      out.push(moment(state, kind, null, l[0], punditLine(kind, state, null, { phase: ph, prev }), u.ts));
    }
  }
  state.minute = displayMinute(state);

  // momentum & danger from possession
  if (u.possession === 1 || u.possession === 2) {
    const side = sideOf(u.possession, p1IsHome);
    const level = possessionTypeLevel(u.possessionType);
    const push = [0.08, 0.22, 0.45, 0.75][level] * (side === 'home' ? 1 : -1);
    state.momentum = state.momentum * 0.72 + push * 0.28;
    state.danger = level;
    state.dangerSide = side;
  }

  // possible-event radar
  const p1 = u.parti1StateSoccer?.PossibleEvent;
  const p2 = u.parti2StateSoccer?.PossibleEvent;
  if (p1 || p2) {
    const sideFor = (i: 1 | 2): Side => (i === 1) === p1IsHome ? 'home' : 'away';
    state.possibleEvents.goal = p1?.Goal ? sideFor(1) : p2?.Goal ? sideFor(2) : null;
    state.possibleEvents.penalty = p1?.Penalty ? sideFor(1) : p2?.Penalty ? sideFor(2) : null;
    state.possibleEvents.corner = p1?.Corner ? sideFor(1) : p2?.Corner ? sideFor(2) : null;
  }
  if (u.possibleEventSoccer) state.possibleEvents.var = !!u.possibleEventSoccer.VAR;

  // score totals diff (authoritative for goals/cards/corners)
  let chalkOff = false;
  if (u.scoreSoccer) {
    const t1 = totals(u.scoreSoccer.Participant1);
    const t2 = totals(u.scoreSoccer.Participant2);
    const homeT = p1IsHome ? t1 : t2;
    const awayT = p1IsHome ? t2 : t1;
    const d = u.dataSoccer ?? {};
    const actorSide = sideOf(d.Participant, p1IsHome);

    for (const [side, team, t] of [['home', state.home, homeT], ['away', state.away, awayT]] as const) {
      if (state.phase === 'PE') {
        // during shootout goal increments are shootout pens
        if (t.Goals > team.goals + team.pens) {
          team.pens = t.Goals - team.goals;
          out.push(moment(state, 'shootout_pen', side, `${team.code} SCORE FROM THE SPOT`, punditLine('shootout_pen', state, side, {}), u.ts));
        }
      } else if (t.Goals > team.goals) {
        team.goals = t.Goals;
        state.minute = displayMinute(state);
        const own = d.Goal && actorSide && actorSide !== side;
        const pen = !!d.Penalty;
        const kind: MomentKind = own ? 'own_goal' : pen ? 'penalty_goal' : 'goal';
        const head = own ? `OWN GOAL — ${team.code} BENEFIT` : pen ? `${team.code} SCORE THE PENALTY` : `GOAL — ${team.name.toUpperCase()}`;
        out.push(moment(state, kind, side, head, punditLine(kind, state, side, {}), u.ts, { homeGoals: state.home.goals, awayGoals: state.away.goals }));
        state.momentum = side === 'home' ? Math.min(1, state.momentum + 0.5) : Math.max(-1, state.momentum - 0.5);
      } else if (t.Goals < team.goals) {
        // VAR chalk-off / amend
        team.goals = t.Goals;
        chalkOff = true;
        out.push(moment(state, 'var_end', side, `GOAL DISALLOWED — ${team.code}`, punditLine('var_end', state, side, { overturned: true }), u.ts));
      }
      if (t.YellowCards > team.yellows) {
        team.yellows = t.YellowCards;
        out.push(moment(state, 'yellow', side, `YELLOW CARD — ${team.code}`, punditLine('yellow', state, side, {}), u.ts));
      }
      if (t.RedCards > team.reds) {
        team.reds = t.RedCards;
        out.push(moment(state, 'red', side, `RED CARD — ${team.code}`, punditLine('red', state, side, {}), u.ts));
      }
      if (t.Corners > team.corners) {
        team.corners = t.Corners;
        out.push(moment(state, 'corner', side, `CORNER — ${team.code}`, punditLine('corner', state, side, {}), u.ts));
        state.momentum = side === 'home' ? Math.min(1, state.momentum + 0.12) : Math.max(-1, state.momentum - 0.12);
      }
    }
  }

  // action-level moments not visible in totals
  const d = u.dataSoccer;
  if (d) {
    const action = (d.Action ?? u.action ?? '').toLowerCase();
    const side = sideOf(d.Participant, p1IsHome);
    const team = side === 'home' ? state.home : side === 'away' ? state.away : null;

    if (action === 'shot' && team && side) {
      team.shots++;
      const on = d.Outcome === 'OnTarget' || d.Outcome === 'Woodwork';
      if (d.Outcome === 'OnTarget') team.shotsOnTarget++;
      const label = d.Outcome === 'Woodwork' ? `${team.code} HIT THE WOODWORK`
        : d.Outcome === 'OnTarget' ? `BIG CHANCE — ${team.code}`
        : d.Outcome === 'Blocked' ? `SHOT BLOCKED — ${team.code}`
        : `SHOT WIDE — ${team.code}`;
      out.push(moment(state, 'shot', side, label, punditLine('shot', state, side, { outcome: d.Outcome ?? '' }), u.ts, { outcome: d.Outcome ?? '' }));
      state.momentum = side === 'home' ? Math.min(1, state.momentum + (on ? 0.2 : 0.1)) : Math.max(-1, state.momentum - (on ? 0.2 : 0.1));
    }
    if (action === 'penalty' && d.Penalty && side && team && !d.Outcome) {
      out.push(moment(state, 'penalty_awarded', side, `PENALTY TO ${team.code}!`, punditLine('penalty_awarded', state, side, {}), u.ts));
    }
    if ((action === 'penalty' || action === 'penalty_missed') && (d.Outcome === 'Missed') && side && team && state.phase !== 'PE') {
      out.push(moment(state, 'penalty_missed', side, `PENALTY MISSED — ${team.code}`, punditLine('penalty_missed', state, side, {}), u.ts));
    }
    if (action === 'var' || (d.VAR && action !== 'var_end')) {
      out.push(moment(state, 'var_start', side, `VAR CHECK${d.Type ? ` — ${String(d.Type).replace(/([A-Z])/g, ' $1').trim().toUpperCase()}` : ''}`, punditLine('var_start', state, side, { type: d.Type ?? '' }), u.ts, { type: d.Type ?? '' }));
      state.possibleEvents.var = true;
    }
    if (action === 'var_end') {
      state.possibleEvents.var = false;
      if (!chalkOff) {
        out.push(moment(state, 'var_end', side, d.Outcome === 'Overturned' ? 'VAR — OVERTURNED' : 'VAR — DECISION STANDS', punditLine('var_end', state, side, { overturned: d.Outcome === 'Overturned' }), u.ts, { outcome: d.Outcome ?? '' }));
      }
    }
    if (action === 'free_kick' && d.FreeKickType === 'Offside' && side && team) {
      out.push(moment(state, 'offside', side, `OFFSIDE — ${team.code}`, punditLine('offside', state, side, {}), u.ts));
    }
    if (action === 'free_kick' && (d.FreeKickType === 'HighDanger' || d.FreeKickType === 'Danger') && side && team) {
      out.push(moment(state, 'free_kick_danger', side, `FREE KICK IN RANGE — ${team.code}`, punditLine('free_kick_danger', state, side, {}), u.ts));
    }
    if (action === 'substitution' && side && team) {
      out.push(moment(state, 'sub', side, `SUBSTITUTION — ${team.code}`, punditLine('sub', state, side, {}), u.ts));
    }
    if (action === 'comment' && d.Text) {
      out.push(moment(state, 'comment', null, d.Text.toUpperCase(), punditLine('comment', state, null, { text: d.Text }), u.ts));
    }
  }

  state.moments.push(...out);
  if (state.moments.length > 400) state.moments.splice(0, state.moments.length - 400);
  return out;
}

// -- odds update reducer -----------------------------------------------------

/** Pick 3-way (home/draw/away) demargined percentages out of an odds payload. */
function threeWay(u: TxOdds): { home: number; draw: number; away: number } | null {
  if (!u.Pct || u.Pct.length !== 3) return null;
  const period = (u.MarketPeriod ?? '').toLowerCase();
  if (period && !/full|match|ft|regular|90/.test(period)) return null;
  const vals = u.Pct.map(p => (p === 'NA' ? NaN : parseFloat(p)));
  if (vals.some(v => !isFinite(v))) return null;
  const [home, draw, away] = vals;
  const sum = home + draw + away;
  if (sum < 90 || sum > 110) return null;
  return { home, draw, away };
}

export function applyOdds(state: MatchState, u: TxOdds): Moment[] {
  const out: Moment[] = [];
  const p = threeWay(u);
  if (!p) return out;
  state.lastUpdateTs = Math.max(state.lastUpdateTs, u.Ts);
  state.updates++;

  const prev = state.probs;
  state.probs = p;
  state.probHistory.push({ ts: u.Ts, minute: state.minute, ...p });
  if (state.probHistory.length > 2000) state.probHistory.splice(0, state.probHistory.length - 2000);

  if (prev) {
    const swingHome = p.home - prev.home;
    const swingAway = p.away - prev.away;
    const biggest = Math.max(Math.abs(swingHome), Math.abs(swingAway));
    // only flag pure market moves (goals already produce their own moments)
    const recentGoal = state.moments.slice(-6).some(m => ['goal', 'own_goal', 'penalty_goal'].includes(m.kind) && u.Ts - m.ts < 150_000);
    if (biggest >= 8 && !recentGoal && state.phase !== 'NS') {
      const side: Side = Math.abs(swingHome) >= Math.abs(swingAway)
        ? (swingHome > 0 ? 'home' : 'away')
        : (swingAway > 0 ? 'away' : 'home');
      const team = side === 'home' ? state.home : state.away;
      out.push(moment(state, 'big_swing', side,
        `MARKET SHIFT — ${team.code} ${side === 'home' ? (swingHome > 0 ? 'SURGING' : 'FADING') : (swingAway > 0 ? 'SURGING' : 'FADING')}`,
        punditLine('big_swing', state, side, { delta: biggest.toFixed(1) }), u.Ts, { delta: Math.round(biggest) }));
    }
  }

  state.moments.push(...out);
  return out;
}

// -- timeline reduction (replay & seek) ---------------------------------------

export type TimelineItem = { t: number; kind: 'score'; u: TxScores } | { t: number; kind: 'odds'; u: TxOdds };

export function buildTimeline(scores: TxScores[], odds: TxOdds[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...scores.map(u => ({ t: u.ts, kind: 'score' as const, u })),
    ...odds.map(u => ({ t: u.Ts, kind: 'odds' as const, u })),
  ];
  items.sort((a, b) => a.t - b.t);
  return items;
}

export function applyItem(state: MatchState, item: TimelineItem): Moment[] {
  return item.kind === 'score' ? applyScore(state, item.u) : applyOdds(state, item.u);
}
