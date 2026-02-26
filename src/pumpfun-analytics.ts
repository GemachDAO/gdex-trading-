/**
 * Agent 6 — ANALYTICS
 * Reads trade log + positions every 30s, computes rolling stats,
 * writes a strategy report to /tmp/pumpfun-analytics.json.
 *
 * Tracks:
 *   - Overall win rate, P&L, expectancy
 *   - Win rate by score bucket, exit reason, hold time
 *   - SL overshoot (target vs actual)
 *   - Hourly performance (time-of-day effect)
 *   - Per-trade tagging: fast_dump, clean_tp, slow_bleed, ghost
 *   - Rolling 10-trade and 30-trade moving averages
 *   - Strategy signals for what to adjust
 *
 * Run standalone: ts-node src/pumpfun-analytics.ts
 */

import * as fs from 'fs';

// ─── Constants ──────────────────────────────────────────────────────────────

const POLL_MS = 30_000;
const LOG_PATH = '/tmp/pumpfun-log.json';
const POSITIONS_PATH = '/tmp/pumpfun-positions.json';
const ANALYTICS_PATH = '/tmp/pumpfun-analytics.json';
const REPORT_PATH = '/tmp/pumpfun-strategy-report.txt';

const SL_TARGET_PCT = -8;

// ─── Types ──────────────────────────────────────────────────────────────────

interface TradeLog {
  id: string;
  address: string;
  name: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  entryTime: string;
  exitTime: string;
  exitReason: 'TP' | 'SL' | 'TIME';
  solSpent: number;
  pnlSol: number;
  pnlPct: number;
  exitTxHash: string | null;
  type?: string;
}

interface Position {
  id: string;
  address: string;
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  entryTime: string;
  solSpent: number;
  status: 'open' | 'closed';
  exitStage: number;
  exitReason?: string;
  exitTxHash?: string | null;
  score: number;
}

interface TaggedTrade extends TradeLog {
  holdMs: number;
  tag: string;
  slOvershoot: number;
  score: number;
  hour: number;
}

interface BucketStats {
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnlPct: number;
  totalPnlSol: number;
}

interface Analytics {
  lastUpdated: string;
  totalTrades: number;
  swingTrades: number;
  scalpTrades: number;
  ghostPositions: number;
  overall: BucketStats;
  swing: BucketStats;
  scalp: BucketStats;
  byExitReason: Record<string, BucketStats>;
  byScoreBucket: Record<string, BucketStats>;
  byHoldTime: Record<string, BucketStats>;
  byHour: Record<string, BucketStats>;
  byTag: Record<string, BucketStats>;
  slOvershoot: {
    avgPct: number;
    medianPct: number;
    worstPct: number;
    targetPct: number;
    overshots: number;
    total: number;
  };
  rolling10: { winRate: number; avgPnlPct: number; netSol: number };
  rolling30: { winRate: number; avgPnlPct: number; netSol: number };
  expectancy: {
    perTradeSol: number;
    winAvgSol: number;
    lossAvgSol: number;
    payoffRatio: number;
  };
  signals: string[];
  taggedTrades: TaggedTrade[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(
    `[ANALYTICS ${new Date().toISOString()}] ${msg}\n`,
  );
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(path: string, data: unknown) {
  const tmp = path + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, path);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function bucketStats(trades: TradeLog[]): BucketStats {
  if (trades.length === 0) {
    return {
      count: 0, wins: 0, losses: 0,
      winRate: 0, avgPnlPct: 0, totalPnlSol: 0,
    };
  }
  const wins = trades.filter((t) => t.pnlPct > 0).length;
  const losses = trades.length - wins;
  const totalPnl = trades.reduce((s, t) => s + t.pnlSol, 0);
  const avgPnl = trades.reduce((s, t) => s + t.pnlPct, 0)
    / trades.length;
  return {
    count: trades.length,
    wins,
    losses,
    winRate: (wins / trades.length) * 100,
    avgPnlPct: avgPnl,
    totalPnlSol: totalPnl,
  };
}

// ─── Trade tagging ──────────────────────────────────────────────────────────

function tagTrade(t: TradeLog, score: number): TaggedTrade {
  const entry = new Date(t.entryTime).getTime();
  const exit = new Date(t.exitTime).getTime();
  const holdMs = exit - entry;
  const hour = new Date(t.entryTime).getUTCHours();

  let tag: string;
  if (t.exitReason === 'TP') {
    tag = holdMs < 30_000 ? 'instant_pump' : 'clean_tp';
  } else if (t.exitReason === 'TIME') {
    tag = 'timeout';
  } else {
    // SL
    if (holdMs < 15_000) {
      tag = t.pnlPct < -50 ? 'instant_rug' : 'fast_dump';
    } else if (t.pnlPct < -50) {
      tag = 'crash';
    } else if (t.pnlPct > SL_TARGET_PCT) {
      // Lost less than SL target — sold on the way down
      tag = 'clean_sl';
    } else {
      tag = 'slow_bleed';
    }
  }

  const slOvershoot =
    t.exitReason === 'SL' ? t.pnlPct - SL_TARGET_PCT : 0;

  return { ...t, holdMs, tag, slOvershoot, score, hour };
}

// ─── Score lookup from positions ────────────────────────────────────────────

function buildScoreMap(
  positions: Position[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of positions) {
    map.set(p.id, p.score ?? 0);
  }
  return map;
}

// ─── Score bucket label ─────────────────────────────────────────────────────

function scoreBucket(score: number): string {
  if (score >= 90) return '90-100';
  if (score >= 80) return '80-89';
  if (score >= 70) return '70-79';
  if (score >= 60) return '60-69';
  return '<60';
}

// ─── Hold time bucket ───────────────────────────────────────────────────────

function holdBucket(ms: number): string {
  if (ms < 10_000) return '<10s';
  if (ms < 30_000) return '10-30s';
  if (ms < 60_000) return '30s-1m';
  if (ms < 300_000) return '1-5m';
  if (ms < 1200_000) return '5-20m';
  return '>20m';
}

// ─── Main analysis ──────────────────────────────────────────────────────────

function analyze(): Analytics | null {
  const logFile = readJson<{ trades: TradeLog[] }>(
    LOG_PATH, { trades: [] },
  );
  const posFile = readJson<{ positions: Position[] }>(
    POSITIONS_PATH, { positions: [] },
  );

  const trades = logFile.trades;
  if (trades.length === 0) return null;

  const positions = posFile.positions;
  const scoreMap = buildScoreMap(positions);

  // Ghost positions: closed without exit data
  const ghosts = positions.filter(
    (p) => p.status === 'closed' && !p.exitReason && !p.exitTxHash,
  );

  // Tag every trade
  const tagged = trades.map((t) => {
    const score = scoreMap.get(t.id) ?? 0;
    return tagTrade(t, score);
  });

  // Split swing vs scalp
  const swingTrades = trades.filter((t) => !t.type);
  const scalpTrades = trades.filter((t) => t.type === 'scalp');

  // By exit reason
  const byExitReason: Record<string, BucketStats> = {};
  for (const reason of ['TP', 'SL', 'TIME']) {
    byExitReason[reason] = bucketStats(
      trades.filter((t) => t.exitReason === reason),
    );
  }

  // By score bucket
  const byScoreBucket: Record<string, BucketStats> = {};
  for (const bucket of ['90-100', '80-89', '70-79', '60-69', '<60']) {
    byScoreBucket[bucket] = bucketStats(
      tagged
        .filter((t) => scoreBucket(t.score) === bucket),
    );
  }

  // By hold time
  const byHoldTime: Record<string, BucketStats> = {};
  for (const bucket of [
    '<10s', '10-30s', '30s-1m', '1-5m', '5-20m', '>20m',
  ]) {
    byHoldTime[bucket] = bucketStats(
      tagged.filter((t) => holdBucket(t.holdMs) === bucket),
    );
  }

  // By hour (UTC)
  const byHour: Record<string, BucketStats> = {};
  const hours = [...new Set(tagged.map((t) => t.hour))].sort(
    (a, b) => a - b,
  );
  for (const h of hours) {
    byHour[`${h.toString().padStart(2, '0')}:00`] = bucketStats(
      tagged.filter((t) => t.hour === h),
    );
  }

  // By tag
  const byTag: Record<string, BucketStats> = {};
  const tags = [...new Set(tagged.map((t) => t.tag))];
  for (const tag of tags) {
    byTag[tag] = bucketStats(tagged.filter((t) => t.tag === tag));
  }

  // SL overshoot analysis
  const slTrades = tagged.filter((t) => t.exitReason === 'SL');
  const overshoots = slTrades.map((t) => t.pnlPct - SL_TARGET_PCT);
  const overshots = overshoots.filter((o) => o < -5).length;

  const slOvershoot = {
    avgPct: overshoots.length > 0
      ? overshoots.reduce((s, v) => s + v, 0) / overshoots.length
      : 0,
    medianPct: median(overshoots),
    worstPct: overshoots.length > 0 ? Math.min(...overshoots) : 0,
    targetPct: SL_TARGET_PCT,
    overshots,
    total: slTrades.length,
  };

  // Rolling windows
  const last10 = trades.slice(-10);
  const last30 = trades.slice(-30);
  const rolling10 = {
    winRate:
      last10.length > 0
        ? (last10.filter((t) => t.pnlPct > 0).length / last10.length)
          * 100
        : 0,
    avgPnlPct:
      last10.length > 0
        ? last10.reduce((s, t) => s + t.pnlPct, 0) / last10.length
        : 0,
    netSol: last10.reduce((s, t) => s + t.pnlSol, 0),
  };
  const rolling30 = {
    winRate:
      last30.length > 0
        ? (last30.filter((t) => t.pnlPct > 0).length / last30.length)
          * 100
        : 0,
    avgPnlPct:
      last30.length > 0
        ? last30.reduce((s, t) => s + t.pnlPct, 0) / last30.length
        : 0,
    netSol: last30.reduce((s, t) => s + t.pnlSol, 0),
  };

  // Expectancy
  const winTrades = trades.filter((t) => t.pnlPct > 0);
  const lossTrades = trades.filter((t) => t.pnlPct <= 0);
  const winAvgSol =
    winTrades.length > 0
      ? winTrades.reduce((s, t) => s + t.pnlSol, 0) / winTrades.length
      : 0;
  const lossAvgSol =
    lossTrades.length > 0
      ? Math.abs(
        lossTrades.reduce((s, t) => s + t.pnlSol, 0) / lossTrades.length,
      )
      : 0;
  const expectancy = {
    perTradeSol:
      trades.reduce((s, t) => s + t.pnlSol, 0) / trades.length,
    winAvgSol,
    lossAvgSol,
    payoffRatio: lossAvgSol > 0 ? winAvgSol / lossAvgSol : 0,
  };

  // Strategy signals
  const signals: string[] = [];

  if (rolling10.winRate < 25) {
    signals.push(
      `COLD_STREAK: Last 10 win rate ${rolling10.winRate.toFixed(0)}% — consider pausing or tightening filters`,
    );
  }
  if (slOvershoot.avgPct < -20) {
    signals.push(
      `SL_OVERSHOOT: Avg SL misses by ${Math.abs(slOvershoot.avgPct).toFixed(0)}% — price crashes faster than exit. Need limit sells or faster polling`,
    );
  }
  if (expectancy.payoffRatio < 1.5) {
    signals.push(
      `LOW_PAYOFF: Win/loss ratio ${expectancy.payoffRatio.toFixed(2)}x — wins not big enough to offset losses. Need tighter SL or bigger TP hold`,
    );
  }

  const instantRugs = tagged.filter((t) => t.tag === 'instant_rug');
  if (instantRugs.length >= 3) {
    signals.push(
      `INSTANT_RUGS: ${instantRugs.length} trades dumped >50% within 15s — buying tokens mid-crash. Need price trend filter (reject falling prices)`,
    );
  }

  const ghostCount = ghosts.length;
  if (ghostCount > 0) {
    const ghostSymbols = ghosts.map((g) => g.symbol).join(', ');
    signals.push(
      `GHOST_POSITIONS: ${ghostCount} positions marked closed but never sold (${ghostSymbols}). Tokens may still be in wallet`,
    );
  }

  if (scalpTrades.length >= 5) {
    const scalpWinRate =
      (scalpTrades.filter((t) => t.pnlPct > 0).length /
        scalpTrades.length) * 100;
    if (scalpWinRate < 20) {
      signals.push(
        `SCALP_UNDERPERFORM: Scalp win rate ${scalpWinRate.toFixed(0)}% — consider pausing scalper or widening TP/SL`,
      );
    }
  }

  // Check if certain score buckets are unprofitable
  for (const [bucket, stats] of Object.entries(byScoreBucket)) {
    if (stats.count >= 3 && stats.totalPnlSol < -0.005) {
      signals.push(
        `SCORE_${bucket}_LOSING: ${stats.count} trades, net ${stats.totalPnlSol.toFixed(4)} SOL. Consider raising threshold past this bucket`,
      );
    }
  }

  return {
    lastUpdated: new Date().toISOString(),
    totalTrades: trades.length,
    swingTrades: swingTrades.length,
    scalpTrades: scalpTrades.length,
    ghostPositions: ghostCount,
    overall: bucketStats(trades),
    swing: bucketStats(swingTrades),
    scalp: bucketStats(scalpTrades),
    byExitReason,
    byScoreBucket,
    byHoldTime,
    byHour,
    byTag,
    slOvershoot,
    rolling10,
    rolling30,
    expectancy,
    signals,
    taggedTrades: tagged,
  };
}

// ─── Human-readable report ──────────────────────────────────────────────────

function writeReport(a: Analytics) {
  const lines: string[] = [];
  const hr = '─'.repeat(60);

  lines.push(`PUMP.FUN STRATEGY REPORT — ${a.lastUpdated}`);
  lines.push(hr);

  lines.push('');
  lines.push('OVERALL');
  lines.push(`  Trades: ${a.totalTrades} (${a.swingTrades} swing, ${a.scalpTrades} scalp)`);
  lines.push(`  Win rate: ${a.overall.winRate.toFixed(1)}% (${a.overall.wins}W / ${a.overall.losses}L)`);
  lines.push(`  Net P&L: ${a.overall.totalPnlSol >= 0 ? '+' : ''}${a.overall.totalPnlSol.toFixed(4)} SOL`);
  lines.push(`  Avg P&L per trade: ${a.overall.avgPnlPct >= 0 ? '+' : ''}${a.overall.avgPnlPct.toFixed(1)}%`);
  lines.push(`  Ghost positions: ${a.ghostPositions}`);

  lines.push('');
  lines.push('EXPECTANCY');
  lines.push(`  Per trade: ${a.expectancy.perTradeSol >= 0 ? '+' : ''}${a.expectancy.perTradeSol.toFixed(5)} SOL`);
  lines.push(`  Avg win: +${a.expectancy.winAvgSol.toFixed(5)} SOL`);
  lines.push(`  Avg loss: -${a.expectancy.lossAvgSol.toFixed(5)} SOL`);
  lines.push(`  Payoff ratio: ${a.expectancy.payoffRatio.toFixed(2)}x`);

  lines.push('');
  lines.push('SL OVERSHOOT');
  lines.push(`  Target: ${a.slOvershoot.targetPct}%`);
  lines.push(`  Avg actual overshoot: ${a.slOvershoot.avgPct.toFixed(1)}% past target`);
  lines.push(`  Median overshoot: ${a.slOvershoot.medianPct.toFixed(1)}%`);
  lines.push(`  Worst: ${a.slOvershoot.worstPct.toFixed(1)}%`);
  lines.push(`  >13% overshoot: ${a.slOvershoot.overshots}/${a.slOvershoot.total} SL trades`);

  lines.push('');
  lines.push('ROLLING PERFORMANCE');
  lines.push(`  Last 10: ${a.rolling10.winRate.toFixed(0)}% WR, avg ${a.rolling10.avgPnlPct.toFixed(1)}%, net ${a.rolling10.netSol >= 0 ? '+' : ''}${a.rolling10.netSol.toFixed(4)} SOL`);
  lines.push(`  Last 30: ${a.rolling30.winRate.toFixed(0)}% WR, avg ${a.rolling30.avgPnlPct.toFixed(1)}%, net ${a.rolling30.netSol >= 0 ? '+' : ''}${a.rolling30.netSol.toFixed(4)} SOL`);

  lines.push('');
  lines.push('BY EXIT REASON');
  for (const [reason, stats] of Object.entries(a.byExitReason)) {
    if (stats.count === 0) continue;
    lines.push(`  ${reason}: ${stats.count} trades, ${stats.winRate.toFixed(0)}% WR, avg ${stats.avgPnlPct.toFixed(1)}%, net ${stats.totalPnlSol.toFixed(4)} SOL`);
  }

  lines.push('');
  lines.push('BY SCORE BUCKET');
  for (const [bucket, stats] of Object.entries(a.byScoreBucket)) {
    if (stats.count === 0) continue;
    lines.push(`  ${bucket}: ${stats.count} trades, ${stats.winRate.toFixed(0)}% WR, avg ${stats.avgPnlPct.toFixed(1)}%, net ${stats.totalPnlSol.toFixed(4)} SOL`);
  }

  lines.push('');
  lines.push('BY HOLD TIME');
  for (const [bucket, stats] of Object.entries(a.byHoldTime)) {
    if (stats.count === 0) continue;
    lines.push(`  ${bucket}: ${stats.count} trades, ${stats.winRate.toFixed(0)}% WR, avg ${stats.avgPnlPct.toFixed(1)}%`);
  }

  lines.push('');
  lines.push('BY TRADE TAG');
  for (const [tag, stats] of Object.entries(a.byTag)) {
    if (stats.count === 0) continue;
    lines.push(`  ${tag}: ${stats.count} trades, avg ${stats.avgPnlPct.toFixed(1)}%, net ${stats.totalPnlSol.toFixed(4)} SOL`);
  }

  lines.push('');
  lines.push('BY HOUR (UTC)');
  for (const [hour, stats] of Object.entries(a.byHour)) {
    if (stats.count === 0) continue;
    lines.push(`  ${hour}: ${stats.count} trades, ${stats.winRate.toFixed(0)}% WR, net ${stats.totalPnlSol.toFixed(4)} SOL`);
  }

  if (a.signals.length > 0) {
    lines.push('');
    lines.push('STRATEGY SIGNALS');
    for (const signal of a.signals) {
      lines.push(`  ⚠ ${signal}`);
    }
  }

  lines.push('');
  lines.push(hr);

  const report = lines.join('\n') + '\n';
  const tmp = REPORT_PATH + '.tmp';
  fs.writeFileSync(tmp, report);
  fs.renameSync(tmp, REPORT_PATH);
}

// ─── Main loop ──────────────────────────────────────────────────────────────

function run() {
  try {
    const analytics = analyze();
    if (!analytics) {
      log('No trades yet');
      return;
    }

    writeJson(ANALYTICS_PATH, analytics);
    writeReport(analytics);

    const s = analytics.overall;
    const r10 = analytics.rolling10;
    log(
      `${s.count} trades | WR ${s.winRate.toFixed(0)}% | ` +
      `Net ${s.totalPnlSol >= 0 ? '+' : ''}${s.totalPnlSol.toFixed(4)} SOL | ` +
      `R10: ${r10.winRate.toFixed(0)}% WR | ` +
      `Signals: ${analytics.signals.length}`,
    );

    if (analytics.signals.length > 0) {
      for (const signal of analytics.signals) {
        log(`  ⚠ ${signal}`);
      }
    }
  } catch (err: any) {
    log(`Error: ${err?.message ?? err}`);
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

function main() {
  log('Starting analytics...');
  run();
  const interval = setInterval(run, POLL_MS);

  const shutdown = () => {
    log('Shutting down analytics');
    clearInterval(interval);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log(`Analytics running — updating every ${POLL_MS / 1000}s`);
}

main();
