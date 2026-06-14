export type PositionRole = 'Anchor' | 'Supporting' | 'Speculative';

export interface PositionFramework {
  sector: string;       // fallback for not-held positions; prefer API sector when available
  role: PositionRole;
  targetMin: number;    // % of stock sleeve
  targetMax: number;
  buildTarget?: number; // actively building toward this %
  verdict?: 'sell' | 'decide'; // sell = full exit; decide = binary choice (promote or cut)
  excludeFromSleeve?: boolean; // ETFs excluded from individual stock sleeve calc
}

export interface SectorTarget {
  min: number;
  max: number;
  intentionalOW?: boolean; // deliberately overweight — not a red flag
  maxAllowed?: number;     // upper bound before it becomes a real concern
  exitSector?: boolean;    // no allocation target; positions here are being exited
}

export const SIZING_RULES: Record<PositionRole, { min: number; max: number; color: string; bg: string; label: string }> = {
  Anchor:      { min: 8,  max: 12, color: '#818cf8', bg: 'rgba(99,102,241,0.15)',  label: 'Anchor' },
  Supporting:  { min: 4,  max: 6,  color: '#4ade80', bg: 'rgba(34,197,94,0.15)',   label: 'Supporting' },
  Speculative: { min: 2,  max: 3,  color: '#fbbf24', bg: 'rgba(245,158,11,0.15)',  label: 'Speculative' },
};

// Sector names match the cache values set in Cache Management
export const SECTOR_TARGETS: Record<string, SectorTarget> = {
  'Tech':               { min: 15, max: 20, intentionalOW: true,  maxAllowed: 32 },
  'Healthcare':         { min: 10, max: 14 },
  'Energy':             { min: 8,  max: 12, intentionalOW: true,  maxAllowed: 22 },
  'Financial Services': { min: 8,  max: 12 },
  'Consumer Cyclical':  { min: 5,  max: 8  },
  'Industrials':        { min: 6,  max: 10 },
  'Telecommunications': { min: 2,  max: 4  }, // ASTS — single speculative position
  'Materials':          { min: 0,  max: 0,  exitSector: true },
  'Broad Market':       { min: 0,  max: 0,  exitSector: true },
  'Cryptocurrency':     { min: 0,  max: 0,  exitSector: true },
};

// sector field here is a fallback for not-held (planned) positions.
// For held positions the component prefers the sector stored in the portfolio cache.
export const POSITION_ROLES: Record<string, PositionFramework> = {
  // ── Tech (intentional OW ~30%) ──────────────────────────────────────────
  MSFT:  { sector: 'Tech', role: 'Anchor',      targetMin: 8,  targetMax: 12 },
  AVGO:  { sector: 'Tech', role: 'Anchor',      targetMin: 8,  targetMax: 12, buildTarget: 8 },
  DRAM:  { sector: 'Tech', role: 'Supporting',  targetMin: 4,  targetMax: 6  },
  AMD:   { sector: 'Tech', role: 'Speculative', targetMin: 2,  targetMax: 3  },
  NOW:   { sector: 'Tech', role: 'Speculative', targetMin: 2,  targetMax: 3  },
  ZETA:  { sector: 'Tech', role: 'Speculative', targetMin: 2,  targetMax: 3  }, // ad-tech / martech
  IREN:  { sector: 'Tech', role: 'Speculative', targetMin: 2,  targetMax: 3,  verdict: 'decide' }, // user-reassigned to Tech
  // exits
  TSM:   { sector: 'Tech', role: 'Speculative', targetMin: 0,  targetMax: 0,  verdict: 'sell' },

  // ── Telecommunications ───────────────────────────────────────────────────
  ASTS:  { sector: 'Telecommunications', role: 'Speculative', targetMin: 2, targetMax: 3 }, // satellite broadband

  // ── Healthcare ──────────────────────────────────────────────────────────
  UNH:   { sector: 'Healthcare', role: 'Anchor',      targetMin: 8, targetMax: 12 },
  NVO:   { sector: 'Healthcare', role: 'Supporting',  targetMin: 4, targetMax: 6  },
  ZVRA:  { sector: 'Healthcare', role: 'Speculative', targetMin: 2, targetMax: 3  },
  // exits
  HIMS:  { sector: 'Healthcare', role: 'Speculative', targetMin: 0, targetMax: 0, verdict: 'sell' },

  // ── Energy (intentional OW ~21%) ────────────────────────────────────────
  'CCO.TO': { sector: 'Energy', role: 'Anchor',      targetMin: 8, targetMax: 12, buildTarget: 8 },
  ENB:      { sector: 'Energy', role: 'Supporting',  targetMin: 4, targetMax: 6,  buildTarget: 5 },
  CEG:      { sector: 'Energy', role: 'Supporting',  targetMin: 3, targetMax: 5  },
  TNZ:      { sector: 'Energy', role: 'Speculative', targetMin: 2, targetMax: 3  },
  TE:       { sector: 'Energy', role: 'Speculative', targetMin: 2, targetMax: 3  },
  // exits
  XLE:   { sector: 'Energy', role: 'Speculative', targetMin: 0, targetMax: 0, verdict: 'sell', excludeFromSleeve: true },

  // ── Financial Services ───────────────────────────────────────────────────
  SOFI:  { sector: 'Financial Services', role: 'Anchor', targetMin: 8, targetMax: 10, buildTarget: 9 },

  // ── Consumer Cyclical ────────────────────────────────────────────────────
  AMZN:  { sector: 'Consumer Cyclical', role: 'Anchor',      targetMin: 5, targetMax: 7 },
  TSLA:  { sector: 'Consumer Cyclical', role: 'Speculative', targetMin: 2, targetMax: 4 },

  // ── Industrials ─────────────────────────────────────────────────────────
  ADUR:  { sector: 'Industrials', role: 'Speculative', targetMin: 2, targetMax: 3 },
  // exits
  PNG:   { sector: 'Industrials', role: 'Speculative', targetMin: 0, targetMax: 0, verdict: 'sell' },

  // ── Materials (exit sector) ───────────────────────────────────────────────
  QIMC:  { sector: 'Materials', role: 'Speculative', targetMin: 0, targetMax: 0, verdict: 'sell' },
  HHE:   { sector: 'Materials', role: 'Speculative', targetMin: 0, targetMax: 0, verdict: 'sell' },

  // ── Cryptocurrency (exit sector) ─────────────────────────────────────────
  HIVE:  { sector: 'Cryptocurrency', role: 'Speculative', targetMin: 0, targetMax: 0, verdict: 'sell' },

  // ── Broad Market (exit sector — BNS387 recurring covers this mandate) ────
  'XEC.TO': { sector: 'Broad Market', role: 'Speculative', targetMin: 0, targetMax: 0, verdict: 'sell', excludeFromSleeve: true },
};

export const SECTOR_ORDER = [
  'Tech', 'Healthcare', 'Energy', 'Financial Services', 'Consumer Cyclical',
  'Industrials', 'Telecommunications', 'Materials', 'Broad Market', 'Cryptocurrency',
];

export const ROLE_ICONS: Record<PositionRole, string> = {
  Anchor:      '⚓',
  Supporting:  '◆',
  Speculative: '●',
};
