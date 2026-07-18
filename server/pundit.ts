/**
 * TIFO pundit engine.
 *
 * Deterministic, market-aware radio commentary. No external LLM: lines render
 * instantly, offline, and identically on replay — and every line can weave in
 * what the TxLINE market is thinking right now.
 */

import type { MatchState, MomentKind, Side } from '../shared/types.js';

// deterministic PRNG so replays produce identical commentary
let seed = 0x5eed;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(arr: T[]): T { return arr[Math.floor(rnd() * arr.length) % arr.length]; }

function marketLine(state: MatchState): string {
  const p = state.probs;
  if (!p) return '';
  const fav = p.home > p.away ? state.home : state.away;
  const favP = Math.max(p.home, p.away);
  if (Math.abs(p.home - p.away) < 6) {
    return ` The market can't split them — ${state.home.code} ${p.home.toFixed(0)}%, draw ${p.draw.toFixed(0)}%, ${state.away.code} ${p.away.toFixed(0)}%.`;
  }
  return ` The market now makes ${fav.name} ${favP.toFixed(0)}% favourites.`;
}

function scoreline(state: MatchState): string {
  return `${state.home.code} ${state.home.goals}–${state.away.goals} ${state.away.code}`;
}

export function punditLine(kind: MomentKind, state: MatchState, side: Side | null, ctx: Record<string, unknown>): string {
  const team = side === 'home' ? state.home : side === 'away' ? state.away : null;
  const other = side === 'home' ? state.away : state.home;
  const min = state.minute;

  switch (kind) {
    case 'kickoff':
      return pick([
        `We're off. ${state.home.name} against ${state.away.name} — ${state.competition}.`,
        `The referee's whistle gets us started. ${state.home.name} v ${state.away.name}. Settle in.`,
      ]) + marketLine(state);

    case 'phase': {
      const ph = String(ctx.phase ?? '');
      if (ph === 'HT') return `Half-time: ${scoreline(state)}.` + marketLine(state);
      if (ph === 'H2') return pick([`Second half underway. ${scoreline(state)}.`, `Back out for the second half — still ${scoreline(state)}.`]);
      if (ph === 'ET1') return `Extra time. Thirty more minutes with ${scoreline(state)} on the board.` + marketLine(state);
      if (ph === 'PE') return `Penalties. ${scoreline(state)} after ${min} minutes — now it's nerve against nerve.`;
      if (ph === 'I') return `Play has been interrupted. We'll bring you more as we get it.`;
      return `The match moves on: ${scoreline(state)}.`;
    }

    case 'goal':
      return pick([
        `${team!.name} score! ${scoreline(state)} in the ${min}'.`,
        `It's in! ${team!.name} strike in the ${min}' — ${scoreline(state)}.`,
        `${team!.name} find the net. ${min} minutes gone, ${scoreline(state)}.`,
      ]) + marketLine(state);

    case 'own_goal':
      return `Disaster for ${other.name} — an own goal gifts it to ${team!.name}. ${scoreline(state)}.` + marketLine(state);

    case 'penalty_goal':
      return pick([
        `Cool as you like from the spot. ${team!.name} convert — ${scoreline(state)}.`,
        `No mistake from twelve yards. ${team!.name} score — ${scoreline(state)}.`,
      ]) + marketLine(state);

    case 'penalty_awarded':
      return pick([
        `Penalty to ${team!.name}! The stadium holds its breath.`,
        `The referee points to the spot — huge moment for ${team!.name}.`,
      ]);

    case 'penalty_missed':
      return `Missed! ${team!.name} pass up the chance from the spot. Still ${scoreline(state)}.` + marketLine(state);

    case 'shootout_pen':
      return pick([
        `${team!.name} convert in the shootout — ${state.home.pens}–${state.away.pens} on pens.`,
        `Buried. ${team!.name} make it ${state.home.pens}–${state.away.pens} in the shootout.`,
      ]);

    case 'shot': {
      const o = String(ctx.outcome ?? '');
      if (o === 'Woodwork') return pick([
        `Off the woodwork! ${team!.name} are millimetres away.`,
        `The frame of the goal saves ${other.name}! So close for ${team!.name}.`,
      ]);
      if (o === 'OnTarget') return pick([
        `Big save! ${team!.name} force the keeper into action in the ${min}'.`,
        `${team!.name} test the goalkeeper — that needed dealing with.`,
      ]);
      if (o === 'Blocked') return `Thrown bodies — ${other.name} block the effort from ${team!.name}.`;
      return pick([
        `${team!.name} let fly but it drifts wide.`,
        `Off target from ${team!.name}. The pressure is building though.`,
      ]);
    }

    case 'corner':
      return pick([
        `Corner ${team!.name} — that's ${team!.corners} of them now.`,
        `${team!.name} win another corner. Delivery incoming.`,
      ]);

    case 'yellow':
      return pick([
        `Into the book — a yellow for ${team!.name}. That's ${team!.yellows} for them today.`,
        `The referee reaches for a card. Yellow, ${team!.name}.`,
      ]);

    case 'red':
      return pick([
        `RED CARD! ${team!.name} are down to ${11 - team!.reds} men. This changes everything.`,
        `Off! A red card for ${team!.name} in the ${min}' — the complexion of this match just flipped.`,
      ]) + marketLine(state);

    case 'var_start': {
      const type = String(ctx.type ?? '').replace(/([A-Z])/g, ' $1').trim();
      return pick([
        `Hold everything — VAR is having a look${type ? ` at a possible ${type.toLowerCase()}` : ''}.`,
        `The referee has a finger to the earpiece. VAR check${type ? `: ${type.toLowerCase()}` : ''}.`,
      ]);
    }

    case 'var_end':
      return ctx.overturned
        ? `Overturned! The decision is reversed — chaos here.` + marketLine(state)
        : `The decision stands. On we go — ${scoreline(state)}.`;

    case 'offside':
      return `The flag is up. ${team!.name} stray offside.`;

    case 'free_kick_danger':
      return pick([
        `Free kick in shooting range for ${team!.name}. Wall being built.`,
        `Dangerous territory — ${team!.name} stand over this one.`,
      ]);

    case 'sub':
      return `Fresh legs for ${team!.name}.`;

    case 'big_swing':
      return pick([
        `The money is moving — a ${ctx.delta}-point probability swing towards ${team!.name}. Sharp eyes see something.`,
        `Watch the market: ${team!.name} just jumped ${ctx.delta} points. Something is happening out there.`,
      ]);

    case 'full_time': {
      const w = state.home.goals > state.away.goals ? state.home : state.away.goals > state.home.goals ? state.away : null;
      const pw = state.home.pens > state.away.pens ? state.home : state.away.pens > state.home.pens ? state.away : null;
      if (state.phase === 'FPE' && pw) return `${pw.name} win it on penalties! ${scoreline(state)} (${state.home.pens}–${state.away.pens} on pens). Unforgettable.`;
      if (w) return `Full-time: ${scoreline(state)}. ${w.name} take it.`;
      return `Full-time: ${scoreline(state)}. Honours even.`;
    }

    case 'comment':
      return String(ctx.text ?? 'Update from the pitch.');

    default:
      return scoreline(state);
  }
}
