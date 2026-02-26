/**
 * Agent 2 — ANALYST
 * Reads /tmp/pumpfun-watchlist.json every 15s, applies hard filters,
 * then scores surviving tokens 0–100.
 *
 * Hard filters (reject before scoring):
 *   mintAbility, freezeAbility, buyTax/sellTax > 5%,
 *   age > 60min, mcap < $1K
 *
 * Scoring model (100 pts max):
 *   Bonding curve   30 pts  — 85–95% graduation OR 30–70% sweet spot
 *   Transaction count 20 pts
 *   Market cap       20 pts
 *   m5 velocity      20 pts  — 5-min price change from API
 *   Security bonus   10 pts  — LP locked + low whale concentration
 *
 * Run standalone: ts-node src/pumpfun-analyst.ts
 */

import * as fs from 'fs';

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_MS = 15_000;
const SCORE_THRESHOLD = 60;
const MAX_AGE_MS = 60 * 60 * 1000;  // reject tokens older than 60 min
const WATCHLIST_PATH = '/tmp/pumpfun-watchlist.json';
const SCORES_PATH = '/tmp/pumpfun-scores.json';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenSecurities {
  mintAbility: boolean;
  freezeAbility: boolean;
  buyTax: number;
  sellTax: number;
  topHoldersPercentage: number;
  lpLockPercentage: number;
  contractVerified: number;
}

interface WatchedToken {
  address: string;
  name: string;
  symbol: string;
  price: number;
  prevPrice?: number;
  marketCap: number;
  txCount: number;
  bondingCurveProgress: number;
  isListedOnDex: boolean;
  isToken2022: boolean;
  firstSeen: string;
  securities?: TokenSecurities;
  priceChanges?: { m5: number; h1: number };
}

interface ScoreBreakdown {
  bondingCurve: number;
  txCount: number;
  marketCap: number;
  velocity: number;
  security: number;
}

interface TokenScore {
  address: string;
  name: string;
  symbol: string;
  score: number;
  breakdown: ScoreBreakdown;
  reasoning: string;
  currentPrice: number;
  prevPrice?: number;
  priceChanges?: { m5: number; h1: number };
  marketCap: number;
  txCount: number;
  bondingCurveProgress: number;
  isGraduationCandidate: boolean;
}

interface ScoresFile {
  lastUpdated: string;
  scores: TokenScore[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[ANALYST ${new Date().toISOString()}] ${msg}\n`);
}

// ─── Hard filters ─────────────────────────────────────────────────────────────
// Returns a rejection reason string, or null if the token passes.

function hardFilter(t: WatchedToken): string | null {
  // Age filter — firstSeen is scanner-relative, so only enforce max age
  const ageMs = Date.now() - new Date(t.firstSeen).getTime();
  if (ageMs > MAX_AGE_MS) {
    return `stale (${(ageMs / 60_000).toFixed(0)}min > 60min)`;
  }

  if ((t.marketCap ?? 0) < 1_000) {
    return `dead (mcap $${(t.marketCap ?? 0).toFixed(0)})`;
  }

  const sec = t.securities;
  if (sec) {
    if (sec.mintAbility) return 'mint enabled';
    if (sec.freezeAbility) return 'freeze enabled';
    if (sec.buyTax > 5) return `buy tax ${sec.buyTax}%`;
    if (sec.sellTax > 5) return `sell tax ${sec.sellTax}%`;
  }

  return null;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreToken(t: WatchedToken): TokenScore {
  const reasons: string[] = [];
  const bd: ScoreBreakdown = { bondingCurve: 0, txCount: 0, marketCap: 0, velocity: 0, security: 0 };

  // 1. Bonding curve (30 pts) — graduation imminent OR sweet spot
  const bc = t.bondingCurveProgress ?? 0;
  const isGrad = bc >= 85 && bc <= 95;
  if (isGrad) {
    bd.bondingCurve = 30;
    reasons.push(`BC ${bc.toFixed(0)}% graduation imminent (+30)`);
  } else if (bc >= 30 && bc <= 70) {
    bd.bondingCurve = 25;
    reasons.push(`BC ${bc.toFixed(0)}% sweet spot (+25)`);
  } else if ((bc >= 15 && bc < 30) || (bc > 70 && bc < 85)) {
    bd.bondingCurve = 12;
    reasons.push(`BC ${bc.toFixed(0)}% outer range (+12)`);
  } else {
    reasons.push(`BC ${bc.toFixed(0)}% outside scoring range (+0)`);
  }

  // 2. Transaction count (20 pts)
  const tx = t.txCount ?? 0;
  if (tx >= 100)     { bd.txCount = 20; reasons.push(`txCount ${tx} ≥ 100 (+20)`); }
  else if (tx >= 50) { bd.txCount = 15; reasons.push(`txCount ${tx} ≥ 50 (+15)`);  }
  else if (tx >= 20) { bd.txCount = 10; reasons.push(`txCount ${tx} ≥ 20 (+10)`);  }
  else if (tx >= 5)  { bd.txCount = 4;  reasons.push(`txCount ${tx} ≥ 5 (+4)`);    }
  else               { reasons.push(`txCount ${tx} < 5 (+0)`);                      }

  // 3. Market cap (20 pts)
  const mc = t.marketCap ?? 0;
  if (mc >= 5_000 && mc <= 80_000) {
    bd.marketCap = 20;
    reasons.push(`mcap $${(mc / 1000).toFixed(1)}K in $5K–$80K (+20)`);
  } else if ((mc >= 2_000 && mc < 5_000) || (mc > 80_000 && mc <= 200_000)) {
    bd.marketCap = 8;
    reasons.push(`mcap $${(mc / 1000).toFixed(1)}K outer range (+8)`);
  } else {
    reasons.push(`mcap $${(mc / 1000).toFixed(1)}K outside range (+0)`);
  }

  // 4. Price velocity via m5 (20 pts) — falls back to prevPrice diff if missing
  const m5 = t.priceChanges?.m5 ??
    (t.prevPrice && t.prevPrice > 0 ? ((t.price - t.prevPrice) / t.prevPrice) * 100 : 0);
  if (m5 >= 100)     { bd.velocity = 20; reasons.push(`m5 +${m5.toFixed(0)}% surge (+20)`);    }
  else if (m5 >= 30) { bd.velocity = 15; reasons.push(`m5 +${m5.toFixed(0)}% strong (+15)`);   }
  else if (m5 >= 10) { bd.velocity = 10; reasons.push(`m5 +${m5.toFixed(0)}% momentum (+10)`); }
  else if (m5 >= 3)  { bd.velocity = 5;  reasons.push(`m5 +${m5.toFixed(0)}% slight (+5)`);    }
  else               { reasons.push(`m5 ${m5.toFixed(0)}% flat/down (+0)`);                     }

  // 5. Security bonus (10 pts)
  const sec = t.securities;
  if (sec) {
    let secPts = 0;
    // LP lock (up to 5 pts) — graduated tokens on Raydium show 0%, skip
    if (t.isListedOnDex) {
      secPts += 3; // graduated = LP exists on DEX
      reasons.push('graduated (LP on DEX +3)');
    } else if (sec.lpLockPercentage >= 100) {
      secPts += 5;
      reasons.push('LP 100% locked (+5)');
    } else if (sec.lpLockPercentage >= 80) {
      secPts += 3;
      reasons.push(`LP ${sec.lpLockPercentage.toFixed(0)}% locked (+3)`);
    }
    // Low whale concentration bonus (up to 3 pts)
    if (sec.topHoldersPercentage < 50) {
      secPts += 3;
      reasons.push(`whales ${sec.topHoldersPercentage.toFixed(0)}% < 50% (+3)`);
    } else if (sec.topHoldersPercentage < 80) {
      secPts += 1;
      reasons.push(`whales ${sec.topHoldersPercentage.toFixed(0)}% < 80% (+1)`);
    }
    // Contract verified bonus (up to 2 pts)
    if (sec.contractVerified === 1) {
      secPts += 2;
      reasons.push('verified (+2)');
    }
    bd.security = Math.min(secPts, 10);
  }

  const score = bd.bondingCurve + bd.txCount + bd.marketCap + bd.velocity + bd.security;

  return {
    address: t.address,
    name: t.name,
    symbol: t.symbol,
    score,
    breakdown: bd,
    reasoning: reasons.join('; '),
    currentPrice: t.price,
    prevPrice: t.prevPrice,
    priceChanges: t.priceChanges,
    marketCap: mc,
    txCount: tx,
    bondingCurveProgress: bc,
    isGraduationCandidate: isGrad,
  };
}

// ─── Main loop ────────────────────────────────────────────────────────────────

function analyze() {
  try {
    if (!fs.existsSync(WATCHLIST_PATH)) {
      log('Watchlist not ready yet, waiting...');
      return;
    }

    const wl = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));
    const tokens: WatchedToken[] = wl.tokens ?? [];

    if (tokens.length === 0) {
      log('Watchlist empty, nothing to score');
      return;
    }

    let rejected = 0;
    const rejectReasons = new Map<string, number>();
    const scores: TokenScore[] = [];

    for (const t of tokens) {
      const rejection = hardFilter(t);
      if (rejection) {
        rejected++;
        rejectReasons.set(rejection, (rejectReasons.get(rejection) ?? 0) + 1);
        continue;
      }
      scores.push(scoreToken(t));
    }

    if (scores.length === 0 && rejected > 0) {
      const topReasons = [...rejectReasons.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([r, n]) => `${r} (${n})`)
        .join(', ');
      log(`All ${rejected} tokens filtered — reasons: ${topReasons}`);
    }

    scores.sort((a, b) => b.score - a.score);

    const output: ScoresFile = { lastUpdated: new Date().toISOString(), scores };
    const tmp = SCORES_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(output, null, 2));
    fs.renameSync(tmp, SCORES_PATH);

    const top3 = scores.slice(0, 3).map((s) => `${s.symbol}:${s.score}`).join(', ');
    const hot = scores.filter((s) => s.score >= SCORE_THRESHOLD).length;
    const grads = scores.filter((s) => s.isGraduationCandidate).length;
    log(
      `Scored ${scores.length}/${tokens.length} tokens (${rejected} filtered) ` +
      `| top3: [${top3}] | >${SCORE_THRESHOLD}pts: ${hot} | grads: ${grads}`
    );
  } catch (err: any) {
    log(`Analyze error: ${err?.message ?? err}`);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function main() {
  log('Starting analyst...');
  analyze();
  const interval = setInterval(analyze, POLL_MS);

  const shutdown = () => {
    log('Shutting down analyst');
    clearInterval(interval);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log(`Analyst running — scoring every ${POLL_MS / 1000}s | hard filters active`);
}

main();
