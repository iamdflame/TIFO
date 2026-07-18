/**
 * TIFO — shared types between server and web client.
 *
 * TxLINE wire types (subset we consume) + TIFO's reduced MatchState.
 */

// ---------------------------------------------------------------------------
// TxLINE wire types (as returned by https://txline.txodds.com/api/*)
// ---------------------------------------------------------------------------

export interface TxFixture {
  Ts: number;
  StartTime: number;
  Competition: string;
  CompetitionId: number;
  FixtureGroupId: number;
  Participant1Id: number;
  Participant1: string;
  Participant2Id: number;
  Participant2: string;
  FixtureId: number;
  Participant1IsHome: boolean;
}

export interface TxSoccerScore {
  Goals: number;
  YellowCards: number;
  RedCards: number;
  Corners: number;
}

export interface TxSoccerTotalScore {
  H1?: TxSoccerScore;
  HT?: TxSoccerScore;
  H2?: TxSoccerScore;
  ET1?: TxSoccerScore;
  ET2?: TxSoccerScore;
  PE?: TxSoccerScore;
  ETTotal?: TxSoccerScore;
  Total?: TxSoccerScore;
}

export interface TxSoccerData {
  Action?: string;
  Corner?: boolean;
  FreeKickType?: string; // Safe | Attack | Danger | HighDanger | Offside
  Goal?: boolean;
  Minutes?: number;
  Outcome?: string; // OnTarget | OffTarget | Woodwork | Blocked | Scored | Missed | Retake | Stands | Overturned
  Participant?: number; // 1 | 2
  Penalty?: boolean;
  PlayerId?: number;
  RedCard?: boolean;
  YellowCard?: boolean;
  VAR?: boolean;
  Type?: string; // var type: Goal | Penalty | RedCard | ...
  StatusId?: number;
  Text?: string;
}

export interface TxScores {
  fixtureId: number;
  gameState: string; // NS | H1 | HT | H2 | F | WET | ET1 | HTET | ET2 | FET | WPE | PE | FPE | I | A | C | P
  startTime: number;
  isTeam: boolean;
  fixtureGroupId: number;
  competitionId: number;
  countryId: number;
  sportId: number;
  participant1IsHome: boolean;
  participant1Id: number;
  participant2Id: number;
  action: string;
  id: number;
  ts: number;
  connectionId: number;
  seq: number;
  confirmed?: boolean;
  clock?: { running: boolean; seconds: number };
  scoreSoccer?: { Participant1: TxSoccerTotalScore; Participant2: TxSoccerTotalScore };
  dataSoccer?: TxSoccerData;
  stats?: Record<string, number>;
  possession?: number; // 1 | 2
  possessionType?: string | Record<string, unknown>; // SafePossession | AttackPossession | DangerPossession | HighDangerPossession
  parti1StateSoccer?: { PossibleEvent: { Goal: boolean; Penalty: boolean; Corner: boolean } };
  parti2StateSoccer?: { PossibleEvent: { Goal: boolean; Penalty: boolean; Corner: boolean } };
  possibleEventSoccer?: { RedCard: boolean; YellowCard: boolean; VAR: boolean };
  statusSoccerId?: string | Record<string, unknown>;
  // participant names are not on score updates; joined from fixture
  participant1?: string;
  participant2?: string;
}

export interface TxOdds {
  FixtureId: number;
  MessageId: string;
  Ts: number;
  Bookmaker: string;
  BookmakerId: number;
  SuperOddsType: string;
  GameState?: string;
  InRunning: boolean;
  MarketParameters?: string;
  MarketPeriod?: string;
  PriceNames?: string[];
  Prices?: number[];
  Pct?: string[]; // demargined percentages, "52.632" strings ("NA" possible)
}

/** A recorded/merged timeline for replay: score + odds updates sorted by ts. */
export interface RecordedMatch {
  fixture: TxFixture;
  scores: TxScores[];
  odds: TxOdds[];
  meta?: { label?: string; synthetic?: boolean; note?: string };
}

// ---------------------------------------------------------------------------
// TIFO MatchState — what the engine reduces the feeds into
// ---------------------------------------------------------------------------

export type Phase =
  | 'NS' | 'H1' | 'HT' | 'H2' | 'F'
  | 'WET' | 'ET1' | 'HTET' | 'ET2' | 'FET'
  | 'WPE' | 'PE' | 'FPE'
  | 'I' | 'A' | 'C' | 'P';

export type Side = 'home' | 'away';

export type MomentKind =
  | 'kickoff' | 'phase' | 'goal' | 'own_goal' | 'penalty_goal' | 'shot'
  | 'corner' | 'yellow' | 'red' | 'penalty_awarded' | 'penalty_missed'
  | 'var_start' | 'var_end' | 'sub' | 'offside' | 'free_kick_danger'
  | 'big_swing' | 'full_time' | 'comment' | 'shootout_pen';

export interface Moment {
  id: string;
  kind: MomentKind;
  ts: number;            // wall-clock ms of the update
  minute: number;        // match minute (approx)
  side: Side | null;     // which team it belongs to (null = neutral)
  headline: string;      // short broadcast headline, e.g. "GOAL — BRAZIL"
  detail: string;        // pundit commentary line
  score: { home: number; away: number };
  probs?: { home: number; draw: number; away: number } | null;
  meta?: Record<string, string | number | boolean>;
}

export interface TeamState {
  name: string;
  id: number;
  code: string;          // 3-letter-ish display code, e.g. BRA
  goals: number;
  corners: number;
  yellows: number;
  reds: number;
  shots: number;
  shotsOnTarget: number;
  pens: number;          // shootout goals when PE
}

export interface ProbPoint {
  ts: number;
  minute: number;
  home: number;
  draw: number;
  away: number;
}

export interface MatchState {
  fixtureId: number;
  competition: string;
  startTime: number;
  phase: Phase;
  clockSeconds: number;
  clockRunning: boolean;
  minute: number;             // derived display minute
  home: TeamState;
  away: TeamState;
  /** -1 .. +1  (positive = home pressing, negative = away pressing) */
  momentum: number;
  /** 0 safe, 1 attack, 2 danger, 3 high danger */
  danger: number;
  dangerSide: Side | null;
  possibleEvents: { goal: Side | null; penalty: Side | null; corner: Side | null; var: boolean };
  probs: { home: number; draw: number; away: number } | null;
  probHistory: ProbPoint[];
  moments: Moment[];
  lastUpdateTs: number;
  source: 'live' | 'replay';
  replay?: { playing: boolean; speed: number; position: number; total: number; matchLabel?: string } | null;
  updates: number;            // number of raw TxLINE updates consumed
}

// ---------------------------------------------------------------------------
// API DTOs
// ---------------------------------------------------------------------------

export interface MatchListItem {
  fixtureId: number;
  competition: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  startTime: number;
  source: 'live' | 'replay';
  phase?: Phase;
  score?: { home: number; away: number };
  label?: string;
  synthetic?: boolean;
}

export interface ServerStatus {
  live: boolean;              // TxLINE credentials configured & healthy
  network: 'mainnet' | 'devnet' | null;
  replays: number;
  uptime: number;
}
