/**
 * TxLINE API client.
 *
 * Wraps the TxLINE off-chain API: guest JWT lifecycle (30-day expiry, renewed
 * on 401), snapshot + historical REST endpoints, and hand-rolled SSE
 * consumption with automatic reconnect + Last-Event-ID resume.
 *
 * Endpoints used (see docs/TECHNICAL.md):
 *   POST /auth/guest/start
 *   GET  /api/fixtures/snapshot?competitionId&startEpochDay
 *   GET  /api/scores/snapshot/{fixtureId}
 *   GET  /api/scores/updates/{fixtureId}
 *   GET  /api/scores/historical/{fixtureId}
 *   GET  /api/scores/stream?fixtureId          (SSE)
 *   GET  /api/odds/snapshot/{fixtureId}
 *   GET  /api/odds/stream?fixtureId            (SSE)
 */

import type { TxFixture, TxOdds, TxScores } from '../shared/types.js';

export interface TxLineConfig {
  origin: string;      // https://txline.txodds.com | https://txline-dev.txodds.com
  apiToken: string;    // long-lived token from /api/token/activate
  jwt?: string;        // optional pre-acquired guest JWT
}

interface SseMessage { id?: string; event?: string; data: string }

export class TxLineClient {
  private jwt: string | null;
  private jwtPromise: Promise<string> | null = null;
  readonly origin: string;
  private apiToken: string;
  private closed = false;

  constructor(cfg: TxLineConfig) {
    this.origin = cfg.origin.replace(/\/$/, '');
    this.apiToken = cfg.apiToken;
    this.jwt = cfg.jwt ?? null;
  }

  close() { this.closed = true; }

  // -- auth -------------------------------------------------------------------

  private async getJwt(force = false): Promise<string> {
    if (this.jwt && !force) return this.jwt;
    if (!this.jwtPromise) {
      this.jwtPromise = (async () => {
        const res = await fetch(`${this.origin}/auth/guest/start`, { method: 'POST' });
        if (!res.ok) throw new Error(`guest/start failed: ${res.status}`);
        const body = await res.json() as { token: string };
        this.jwt = body.token;
        this.jwtPromise = null;
        return this.jwt;
      })().catch(err => { this.jwtPromise = null; throw err; });
    }
    return this.jwtPromise;
  }

  private async headers(force = false): Promise<Record<string, string>> {
    const jwt = await this.getJwt(force);
    return { Authorization: `Bearer ${jwt}`, 'X-Api-Token': this.apiToken };
  }

  private async get<T>(path: string): Promise<T> {
    let res = await fetch(`${this.origin}/api${path}`, { headers: await this.headers() });
    if (res.status === 401) {
      res = await fetch(`${this.origin}/api${path}`, { headers: await this.headers(true) });
    }
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<T>;
  }

  // -- REST ---------------------------------------------------------------------

  fixturesSnapshot(competitionId?: number, startEpochDay?: number): Promise<TxFixture[]> {
    const q = new URLSearchParams();
    if (competitionId != null) q.set('competitionId', String(competitionId));
    if (startEpochDay != null) q.set('startEpochDay', String(startEpochDay));
    const qs = q.toString();
    return this.get<TxFixture[]>(`/fixtures/snapshot${qs ? `?${qs}` : ''}`);
  }

  scoresSnapshot(fixtureId: number): Promise<TxScores[]> {
    return this.get<TxScores[]>(`/scores/snapshot/${fixtureId}`);
  }

  scoresUpdates(fixtureId: number): Promise<TxScores[]> {
    return this.get<TxScores[]>(`/scores/updates/${fixtureId}`);
  }

  scoresHistorical(fixtureId: number): Promise<TxScores[]> {
    return this.get<TxScores[]>(`/scores/historical/${fixtureId}`);
  }

  oddsSnapshot(fixtureId: number, asOf?: number): Promise<TxOdds[]> {
    return this.get<TxOdds[]>(`/odds/snapshot/${fixtureId}${asOf ? `?asOf=${asOf}` : ''}`);
  }

  oddsUpdates(fixtureId: number): Promise<TxOdds[]> {
    return this.get<TxOdds[]>(`/odds/updates/${fixtureId}`);
  }

  async health(): Promise<boolean> {
    try {
      const today = Math.floor(Date.now() / 86_400_000);
      await this.fixturesSnapshot(undefined, today);
      return true;
    } catch {
      return false;
    }
  }

  // -- SSE ------------------------------------------------------------------------

  /**
   * Consume an SSE stream with auto-reconnect. Returns a stop function.
   */
  stream(
    path: 'scores' | 'odds',
    fixtureId: number | undefined,
    onData: (obj: unknown) => void,
    onStatus?: (s: string) => void,
  ): () => void {
    let stopped = false;
    let lastEventId: string | undefined;
    let backoff = 1_000;
    let abort: AbortController | null = null;

    const run = async () => {
      while (!stopped && !this.closed) {
        try {
          const q = fixtureId != null ? `?fixtureId=${fixtureId}` : '';
          const h = await this.headers();
          abort = new AbortController();
          const res = await fetch(`${this.origin}/api/${path}/stream${q}`, {
            headers: {
              ...h,
              Accept: 'text/event-stream',
              'Cache-Control': 'no-cache',
              ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
            },
            signal: abort.signal,
          });
          if (res.status === 401) { await this.getJwt(true); continue; }
          if (!res.ok || !res.body) throw new Error(`stream ${path} -> ${res.status}`);
          onStatus?.(`connected`);
          backoff = 1_000;

          for await (const msg of readSse(res.body)) {
            if (stopped) break;
            if (msg.id) lastEventId = msg.id;
            if (msg.event === 'heartbeat') continue;
            if (!msg.data) continue;
            try { onData(JSON.parse(msg.data)); } catch { /* non-JSON keepalive */ }
          }
          onStatus?.('disconnected');
        } catch (err) {
          if (stopped) break;
          onStatus?.(`error: ${(err as Error).message}`);
        }
        if (stopped) break;
        await new Promise(r => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 30_000);
      }
    };
    void run();

    return () => { stopped = true; abort?.abort(); };
  }
}

// -- minimal SSE parser (per WHATWG event-stream format) -------------------------

async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep: RegExpMatchArray | null;
      while ((sep = buf.match(/\r?\n\r?\n/)) && sep.index !== undefined) {
        const block = buf.slice(0, sep.index);
        buf = buf.slice(sep.index + sep[0].length);
        const msg = parseBlock(block);
        if (msg) yield msg;
      }
    }
    const tail = parseBlock(buf);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): SseMessage | null {
  const msg: SseMessage = { data: '' };
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const i = line.indexOf(':');
    const field = i === -1 ? line : line.slice(0, i);
    const value = i === -1 ? '' : line.slice(i + 1).replace(/^ /, '');
    if (field === 'data') msg.data += value + '\n';
    else if (field === 'event') msg.event = value;
    else if (field === 'id') msg.id = value;
  }
  msg.data = msg.data.replace(/\n$/, '');
  return msg.data || msg.event || msg.id ? msg : null;
}
