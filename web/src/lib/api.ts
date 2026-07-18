/**
 * TIFO web — API client + SSE hook.
 */
import { useEffect, useRef, useState } from 'react';
import type { MatchListItem, MatchState, Moment, ServerStatus } from '../../../shared/types';

export type { MatchListItem, MatchState, Moment, ServerStatus };

export async function fetchMatches(): Promise<MatchListItem[]> {
  const r = await fetch('/api/matches');
  if (!r.ok) throw new Error('failed to load matches');
  return r.json();
}

export async function fetchStatus(): Promise<ServerStatus> {
  const r = await fetch('/api/status');
  if (!r.ok) throw new Error('failed to load status');
  return r.json();
}

export async function replayControl(fixtureId: number, action: 'play' | 'pause' | 'seek' | 'speed' | 'restart', value?: number) {
  await fetch(`/api/match/${fixtureId}/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, value }),
  });
}

export interface StreamHandle {
  state: MatchState | null;
  connected: boolean;
  /** moments that arrived *since connect* (already-seen history is in state.moments) */
  lastMoment: Moment | null;
}

/** Subscribe to a match room over SSE. */
export function useMatchStream(fixtureId: number, onMoment?: (m: Moment) => void): StreamHandle {
  const [state, setState] = useState<MatchState | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastMoment, setLastMoment] = useState<Moment | null>(null);
  const onMomentRef = useRef(onMoment);
  onMomentRef.current = onMoment;

  useEffect(() => {
    let closed = false;
    let es: EventSource | null = null;
    let retry = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`/api/match/${fixtureId}/stream`);
      es.addEventListener('open', () => { setConnected(true); retry = 1000; });
      es.addEventListener('state', ev => {
        setState(JSON.parse((ev as MessageEvent).data) as MatchState);
      });
      es.addEventListener('moment', ev => {
        const m = JSON.parse((ev as MessageEvent).data) as Moment;
        setLastMoment(m);
        onMomentRef.current?.(m);
      });
      es.addEventListener('error', () => {
        setConnected(false);
        es?.close();
        if (!closed) {
          timer = setTimeout(connect, retry);
          retry = Math.min(retry * 2, 15_000);
        }
      });
    };
    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      es?.close();
      setState(null);
      setConnected(false);
      setLastMoment(null);
    };
  }, [fixtureId]);

  return { state, connected, lastMoment };
}
