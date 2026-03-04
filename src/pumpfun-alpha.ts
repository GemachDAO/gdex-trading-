/**
 * PUMP.FUN ALPHA HUNTER — Lead Orchestrator + Live Dashboard
 *
 * Spawns 6 agents as child processes:
 *   • Agent 1 — SCANNER   (pumpfun-scanner.ts)
 *   • Agent 2 — ANALYST   (pumpfun-analyst.ts)
 *   • Agent 3 — TRADER    (pumpfun-trader.ts)
 *   • Agent 4 — RISK MGR  (pumpfun-risk.ts)
 *   • Agent 5 — SCALPER   (pumpfun-scalper.ts)
 *   • Agent 6 — ANALYTICS (pumpfun-analytics.ts)
 *
 * Renders a live ASCII terminal dashboard every 10s showing:
 *   - Active watchlist
 *   - Scores
 *   - Open positions with unrealized P&L
 *   - Closed trades with realized P&L
 *   - Win rate
 *
 * Usage: npm run pumpfun:alpha
 *        ts-node src/pumpfun-alpha.ts
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { startBusServer, BUS_PORT } from './pumpfun-bus';

// ─── Constants ────────────────────────────────────────────────────────────────

const RENDER_MS = 10_000;
const WATCHLIST_PATH = '/tmp/pumpfun-watchlist.json';
const SCORES_PATH = '/tmp/pumpfun-scores.json';
const POSITIONS_PATH = '/tmp/pumpfun-positions.json';
const SCALP_POSITIONS_PATH = '/tmp/pumpfun-scalp-positions.json';
const LOG_PATH = '/tmp/pumpfun-log.json';
const ANALYTICS_PATH = '/tmp/pumpfun-analytics.json';
const BALANCE_PATH = '/tmp/pumpfun-balance.json';
const AGENT_LOG_PATH = '/tmp/pumpfun-agents.log';
const SRC_DIR = path.join(__dirname);

// ─── ANSI colors / helpers ────────────────────────────────────────────────────

const E = '\x1b[';
const RST = `${E}0m`;
const BOLD = `${E}1m`;
const DIM = `${E}2m`;
const RED = `${E}31m`;
const GRN = `${E}32m`;
const YEL = `${E}33m`;
const BLU = `${E}34m`;
const MAG = `${E}35m`;
const CYN = `${E}36m`;
const WHT = `${E}37m`;
const HOME = `${E}H`;
const CLREOL = `${E}K`;
const HIDE_CURSOR = `${E}?25l`;
const SHOW_CURSOR = `${E}?25h`;
const ALT_SCREEN_ON = `${E}?1049h`;
const ALT_SCREEN_OFF = `${E}?1049l`;

function c(text: string, col: string) { return `${col}${text}${RST}`; }
// Strip ANSI escape codes to measure visible character width
function stripAnsi(s: string): string { return s.replace(/\x1b\[[0-9;]*m/g, ''); }
function vlen(s: string): number { return stripAnsi(s).length; }
// pad/rpad/trunc operate on plain (no-ANSI) strings — used for plain text columns
function pad(s: string, n: number): string { return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }
function rpad(s: string, n: number): string { return s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s; }
function trunc(s: string, n: number): string { return s.length <= n ? s : s.slice(0, n - 1) + '…'; }
// padV: right-pad a string that may contain ANSI codes using visible length
function padV(s: string, n: number): string { const v = vlen(s); return v >= n ? s : s + ' '.repeat(n - v); }
// truncAnsi: truncate a string with ANSI codes to n visible characters
function truncAnsi(s: string, n: number): string {
  let vis = 0;
  let i = 0;
  while (i < s.length && vis < n) {
    if (s[i] === '\x1b') {
      const end = s.indexOf('m', i);
      if (end !== -1) { i = end + 1; continue; }
    }
    vis++;
    i++;
  }
  // Include any trailing ANSI sequences (resets) right after the cut point
  while (i < s.length && s[i] === '\x1b') {
    const end = s.indexOf('m', i);
    if (end !== -1) { i = end + 1; } else { break; }
  }
  return s.slice(0, i);
}

function fmtPrice(n: number | undefined): string {
  if (!n) return '—';
  if (n >= 1) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  const s = n.toFixed(12);
  const m = s.match(/^0\.(0*)(\d+)/);
  if (m) return `$0.0{${m[1].length}}${m[2].slice(0, 4)}`;
  return `$${n.toExponential(2)}`;
}

function fmtMcap(n: number | undefined): string {
  if (!n) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  const s = `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
  return n >= 0 ? c(rpad(s, 7), GRN) : c(rpad(s, 7), RED);
}

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

function fmtAgeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}

// ─── Data readers ─────────────────────────────────────────────────────────────

function safeRead(filePath: string): any {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readTailLines(filePath: string, n: number): string[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const buf = Buffer.alloc(8192);
    const fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    const readLen = Math.min(stat.size, 8192);
    fs.readSync(fd, buf, 0, readLen, stat.size - readLen);
    fs.closeSync(fd);
    const text = buf.toString('utf8', 0, readLen);
    const all = text.split('\n').filter(Boolean);
    return all.slice(-n);
  } catch {
    return [];
  }
}

// ─── Box drawing ──────────────────────────────────────────────────────────────

let WIDTH = 110;

function hLine(left: string, fill: string, right: string, title?: string): string {
  if (title) {
    const t = ` ${title} `;
    const sides = WIDTH - 2 - t.length;
    const l = Math.floor(sides / 2);
    const r = sides - l;
    return left + fill.repeat(l) + c(t, `${BOLD}${YEL}`) + fill.repeat(r) + right;
  }
  return left + fill.repeat(WIDTH - 2) + right;
}

function row(content: string): string {
  return `│ ${content} │`;
}

function blank(): string {
  return `│${' '.repeat(WIDTH - 2)}│`;
}

// Centers a plain (no-ANSI) string inside a box row, then applies color.
function centerRow(s: string, col: string): string {
  const inner = WIDTH - 4;
  const left = Math.floor((inner - s.length) / 2);
  const right = inner - s.length - left;
  return `│ ${' '.repeat(left)}${c(s, col)}${' '.repeat(right)} │`;
}

// ─── Splash art ───────────────────────────────────────────────────────────────

const GDEX_PRO_ROWS = [
  ' ██████╗ ██████╗ ███████╗██╗  ██╗   ██████╗ ██████╗  ██████╗ ',
  '██╔════╝ ██╔══██╗██╔════╝╚██╗██╔╝   ██╔══██╗██╔══██╗██╔═══██╗',
  '██║  ███╗██║  ██║█████╗   ╚███╔╝    ██████╔╝██████╔╝██║   ██║',
  '██║   ██║██║  ██║██╔══╝   ██╔██╗    ██╔═══╝ ██╔══██╗██║   ██║',
  '╚██████╔╝██████╔╝███████╗██╔╝ ██╗█  ██║     ██║  ██║╚██████╔╝',
  ' ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ',
];

const LOCK_IN_ROWS = [
  '██╗      ██████╗  ██████╗██╗  ██╗    ██╗███╗   ██╗',
  '██║     ██╔═══██╗██╔════╝██║ ██╔╝    ██║████╗  ██║',
  '██║     ██║   ██║██║     █████╔╝     ██║██╔██╗ ██║',
  '██║     ██║   ██║██║     ██╔═██╗     ██║██║╚██╗██║',
  '███████╗╚██████╔╝╚██████╗██║  ██╗    ██║██║ ╚████║',
  '╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝    ╚═╝╚═╝  ╚═══╝',
];

// ─── Dashboard render ─────────────────────────────────────────────────────────

function renderDashboard() {
  // Adapt to current terminal dimensions
  const termCols = process.stdout.columns || 110;
  const termRows = process.stdout.rows || 40;
  WIDTH = Math.max(80, Math.min(termCols, 200));

  const wl = safeRead(WATCHLIST_PATH);
  const sc = safeRead(SCORES_PATH);
  const pos = safeRead(POSITIONS_PATH);
  const scalp = safeRead(SCALP_POSITIONS_PATH);
  const logData = safeRead(LOG_PATH);
  const balData = safeRead(BALANCE_PATH);

  const tokens: any[] = wl?.tokens ?? [];
  const scores: any[] = sc?.scores ?? [];
  const positions: any[] = pos?.positions ?? [];
  const scalpPositions: any[] = scalp?.positions ?? [];
  const trades: any[] = logData?.trades ?? [];
  const custodialAddr: string | null = balData?.custodialAddress ?? null;

  const openPos = positions.filter((p: any) => p.status === 'open');
  const openScalps = scalpPositions.filter((p: any) => p.status === 'open');

  const wins = trades.filter((t: any) => t.pnlPct >= 0).length;
  const winRate = trades.length > 0
    ? ((wins / trades.length) * 100).toFixed(0) : '—';
  const totalPnl = trades.reduce(
    (acc: number, t: any) => acc + (t.pnlSol ?? 0), 0,
  );

  // ── Dynamic layout based on actual terminal size and data ──────────────────
  // Fixed chrome: borders, section headers, column headers = 19 lines
  // Splash art = 15 lines   Positions/scalps show all (min 1 each)
  const CHROME = 19;
  const SPLASH_COST = 15;
  const posRows = Math.max(1, openPos.length);
  const scalpRows = Math.max(1, openScalps.length);

  // Pre-check analytics line count
  let analyticsRows = 0;
  try {
    if (fs.existsSync(ANALYTICS_PATH)) {
      const aCheck = JSON.parse(fs.readFileSync(ANALYTICS_PATH, 'utf8'));
      if (aCheck && aCheck.totalTrades > 0) {
        analyticsRows = 2 + Math.min(3, aCheck.signals?.length ?? 0);
      }
    }
  } catch { /* not ready */ }

  let available = termRows - CHROME - posRows - scalpRows;

  // Show splash if it fits with at least 8 flex rows left
  const showSplash = (available - SPLASH_COST - analyticsRows) >= 8;
  if (showSplash) available -= SPLASH_COST;

  // Show analytics if we still have room
  const showAnalytics = analyticsRows > 0
    && (available - analyticsRows) >= 6;
  if (showAnalytics) available -= analyticsRows;

  // Distribute remaining among watchlist, scores, trades, agent logs
  const flex = Math.max(4, available);
  const watchMax = Math.max(1, Math.min(10, Math.round(flex * 0.28)));
  const scoreMax = Math.max(1, Math.min(8, Math.round(flex * 0.18)));
  const tradeMax = Math.max(1, Math.min(8, Math.round(flex * 0.22)));
  // Agent logs absorb all remaining space
  const logRows = Math.max(2, flex - watchMax - scoreMax - tradeMax);

  // ── Build frame ────────────────────────────────────────────────────────────
  const lines: string[] = [];

  // ── Splash ─────────────────────────────────────────────────────────────────
  lines.push(c(hLine('╔', '═', '╗'), CYN));
  if (showSplash) {
    lines.push(blank());
    for (const artRow of GDEX_PRO_ROWS) {
      lines.push(centerRow(artRow, `${BOLD}${YEL}`));
    }
    lines.push(blank());
    for (const artRow of LOCK_IN_ROWS) {
      lines.push(centerRow(artRow, `${BOLD}${GRN}`));
    }
    lines.push(blank());
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  lines.push(c(hLine('╠', '═', '╣', '🚀 PUMP.FUN ALPHA HUNTER'), CYN));
  const now = new Date().toLocaleTimeString();
  const busCount = busClientCount();
  const busStatus = busCount >= 5
    ? c(`bus:${busCount}/6`, GRN)
    : busCount > 0
      ? c(`bus:${busCount}/6`, YEL)
      : c('bus:offline', RED);
  const status =
    `${c('SCANNER', GRN)} ${c('ANALYST', YEL)} ${c('TRADER', MAG)} ` +
    `${c('RISK', RED)} ${c('SCALPER', CYN)}  |  ${busStatus}  |  ${c(now, DIM)}`;
  lines.push(
    c('║', CYN) + ' ' +
    padV(`Agents: ${status}`, WIDTH - 4) +
    ' ' + c('║', CYN),
  );

  const addrDisplay = custodialAddr
    ? c(custodialAddr, `${BOLD}${CYN}`) + c('  ← fund here', DIM)
    : c('waiting for scanner...', DIM);
  lines.push(
    c('║', CYN) + ' ' +
    padV(`Solana Wallet: ${addrDisplay}`, WIDTH - 4) +
    ' ' + c('║', CYN),
  );

  // Balance row — prefer the pre-computed solBalance field if present
  const holdings: any[] = balData?.holdings ?? [];
  let solBal: number | null =
    typeof balData?.solBalance === 'number' ? balData.solBalance : null;
  let portfolioUsd = 0;
  let tokenCount = 0;
  for (const h of holdings) {
    const sym = ((h.symbol ?? h.name ?? '') as string).toUpperCase();
    const bal = parseFloat(
      h.balance ?? h.amount ?? h.nativeBalance ?? '0',
    ) || 0;
    const usd = parseFloat(
      h.valueUsd ?? h.usdValue ?? h.value ?? '0',
    ) || 0;
    if (sym === 'SOL' || h.isNative) solBal = (solBal ?? 0) + bal;
    portfolioUsd += usd;
    if (bal > 0) tokenCount++;
  }
  const deployed = openPos.reduce(
    (s: number, p: any) => s + (p.solSpent ?? 0), 0,
  );
  const balParts: string[] = [];
  if (solBal !== null) {
    balParts.push(
      c('SOL:', DIM) + c(` ${solBal.toFixed(4)}`, `${BOLD}${WHT}`),
    );
  }
  if (portfolioUsd > 0) {
    balParts.push(
      c('Value:', DIM) +
      c(` $${portfolioUsd.toFixed(2)}`, `${BOLD}${GRN}`),
    );
  }
  balParts.push(
    c('Deployed:', DIM) + c(` ${deployed.toFixed(4)} SOL`, YEL),
  );
  balParts.push(
    c('Realized:', DIM) +
    (totalPnl >= 0
      ? c(` +${totalPnl.toFixed(4)} SOL`, GRN)
      : c(` ${totalPnl.toFixed(4)} SOL`, RED)),
  );
  if (tokenCount > 0) {
    balParts.push(c('Tokens:', DIM) + c(` ${tokenCount}`, WHT));
  }
  if (holdings.length === 0 && balData) {
    balParts.push(c('(holdings loading...)', DIM));
  }
  const balLine = balParts.join(c('  |  ', DIM));
  lines.push(
    c('║', CYN) + ' ' +
    padV(`Balance: ${balLine}`, WIDTH - 4) +
    ' ' + c('║', CYN),
  );

  // ── Low SOL warning ────────────────────────────────────────────────────────
  // Warn when SOL is too low to safely open more positions
  if (solBal !== null) {
    const openPosCount = openPos.length + openScalps.length;
    const gasNeeded = 0.003 * (openPosCount + 1) + 0.005; // reserve for exits + floor
    if (solBal < gasNeeded + 0.005) {
      const warnMsg =
        c('⚠  LOW SOL: ', `${BOLD}${RED}`) +
        c(`${solBal.toFixed(4)} SOL`, `${BOLD}${WHT}`) +
        c(' — top up ', DIM) +
        c(custodialAddr ?? 'custodial wallet', YEL) +
        c(' or buys will be blocked', DIM);
      lines.push(
        c('║', CYN) + ' ' +
        padV(warnMsg, WIDTH - 4) +
        ' ' + c('║', CYN),
      );
    }
  }

  lines.push(c(hLine('╠', '═', '╣'), CYN));

  // ── Stats bar ──────────────────────────────────────────────────────────────
  const statsBar = [
    c('Watchlist:', DIM) + c(` ${tokens.length}`, WHT),
    c('  Hot (>60):', DIM) +
      c(` ${scores.filter((s: any) => s.score > 60).length}`, YEL),
    c('  Swing:', DIM) + c(` ${openPos.length}`, MAG),
    c('  Scalps:', DIM) + c(` ${openScalps.length}`, CYN),
    c('  Win Rate:', DIM) +
      c(` ${winRate}%`,
        winRate !== '—' && parseInt(winRate) >= 50 ? GRN : RED),
    c('  P&L:', DIM) +
      (totalPnl >= 0
        ? c(` +${totalPnl.toFixed(4)} SOL`, GRN)
        : c(` ${totalPnl.toFixed(4)} SOL`, RED)),
  ].join('');
  lines.push(row(padV(statsBar, WIDTH - 4)));

  // ── Watchlist ──────────────────────────────────────────────────────────────
  lines.push(
    c(hLine('╠', '─', '╣',
      ` 📡 WATCHLIST (top ${watchMax} by txCount) `), CYN),
  );
  const watchHeader = padV(
    `  ${c(pad('SYMBOL', 10), BOLD)}  ${c(pad('NAME', 18), BOLD)}` +
    `  ${c(rpad('PRICE', 14), BOLD)}  ${c(rpad('MCAP', 10), BOLD)}` +
    `  ${c(rpad('TX', 6), BOLD)}  ${c(rpad('BC%', 6), BOLD)}` +
    `  ${c(rpad('AGE', 6), BOLD)}`,
    WIDTH - 4,
  );
  lines.push(row(watchHeader));

  const topWatchlist = [...tokens]
    .sort((a: any, b: any) => (b.txCount ?? 0) - (a.txCount ?? 0))
    .slice(0, watchMax);

  if (topWatchlist.length === 0) {
    lines.push(row(c(pad('  Waiting for scanner...', WIDTH - 4), DIM)));
  } else {
    for (const t of topWatchlist) {
      const momentum =
        t.prevPrice && t.price > t.prevPrice ? c('▲', GRN)
        : t.prevPrice && t.price < t.prevPrice ? c('▼', RED)
        : ' ';
      const bcColor =
        t.bondingCurveProgress >= 30 && t.bondingCurveProgress <= 70
          ? GRN : YEL;
      const wLine =
        `  ${c(pad(t.symbol ?? '?', 10), YEL)}` +
        `  ${pad(trunc(t.name ?? '', 18), 18)}` +
        `  ${momentum}${rpad(fmtPrice(t.price), 13)}` +
        `  ${rpad(fmtMcap(t.marketCap), 10)}` +
        `  ${rpad(String(t.txCount ?? 0), 6)}` +
        `  ${c(rpad(`${(t.bondingCurveProgress ?? 0).toFixed(0)}%`, 6), bcColor)}` +
        `  ${c(rpad(fmtAge(t.firstSeen ?? new Date().toISOString()), 6), DIM)}`;
      lines.push(row(padV(wLine, WIDTH - 4)));
    }
  }

  // ── Scores ─────────────────────────────────────────────────────────────────
  lines.push(c(hLine('╠', '─', '╣', ' 🧠 TOP SCORES '), CYN));
  const scoreHeader = padV(
    `  ${c(pad('SYMBOL', 10), BOLD)}  ${c(pad('SCORE', 6), BOLD)}` +
    `  ${c(pad('BC', 4), BOLD)}  ${c(pad('TX', 4), BOLD)}` +
    `  ${c(pad('MC', 4), BOLD)}  ${c(pad('MOM', 4), BOLD)}` +
    `  ${c(pad('REASONING', 50), BOLD)}`,
    WIDTH - 4,
  );
  lines.push(row(scoreHeader));

  const topScores = scores.slice(0, scoreMax);
  if (topScores.length === 0) {
    lines.push(row(c(pad('  Waiting for analyst...', WIDTH - 4), DIM)));
  } else {
    for (const s of topScores) {
      const scoreStr = s.score > 75
        ? c(rpad(String(s.score), 6), `${BOLD}${GRN}`)
        : s.score > 50
        ? c(rpad(String(s.score), 6), YEL)
        : c(rpad(String(s.score), 6), DIM);
      const bd = s.breakdown ?? {};
      const sLine =
        `  ${c(pad(s.symbol ?? '?', 10), YEL)}  ${scoreStr}` +
        `  ${rpad(String(bd.bondingCurve ?? 0), 4)}` +
        `  ${rpad(String(bd.txCount ?? 0), 4)}` +
        `  ${rpad(String(bd.marketCap ?? 0), 4)}` +
        `  ${rpad(String(bd.velocity ?? 0), 4)}` +
        `  ${c(trunc(s.reasoning ?? '', 50), DIM)}`;
      lines.push(row(padV(sLine, WIDTH - 4)));
    }
  }

  // ── Open positions ─────────────────────────────────────────────────────────
  lines.push(
    c(hLine('╠', '─', '╣',
      ' 📈 OPEN POSITIONS (TP+25/50/100% | SL-5→0→+15%) '), CYN),
  );
  const posHeader = padV(
    `  ${c(pad('SYMBOL', 10), BOLD)}  ${c(rpad('ENTRY', 14), BOLD)}` +
    `  ${c(rpad('CURRENT', 14), BOLD)}  ${c(rpad('P&L %', 8), BOLD)}` +
    `  ${c(rpad('P&L SOL', 10), BOLD)}  ${c(pad('AGE', 8), BOLD)}` +
    `  ${c(pad('SCORE', 5), BOLD)}`,
    WIDTH - 4,
  );
  lines.push(row(posHeader));

  if (openPos.length === 0) {
    lines.push(
      row(c(pad('  No open positions', WIDTH - 4), DIM)),
    );
  } else {
    for (const p of openPos) {
      const pnlPct = p.entryPrice > 0
        ? ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100
        : 0;
      const pnlSol = p.solSpent * (pnlPct / 100);
      const pLine =
        `  ${c(pad(p.symbol ?? '?', 10), YEL)}` +
        `  ${rpad(fmtPrice(p.entryPrice), 14)}` +
        `  ${rpad(fmtPrice(p.currentPrice), 14)}` +
        `  ${padV(fmtPct(pnlPct), 8)}` +
        `  ${rpad((pnlSol >= 0 ? '+' : '') + pnlSol.toFixed(4) + ' SOL', 10)}` +
        `  ${c(pad(fmtAge(p.entryTime), 8), DIM)}` +
        `  ${c(rpad(String(p.score ?? 0), 5), DIM)}`;
      lines.push(row(padV(pLine, WIDTH - 4)));
    }
  }

  // ── Active scalps ──────────────────────────────────────────────────────────
  lines.push(
    c(hLine('╠', '─', '╣',
      ' ⚡ ACTIVE SCALPS (TP+10% / Trail+3%↓2% / SL-3% / 30s)'), CYN),
  );
  const scalpHeader = padV(
    `  ${c(pad('SYMBOL', 10), BOLD)}  ${c(rpad('ENTRY', 14), BOLD)}` +
    `  ${c(rpad('CURRENT', 14), BOLD)}  ${c(rpad('P&L %', 8), BOLD)}` +
    `  ${c(rpad('P&L SOL', 10), BOLD)}  ${c(pad('AGE', 8), BOLD)}`,
    WIDTH - 4,
  );
  lines.push(row(scalpHeader));

  if (openScalps.length === 0) {
    lines.push(row(
      c(pad('  No active scalps — watching for fresh launches...', WIDTH - 4), DIM),
    ));
  } else {
    for (const p of openScalps) {
      const pnlPct = p.entryPrice > 0
        ? ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100
        : 0;
      const pnlSol = p.solSpent * (pnlPct / 100);
      const scalpLine =
        `  ${c(pad(p.symbol ?? '?', 10), CYN)}` +
        `  ${rpad(fmtPrice(p.entryPrice), 14)}` +
        `  ${rpad(fmtPrice(p.currentPrice), 14)}` +
        `  ${padV(fmtPct(pnlPct), 8)}` +
        `  ${rpad((pnlSol >= 0 ? '+' : '') + pnlSol.toFixed(4) + ' SOL', 10)}` +
        `  ${c(pad(fmtAgeShort(p.entryTime), 8), DIM)}`;
      lines.push(row(padV(scalpLine, WIDTH - 4)));
    }
  }

  // ── Closed trades ──────────────────────────────────────────────────────────
  lines.push(c(hLine('╠', '─', '╣', ' 📊 RECENT CLOSED TRADES '), CYN));
  const tradeHeader = padV(
    `  ${c(pad('SYMBOL', 10), BOLD)}  ${c(pad('REASON', 4), BOLD)}` +
    `  ${c(rpad('ENTRY', 14), BOLD)}  ${c(rpad('EXIT', 14), BOLD)}` +
    `  ${c(rpad('P&L %', 8), BOLD)}  ${c(rpad('P&L SOL', 10), BOLD)}`,
    WIDTH - 4,
  );
  lines.push(row(tradeHeader));

  const recentTrades = [...trades].reverse().slice(0, tradeMax);
  if (recentTrades.length === 0) {
    lines.push(
      row(c(pad('  No closed trades yet', WIDTH - 4), DIM)),
    );
  } else {
    for (const t of recentTrades) {
      const reasonColor =
        t.exitReason === 'TP' ? GRN
        : t.exitReason === 'TIME' ? YEL
        : RED;
      const tLine =
        `  ${c(pad(t.symbol ?? '?', 10), YEL)}` +
        `  ${c(pad(t.exitReason ?? '?', 4), reasonColor)}` +
        `  ${rpad(fmtPrice(t.entryPrice), 14)}` +
        `  ${rpad(fmtPrice(t.exitPrice), 14)}` +
        `  ${padV(fmtPct(t.pnlPct ?? 0), 8)}` +
        `  ${rpad((t.pnlSol >= 0 ? '+' : '') + (t.pnlSol ?? 0).toFixed(4) + ' SOL', 10)}`;
      lines.push(row(padV(tLine, WIDTH - 4)));
    }
  }

  // ── Analytics summary ──────────────────────────────────────────────────────
  if (showAnalytics) {
    try {
      const aRaw = fs.existsSync(ANALYTICS_PATH)
        ? JSON.parse(fs.readFileSync(ANALYTICS_PATH, 'utf8'))
        : null;
      if (aRaw && aRaw.totalTrades > 0) {
        lines.push(
          c(hLine('╠', '─', '╣', ' 📈 STRATEGY ANALYTICS '), BLU),
        );
        const ov = aRaw.overall;
        const r10 = aRaw.rolling10;
        const exp = aRaw.expectancy;
        const sl = aRaw.slOvershoot;
        lines.push(row(padV(
          `  WR: ${c(ov.winRate.toFixed(0) + '%', ov.winRate >= 30 ? GRN : RED)}` +
          `  Net: ${c((ov.totalPnlSol >= 0 ? '+' : '') + ov.totalPnlSol.toFixed(4) + ' SOL', ov.totalPnlSol >= 0 ? GRN : RED)}` +
          `  R10: ${c(r10.winRate.toFixed(0) + '%', r10.winRate >= 30 ? GRN : RED)}` +
          `  Payoff: ${c(exp.payoffRatio.toFixed(2) + 'x', exp.payoffRatio >= 2 ? GRN : YEL)}` +
          `  SL miss: ${c(sl.avgPct.toFixed(0) + '%', sl.avgPct > -15 ? YEL : RED)}`,
          WIDTH - 4,
        )));
        if (aRaw.signals && aRaw.signals.length > 0) {
          for (const sig of aRaw.signals.slice(0, 3)) {
            const label = sig.split(':')[0] ?? '';
            const rest = sig.slice(label.length + 2);
            lines.push(row(padV(
              `  ${c(label, RED)}: ${rest.slice(0, WIDTH - label.length - 10)}`,
              WIDTH - 4,
            )));
          }
        }
      }
    } catch { /* analytics not ready */ }
  }

  // ── Agent logs (fills remaining terminal space) ────────────────────────────
  lines.push(c(hLine('╠', '─', '╣', ' 🔧 AGENT LOGS '), CYN));
  const agentLogLines = readTailLines(AGENT_LOG_PATH, logRows);
  if (agentLogLines.length === 0) {
    lines.push(
      row(c(pad('  Waiting for agent output...', WIDTH - 4), DIM)),
    );
    for (let i = 1; i < logRows; i++) lines.push(blank());
  } else {
    for (const logLine of agentLogLines) {
      const trimmed = truncAnsi(logLine, WIDTH - 4);
      lines.push(row(padV(trimmed, WIDTH - 4)));
    }
    for (let i = agentLogLines.length; i < logRows; i++) {
      lines.push(blank());
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  lines.push(c(hLine('╠', '═', '╣'), CYN));
  const keyHints =
    c('R', YEL) + c(' reset stats', DIM) + '   ' +
    c('Ctrl+C', YEL) + c(' quit', DIM);
  lines.push(
    c('║', CYN) + ' ' +
    padV(`Keys: ${keyHints}`, WIDTH - 4) +
    ' ' + c('║', CYN),
  );
  lines.push(c(hLine('╚', '═', '╝'), CYN));

  // Render: cursor home + overwrite each line + clear to EOL (no flicker)
  let frame = HOME + HIDE_CURSOR;
  for (const line of lines) {
    frame += line + CLREOL + '\n';
  }
  // Clear a couple of leftover lines in case terminal just shrunk
  frame += CLREOL + '\n' + CLREOL + '\n';
  process.stdout.write(frame);
}

// ─── Agent spawner ────────────────────────────────────────────────────────────

interface AgentConfig {
  name: string;
  script: string;
  color: string;
}

const AGENTS: AgentConfig[] = [
  { name: 'SCANNER',   script: 'pumpfun-scanner.ts',   color: GRN },
  { name: 'ANALYST',   script: 'pumpfun-analyst.ts',   color: YEL },
  { name: 'TRADER',    script: 'pumpfun-trader.ts',    color: MAG },
  { name: 'RISK',      script: 'pumpfun-risk.ts',      color: RED },
  { name: 'SCALPER',   script: 'pumpfun-scalper.ts',   color: CYN },
  { name: 'ANALYTICS', script: 'pumpfun-analytics.ts', color: BLU },
];

const children: ChildProcess[] = [];
let agentLogFd: number | null = null;
let busClientCount = () => 0; // updated once bus server starts

function appendAgentLog(msg: string): void {
  if (agentLogFd === null) {
    agentLogFd = fs.openSync(AGENT_LOG_PATH, 'a');
  }
  const ts = new Date().toLocaleTimeString();
  fs.writeSync(agentLogFd, `${DIM}${ts}${RST} ${msg}\n`);
}

function spawnAgent(agent: AgentConfig): ChildProcess {
  const scriptPath = path.join(SRC_DIR, agent.script);
  const tsNodeBin = path.join(
    SRC_DIR, '..', 'node_modules', 'ts-node', 'dist', 'bin.js',
  );
  const child = spawn(
    process.execPath,
    [
      tsNodeBin,
      '--project', path.join(SRC_DIR, '..', 'tsconfig.json'),
      scriptPath,
    ],
    {
      cwd: path.join(SRC_DIR, '..'),
      env: { ...process.env },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );

  const tag = `${agent.color}[${agent.name}]${RST}`;

  child.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      appendAgentLog(`${tag} ${line}`);
    }
  });

  child.on('exit', (code, signal) => {
    appendAgentLog(`${tag} exited (code=${code} signal=${signal})`);
  });

  appendAgentLog(`${tag} spawned (pid=${child.pid})`);
  return child;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  // Truncate agent log from previous run
  fs.writeFileSync(AGENT_LOG_PATH, '');

  // Enter alternate screen buffer and hide cursor
  process.stdout.write(ALT_SCREEN_ON + HIDE_CURSOR);

  appendAgentLog('PUMP.FUN ALPHA HUNTER — STARTING UP');

  // Start message bus BEFORE spawning agents (they connect on boot)
  const busServer = startBusServer();
  busClientCount = busServer.clientCount;
  appendAgentLog(`Message bus started on port ${BUS_PORT} — agents will connect shortly`);

  // Spawn all agents
  for (const agent of AGENTS) {
    children.push(spawnAgent(agent));
    // Stagger startup slightly to avoid login races
    await new Promise((r) => setTimeout(r, 2000));
  }

  appendAgentLog(
    `All agents running. Dashboard renders every ${RENDER_MS / 1000}s`,
  );

  // Initial render after brief delay (let agents write first data)
  setTimeout(renderDashboard, 5000);

  // Recurring render
  const renderInterval = setInterval(renderDashboard, RENDER_MS);

  // Re-render on terminal resize
  process.stdout.on('resize', renderDashboard);

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  const shutdown = () => {
    clearInterval(renderInterval);
    for (const child of children) {
      child.kill('SIGTERM');
    }
    busServer.close();
    // Restore terminal: show cursor, exit alternate screen
    process.stdout.write(SHOW_CURSOR + ALT_SCREEN_OFF);
    if (agentLogFd !== null) {
      fs.closeSync(agentLogFd);
      agentLogFd = null;
    }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // ── Reset stats (R key) — wipes trades/positions/analytics, keeps watchlist ──
  function resetStats() {
    const now = new Date().toISOString();
    try { fs.writeFileSync(LOG_PATH, JSON.stringify({ lastUpdated: now, trades: [] }, null, 2)); } catch {}
    try { fs.writeFileSync(POSITIONS_PATH, JSON.stringify({ lastUpdated: now, positions: [] }, null, 2)); } catch {}
    try { fs.writeFileSync(SCALP_POSITIONS_PATH, JSON.stringify({ lastUpdated: now, positions: [] }, null, 2)); } catch {}
    try { if (fs.existsSync(ANALYTICS_PATH)) fs.unlinkSync(ANALYTICS_PATH); } catch {}
    appendAgentLog(`${c('RESET', YEL)} Stats cleared — fresh session started at ${now}`);
    renderDashboard();
  }

  // ── Keyboard input ──────────────────────────────────────────────────────────
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key: string) => {
      if (key === 'r' || key === 'R') {
        resetStats();
      } else if (key === '\u0003') {
        // Ctrl+C
        shutdown();
      }
    });
  }
}

main().catch((err) => {
  process.stdout.write(SHOW_CURSOR + ALT_SCREEN_OFF);
  process.stderr.write(`[ALPHA FATAL] ${err?.message ?? err}\n`);
  process.exit(1);
});
