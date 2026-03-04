/**
 * pumpfun-bus.ts — WebSocket message bus for pump.fun multi-agent system.
 *
 * Architecture:
 *   pumpfun-alpha.ts starts the server via startBusServer().
 *   Each agent connects via connectBus() and gets a publish() fn.
 *   Server broadcasts every message to all other connected clients.
 *   Agents fall back to file polling if bus is unavailable.
 *
 * Latency improvement: ~30-55 s (file poll chain) → ~50-200 ms (WS push).
 */

import WebSocket, { WebSocketServer } from 'ws';

export const BUS_PORT = parseInt(process.env.PUMPFUN_BUS_PORT || '7777', 10);

// ─── Message types ──────────────────────────────────────────────────────────

export type MsgType =
  | 'REGISTER'        // agent → server: "I'm SCANNER"
  | 'TOKENS_UPDATE'   // SCANNER → all: fresh watchlist
  | 'PRICE_UPDATE'    // SCANNER → RISK, SCALPER: real-time tick data
  | 'SCORES_UPDATE'   // ANALYST → TRADER, SCALPER: scored candidates
  | 'POSITION_OPENED' // TRADER | SCALPER → RISK, ANALYTICS: new position
  | 'TRADE_COMPLETE'  // RISK → ANALYTICS, ALPHA: position closed
  | 'CIRCUIT_BREAK'   // RISK → TRADER, SCALPER: halt trading
  | 'CIRCUIT_RESUME'  // RISK → TRADER, SCALPER: resume trading
  | 'BALANCE_UPDATE'  // SCANNER → TRADER, SCALPER: live SOL balance
  | 'LOG';            // any agent → ALPHA: status text for dashboard

export interface BusMsg {
  type: MsgType;
  from: string;
  data: any;
  ts: number;
}

// Typed payloads (not enforced at runtime but documented for devs)
export interface TokensUpdateData {
  tokens: any[];
  count: number;
}

export interface PriceUpdateData {
  updates: Array<{ address: string; price: number; priceChangePct: number }>;
}

export interface ScoresUpdateData {
  scores: Record<string, { score: number; token: any }>;
}

export interface PositionOpenedData {
  positionId: string;
  tokenAddress: string;
  symbol: string;
  entryPrice: number;
  amountSol: number;
  source: 'trader' | 'scalper';
  openedAt: number;
}

export interface TradeCompleteData {
  positionId: string;
  tokenAddress: string;
  symbol: string;
  pnlPct: number;
  pnlSol: number;
  reason: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'TIME' | 'MANUAL';
  holdMs: number;
  source: 'trader' | 'scalper';
}

export interface CircuitBreakData {
  reason: string;
  consecutiveLosses: number;
}

// ─── Server ─────────────────────────────────────────────────────────────────

export interface BusServer {
  broadcast: (msg: BusMsg, excludeAgent?: string) => void;
  clientCount: () => number;
  close: () => void;
}

export function startBusServer(): BusServer {
  const clients = new Map<string, WebSocket>();
  const wss = new WebSocketServer({ port: BUS_PORT });

  wss.on('connection', (ws) => {
    let agentName = `anon-${Date.now()}`;

    ws.on('message', (raw) => {
      try {
        const msg: BusMsg = JSON.parse(raw.toString());
        if (msg.type === 'REGISTER') {
          agentName = msg.from;
          clients.set(agentName, ws);
          return;
        }
        // Broadcast to every other connected client
        const payload = raw.toString();
        for (const [name, client] of clients) {
          if (name !== agentName && client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      } catch (_) {}
    });

    ws.on('close', () => clients.delete(agentName));
    ws.on('error', () => clients.delete(agentName));
  });

  return {
    broadcast: (msg, excludeAgent) => {
      const payload = JSON.stringify(msg);
      for (const [name, client] of clients) {
        if (name !== excludeAgent && client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }
    },
    clientCount: () => clients.size,
    close: () => wss.close(),
  };
}

// ─── Client ─────────────────────────────────────────────────────────────────

export interface BusClient {
  publish: (type: MsgType, data: any) => void;
  log: (message: string) => void;
  close: () => void;
}

/**
 * Connect an agent to the message bus. Auto-reconnects on disconnect.
 * Returns a BusClient with a publish() helper.
 *
 * @param agentName  Unique name shown in dashboard (e.g. 'SCANNER')
 * @param onMessage  Called for every inbound message from other agents
 * @param timeoutMs  Max ms to wait for initial connection (default 8000)
 */
export function connectBus(
  agentName: string,
  onMessage: (msg: BusMsg) => void,
  timeoutMs = 8000
): Promise<BusClient> {
  let currentWs: WebSocket | null = null;
  let closed = false;

  // publish always uses currentWs so reconnects are transparent
  const client: BusClient = {
    publish: (type, data) => {
      if (currentWs?.readyState === WebSocket.OPEN) {
        currentWs.send(JSON.stringify({ type, from: agentName, data, ts: Date.now() }));
      }
    },
    log: (message) => {
      if (currentWs?.readyState === WebSocket.OPEN) {
        currentWs.send(JSON.stringify({
          type: 'LOG', from: agentName, data: { message }, ts: Date.now()
        }));
      }
    },
    close: () => {
      closed = true;
      currentWs?.close();
    },
  };

  function connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${BUS_PORT}`);
      const timer = setTimeout(() => reject(new Error('Bus connect timeout')), timeoutMs);

      ws.on('open', () => {
        clearTimeout(timer);
        currentWs = ws;
        ws.send(JSON.stringify({ type: 'REGISTER', from: agentName, data: null, ts: Date.now() }));
        resolve();
      });

      ws.on('message', (raw) => {
        try {
          const msg: BusMsg = JSON.parse(raw.toString());
          if (msg.type !== 'REGISTER') onMessage(msg);
        } catch (_) {}
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      ws.on('close', () => {
        currentWs = null;
        if (!closed) {
          // Reconnect with 3 s backoff — agents continue file-based fallback meanwhile
          setTimeout(() => connect().catch(() => {}), 3000);
        }
      });
    });
  }

  return connect().then(() => client);
}

/**
 * Gracefully try to connect, falling back silently on failure.
 * Returns a no-op BusClient if the bus isn't running yet.
 */
export async function tryConnectBus(
  agentName: string,
  onMessage: (msg: BusMsg) => void
): Promise<BusClient> {
  try {
    return await connectBus(agentName, onMessage, 5000);
  } catch (_) {
    console.warn(`[${agentName}] Bus unavailable — running in file-only mode`);
    return {
      publish: () => {},
      log: () => {},
      close: () => {},
    };
  }
}
