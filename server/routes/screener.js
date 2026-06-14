const express = require('express');
const fs = require('fs');
const path = require('path');
const { analyzeAssetTiming, calculateBuySellScore } = require('./rebalancing-recommendations');
const holdingsCache = require('../cache');

const router = express.Router();

// ── Universe file ─────────────────────────────────────────────────────────────
const UNIVERSE_FILE = path.join(__dirname, '../data/screener-universe.json');

function loadUniverse() {
  const raw = fs.readFileSync(UNIVERSE_FILE, 'utf8');
  return JSON.parse(raw);
}

function saveUniverse(universe) {
  fs.writeFileSync(UNIVERSE_FILE, JSON.stringify(universe, null, 2));
}

function getAllSymbols(universe) {
  const all = [];
  for (const cat of Object.values(universe.categories)) all.push(...cat);
  all.push(...(universe.custom || []));
  // Deduplicate
  return [...new Set(all)];
}

// ── Sector lookup ─────────────────────────────────────────────────────────────
// Category → default sector label (for focused categories)
const CATEGORY_SECTOR = {
  energy_focus:      'Energy',
  healthcare_focus:  'Healthcare',
  tech_underdogs:    'Tech',
  us_etfs:           'ETF',
  crypto:            'Cryptocurrency',
};

// Static symbol → sector map covering all major universe tickers
const STATIC_SECTOR_MAP = {
  // ── Tech ──────────────────────────────────────────────────────────────────
  AAPL:'Tech', MSFT:'Tech', NVDA:'Tech', AVGO:'Tech', GOOGL:'Telecommunications', GOOG:'Telecommunications',
  META:'Telecommunications', ORCL:'Tech', CRM:'Tech', ADBE:'Tech', TXN:'Tech', QCOM:'Tech', AMD:'Tech',
  INTU:'Tech', ACN:'Tech', ADI:'Tech', MU:'Tech', ADSK:'Tech', CDNS:'Tech', SNPS:'Tech', FTNT:'Tech',
  PANW:'Tech', WDAY:'Tech', NET:'Tech', CRWD:'Tech', ANET:'Tech', MRVL:'Tech', ON:'Tech', MPWR:'Tech',
  NOW:'Tech', SPGI:'Financial Services', APH:'Tech', ROP:'Tech', PAYX:'Tech', ADP:'Tech',
  DDOG:'Tech', SNOW:'Tech', ZS:'Tech', OKTA:'Tech', MDB:'Tech', TEAM:'Tech', TWLO:'Tech',
  HUBS:'Tech', VEEV:'Tech', DOCU:'Tech', ZM:'Tech', PAYC:'Tech', PCTY:'Tech',
  KLAC:'Tech', LRCX:'Tech', AMAT:'Tech', MCHP:'Tech', SWKS:'Tech', QRVO:'Tech',
  SNAP:'Tech', PINS:'Tech', U:'Tech', RDDT:'Tech', DUOL:'Tech', MNDY:'Tech',
  AXON:'Tech', IOT:'Tech', GTLB:'Tech', CFLT:'Tech', PATH:'Tech', ESTC:'Tech',
  APP:'Tech', PLTR:'Tech', SMCI:'Tech', BBAI:'Tech', SOUN:'Tech', TTD:'Tech',
  MGNI:'Tech', DV:'Tech', IAS:'Tech', PUBM:'Tech', CRTO:'Tech', GLBE:'Tech',
  IONQ:'Tech', RGTI:'Tech', QUBT:'Tech', QBTS:'Tech', ARQQ:'Tech',
  ARM:'Tech', TSM:'Tech', ASML:'Tech', AEHR:'Tech', WOLF:'Tech', ONTO:'Tech', COHU:'Tech', ACLS:'Tech',
  TOST:'Tech', TOAST:'Tech', SAMSARA:'Tech',
  SAP:'Tech', BIDU:'Tech', SE:'Tech', INFY:'Tech', WIT:'Tech',
  NICE:'Tech', CHKP:'Tech', CYBR:'Tech', WIX:'Tech', FVRR:'Tech', LOGI:'Tech', STM:'Tech',
  TME:'Tech', IQ:'Tech', HUYA:'Tech', DOYU:'Tech', BILI:'Tech',
  SHOP:'Tech', CSU:'Tech', 'SHOP.TO':'Tech', 'CSU.TO':'Tech', 'OTEX.TO':'Tech',
  'GIB.A.TO':'Tech', 'LSPD.TO':'Tech', 'NVEI.TO':'Tech', 'TOI.TO':'Tech', 'DSG.TO':'Tech',
  'MDA.TO':'Tech',

  // ── Healthcare ────────────────────────────────────────────────────────────
  UNH:'Healthcare', LLY:'Healthcare', JNJ:'Healthcare', MRK:'Healthcare', ABBV:'Healthcare',
  PFE:'Healthcare', BMY:'Healthcare', DHR:'Healthcare', TMO:'Healthcare', GILD:'Healthcare',
  REGN:'Healthcare', VRTX:'Healthcare', AMGN:'Healthcare', ISRG:'Healthcare', ZTS:'Healthcare',
  CI:'Healthcare', MDT:'Healthcare', SYK:'Healthcare', BDX:'Healthcare', EW:'Healthcare',
  BSX:'Healthcare', HCA:'Healthcare', CVS:'Healthcare', ELV:'Healthcare', HUM:'Healthcare',
  MOH:'Healthcare', RMD:'Healthcare', DXCM:'Healthcare', ABT:'Healthcare',
  BIIB:'Healthcare', MRNA:'Healthcare', BNTX:'Healthcare', SRPT:'Healthcare',
  ALNY:'Healthcare', IONS:'Healthcare', ARWR:'Healthcare', CRSP:'Healthcare',
  ILMN:'Healthcare', IDXX:'Healthcare', ALGN:'Healthcare', PODD:'Healthcare',
  INSP:'Healthcare', STE:'Healthcare', ZBH:'Healthcare', HOLX:'Healthcare',
  PKI:'Healthcare', CTLT:'Healthcare', WAT:'Healthcare', MTD:'Healthcare',
  HIMS:'Healthcare', TEM:'Healthcare', RXRX:'Healthcare', EXAS:'Healthcare',
  NTRA:'Healthcare', PACB:'Healthcare', BBIO:'Healthcare', OSCR:'Healthcare',
  SKIN:'Healthcare', AGIO:'Healthcare', KYMR:'Healthcare', MGNX:'Healthcare',
  SAGE:'Healthcare', VTRS:'Healthcare', JAZZ:'Healthcare', PRGO:'Healthcare',
  NVO:'Healthcare', AZN:'Healthcare', GSK:'Healthcare', NVS:'Healthcare', TEVA:'Healthcare',
  WBA:'Healthcare',

  // ── Financial Services ────────────────────────────────────────────────────
  JPM:'Financial Services', BAC:'Financial Services', WFC:'Financial Services',
  GS:'Financial Services', MS:'Financial Services', C:'Financial Services',
  BLK:'Financial Services', BX:'Financial Services', SCHW:'Financial Services',
  AXP:'Financial Services', V:'Financial Services', MA:'Financial Services',
  COF:'Financial Services', DFS:'Financial Services', ALLY:'Financial Services',
  MTB:'Financial Services', HBAN:'Financial Services', KEY:'Financial Services',
  RF:'Financial Services', CFG:'Financial Services', FITB:'Financial Services',
  USB:'Financial Services', PNC:'Financial Services', TROW:'Financial Services',
  STT:'Financial Services', BK:'Financial Services', MET:'Financial Services',
  PRU:'Financial Services', AFL:'Financial Services', TRV:'Financial Services',
  ALL:'Financial Services', PGR:'Financial Services', AIG:'Financial Services',
  AON:'Financial Services', MMC:'Financial Services', CB:'Financial Services',
  FIS:'Financial Services', FISV:'Financial Services', PYPL:'Financial Services',
  ICE:'Financial Services', CME:'Financial Services', CBOE:'Financial Services',
  NDAQ:'Financial Services', MKTX:'Financial Services', NTRS:'Financial Services',
  AJG:'Financial Services', LNC:'Financial Services', MCO:'Financial Services',
  COIN:'Financial Services', HOOD:'Financial Services', AFRM:'Financial Services',
  UPST:'Financial Services', SOFI:'Financial Services',
  BILL:'Financial Services', BAZF:'Financial Services', LMND:'Financial Services',
  ROOT:'Financial Services', HIPPO:'Financial Services',
  RY:'Financial Services', TD:'Financial Services', BNS:'Financial Services',
  BMO:'Financial Services', NU:'Financial Services', ITUB:'Financial Services',
  BBD:'Financial Services', HDB:'Financial Services', IBN:'Financial Services',
  LYG:'Financial Services', BCS:'Financial Services', DB:'Financial Services',
  UBS:'Financial Services', ING:'Financial Services', SAN:'Financial Services',
  BBVA:'Financial Services', SMFG:'Financial Services', MFG:'Financial Services',
  KB:'Financial Services', SHG:'Financial Services',
  'RY.TO':'Financial Services', 'TD.TO':'Financial Services', 'BNS.TO':'Financial Services',
  'BMO.TO':'Financial Services', 'CM.TO':'Financial Services', 'NA.TO':'Financial Services',
  'MFC.TO':'Financial Services', 'SLF.TO':'Financial Services', 'IAG.TO':'Financial Services',
  'FFH.TO':'Financial Services', 'POW.TO':'Financial Services', 'IFC.TO':'Financial Services',
  'GWO.TO':'Financial Services', 'EFN.TO':'Financial Services', 'EQB.TO':'Financial Services',
  'CWB.TO':'Financial Services', 'HCG.TO':'Financial Services', 'STB.TO':'Financial Services',

  // ── Energy ────────────────────────────────────────────────────────────────
  XOM:'Energy', CVX:'Energy', COP:'Energy', OXY:'Energy', HAL:'Energy', SLB:'Energy',
  DVN:'Energy', EOG:'Energy', HES:'Energy', PSX:'Energy', VLO:'Energy', MPC:'Energy',
  WMB:'Energy', KMI:'Energy', OKE:'Energy',
  PBR:'Energy', BP:'Energy', SHEL:'Energy', TTE:'Energy', E:'Energy', SU:'Energy', CVE:'Energy',
  ENB:'Energy', 'ENB.TO':'Energy', 'TRP.TO':'Energy', 'CNQ.TO':'Energy',
  'SU.TO':'Energy', 'CVE.TO':'Energy', 'MEG.TO':'Energy', 'BTE.TO':'Energy',
  'PPL.TO':'Energy', 'KEY.TO':'Energy', 'WCP.TO':'Energy',
  'VET.TO':'Energy', 'ARX.TO':'Energy', 'PXT.TO':'Energy', 'CPG.TO':'Energy',
  'IMO.TO':'Energy',
  MSTR:'Cryptocurrency',

  // ── Consumer Cyclical ─────────────────────────────────────────────────────
  AMZN:'Consumer Cyclical', TSLA:'Consumer Cyclical', NKE:'Consumer Cyclical',
  HD:'Consumer Cyclical', MCD:'Consumer Cyclical', BKNG:'Consumer Cyclical',
  LOW:'Consumer Cyclical', UBER:'Consumer Cyclical', TJX:'Consumer Cyclical',
  CMG:'Consumer Cyclical', SBUX:'Consumer Cyclical', DIS:'Consumer Cyclical',
  GM:'Consumer Cyclical', F:'Consumer Cyclical', RIVN:'Consumer Cyclical', LCID:'Consumer Cyclical',
  RBLX:'Consumer Cyclical', DKNG:'Consumer Cyclical', MGM:'Consumer Cyclical',
  CZR:'Consumer Cyclical', WYNN:'Consumer Cyclical', LVS:'Consumer Cyclical',
  UAA:'Consumer Cyclical', RL:'Consumer Cyclical', BURL:'Consumer Cyclical',
  ROST:'Consumer Cyclical', YUM:'Consumer Cyclical', DPZ:'Consumer Cyclical',
  TXRH:'Consumer Cyclical', WING:'Consumer Cyclical',
  CCL:'Consumer Cyclical', RCL:'Consumer Cyclical', NCLH:'Consumer Cyclical',
  ABNB:'Consumer Cyclical', DASH:'Consumer Cyclical', LYFT:'Consumer Cyclical',
  DECK:'Consumer Cyclical', ONON:'Consumer Cyclical', ELF:'Consumer Cyclical',
  OLPX:'Consumer Cyclical', CAVA:'Consumer Cyclical', BROS:'Consumer Cyclical',
  WINGSTOP:'Consumer Cyclical', SHAK:'Consumer Cyclical',
  W:'Consumer Cyclical', ETSY:'Consumer Cyclical', EBAY:'Consumer Cyclical',
  PENN:'Consumer Cyclical', GENI:'Consumer Cyclical',
  BLNK:'Consumer Cyclical', CHPT:'Consumer Cyclical', EVGO:'Consumer Cyclical',
  GME:'Consumer Cyclical',
  TM:'Consumer Cyclical', HMC:'Consumer Cyclical', STLA:'Consumer Cyclical',
  BABA:'Consumer Cyclical', JD:'Consumer Cyclical', PDD:'Consumer Cyclical',
  NIO:'Consumer Cyclical', LI:'Consumer Cyclical', XPEV:'Consumer Cyclical',
  MELI:'Consumer Cyclical', GRAB:'Consumer Cyclical',
  'ATD.TO':'Consumer Cyclical', 'QSR.TO':'Consumer Cyclical', 'MRU.TO':'Consumer Cyclical',
  'L.TO':'Consumer Defensive', 'DOL.TO':'Consumer Defensive',

  // ── Consumer Defensive ────────────────────────────────────────────────────
  WMT:'Consumer Defensive', PG:'Consumer Defensive', KO:'Consumer Defensive',
  PEP:'Consumer Defensive', COST:'Consumer Defensive', PM:'Consumer Defensive',
  MO:'Consumer Defensive', MDLZ:'Consumer Defensive', HSY:'Consumer Defensive',
  MKC:'Consumer Defensive', GIS:'Consumer Defensive', STZ:'Consumer Defensive',
  MNST:'Consumer Defensive', CELH:'Consumer Defensive', CLX:'Consumer Defensive',
  KMB:'Consumer Defensive', TAP:'Consumer Defensive', HRL:'Consumer Defensive',
  CAG:'Consumer Defensive', CPB:'Consumer Defensive', DLTR:'Consumer Defensive',
  DG:'Consumer Defensive', KR:'Consumer Defensive',
  DEO:'Consumer Defensive', BUD:'Consumer Defensive', HEINY:'Consumer Defensive',
  BTI:'Consumer Defensive', ABEV:'Consumer Defensive', BRFS:'Consumer Defensive',

  // ── Industrials ───────────────────────────────────────────────────────────
  GE:'Industrials', HON:'Industrials', CAT:'Industrials', RTX:'Industrials',
  ETN:'Industrials', DE:'Industrials', MMM:'Industrials', BA:'Industrials',
  NOC:'Industrials', GD:'Industrials', LMT:'Industrials', TDY:'Industrials', HII:'Industrials',
  UPS:'Industrials', FDX:'Industrials', ODFL:'Industrials', SAIA:'Industrials', XPO:'Industrials',
  NSC:'Industrials', CTAS:'Industrials',
  DAL:'Industrials', UAL:'Industrials', AAL:'Industrials', ALK:'Industrials',
  ACHR:'Industrials', JOBY:'Industrials', ARCHER:'Industrials', RKLB:'Industrials', LUNR:'Industrials',
  CNI:'Industrials', CP:'Industrials',
  'CNR.TO':'Industrials', 'CP.TO':'Industrials', 'CAE.TO':'Industrials',
  'STN.TO':'Industrials', 'WSP.TO':'Industrials', 'MG.TO':'Industrials',

  // ── Utilities ─────────────────────────────────────────────────────────────
  NEE:'Utilities', AEP:'Utilities', EXC:'Utilities', D:'Utilities', SRE:'Utilities',
  SO:'Utilities', DUK:'Utilities', VST:'Utilities', CEG:'Utilities', NRG:'Utilities',
  BE:'Utilities', FCEL:'Utilities', PLUG:'Utilities',
  'FTS.TO':'Utilities', 'H.TO':'Utilities', 'AQN.TO':'Utilities',
  'BEP.UN.TO':'Utilities', 'ALA.TO':'Utilities', 'CU.TO':'Utilities',

  // ── Telecommunications ────────────────────────────────────────────────────
  VZ:'Telecommunications', TMUS:'Telecommunications', CMCSA:'Telecommunications',
  CHTR:'Telecommunications', NFLX:'Telecommunications', ASTS:'Telecommunications',
  ERIC:'Telecommunications', NOK:'Telecommunications',
  TEF:'Telecommunications', ORAN:'Telecommunications', DTEGY:'Telecommunications',
  'BCE.TO':'Telecommunications', 'T.TO':'Telecommunications',
  'RCI.B.TO':'Telecommunications', 'QBR.B.TO':'Telecommunications',

  // ── Materials ─────────────────────────────────────────────────────────────
  LIN:'Materials', VALE:'Materials', RIO:'Materials', BHP:'Materials',
  GLNCY:'Materials', SCCO:'Materials', FCX:'Materials', GGB:'Materials', SID:'Materials',
  'AEM.TO':'Materials', 'ABX.TO':'Materials', 'WPM.TO':'Materials', 'K.TO':'Materials',
  'FM.TO':'Materials', 'IMG.TO':'Materials', 'NTR.TO':'Materials',
  'AGI.TO':'Materials', 'KL.TO':'Materials', 'ERO.TO':'Materials',
  'HBM.TO':'Materials', 'LUN.TO':'Materials', 'TCK.B.TO':'Materials',

  // ── Real Estate ───────────────────────────────────────────────────────────
  PLD:'Real Estate', AMT:'Real Estate', CCI:'Real Estate', EQIX:'Real Estate',
  DLR:'Real Estate', PSA:'Real Estate', SPG:'Real Estate', EXR:'Real Estate',
  O:'Real Estate', WPC:'Real Estate', STAG:'Real Estate', ARE:'Real Estate',
  VICI:'Real Estate', IRM:'Real Estate', COLD:'Real Estate',
  'BAM.TO':'Financial Services', 'BN.TO':'Financial Services',

  // ── Cryptocurrency ────────────────────────────────────────────────────────
  BTBT:'Cryptocurrency', MARA:'Cryptocurrency', RIOT:'Cryptocurrency',
  HUT:'Cryptocurrency', BITF:'Cryptocurrency',
  'HUT.TO':'Cryptocurrency', 'BITF.TO':'Cryptocurrency', 'HIVE.TO':'Cryptocurrency',
};

function buildSectorMap(universe) {
  const map = { ...STATIC_SECTOR_MAP };
  // 1. Category-based fallbacks for focused categories
  for (const [cat, symbols] of Object.entries(universe.categories)) {
    const sector = CATEGORY_SECTOR[cat] || null;
    if (sector) for (const sym of symbols) if (!map[sym]) map[sym] = sector;
  }
  // 2. Holdings cache overrides (user-assigned sectors take priority)
  for (const sym of holdingsCache.getAllSymbols()) {
    const data = holdingsCache.get(sym);
    if (data?.sector) map[sym] = data.sector;
  }
  return map;
}

// ── Crypto symbol normalization ───────────────────────────────────────────────
// Yahoo Finance serves crypto as SYMBOL-USD (e.g. BTC-USD). Map bare symbols.
const KNOWN_CRYPTO = new Set([
  'BTC','ETH','SOL','BNB','XRP','ADA','AVAX','LINK','DOT','MATIC',
  'LTC','DOGE','SHIB','UNI','ATOM','NEAR','APT','ARB','OP','INJ',
  'TRX','ETC','ZEC','XMR','ALGO','FIL','HBAR','ICP','VET','THETA'
]);

function toYahooSymbol(symbol) {
  if (KNOWN_CRYPTO.has(symbol.toUpperCase())) return symbol + '-USD';
  return symbol;
}

// ── Signal evaluation — mirrors NewsBoard.tsx badge rendering exactly ─────────
function evaluateSignals(indicators) {
  if (!indicators || Object.keys(indicators).length === 0) return [];

  const reversal    = indicators.momentum5 != null && indicators.momentum20 != null
                      && indicators.momentum5 > 0 && indicators.momentum20 < 0;
  const accumStrong = (indicators.cmf ?? -1) >= 0.10;
  const accumWeak   = (indicators.cmf ?? -1) > 0;
  const accumTrend  = (indicators.cmf ?? -1) > -0.05;
  const bullish     = indicators.macdBullish === true;
  const d200        = parseFloat(indicators.distanceFromMA200 ?? '0');
  const mom5v       = indicators.momentum5 ?? null;
  const mom20v      = indicators.momentum20 ?? null;
  const adxV        = indicators.adx ?? 0;
  const dip         = indicators.distanceFromHigh ?? 0;
  const safety      = indicators.safetyScore ?? 0;

  const isStrong   = reversal && accumStrong && bullish;
  const isModerate = (reversal && bullish && accumWeak) || (reversal && accumStrong);
  const isExtended = d200 > 20;
  const isRecovery = !reversal && mom5v != null && mom20v != null
                     && mom5v > 0 && mom20v > 0 && mom20v < 8
                     && d200 < 0 && bullish && accumWeak;
  const isTrend    = !reversal && !isRecovery && mom20v != null && mom20v > 0
                     && bullish && adxV > 15 && d200 >= 0 && d200 <= 30 && accumTrend;
  // isPrime uses the post-fix conditions (safety >= 65) matching the badge renderer
  const isPrime    = !reversal && !isRecovery && !isTrend
                     && safety >= 65 && dip <= -15 && dip >= -50 && d200 >= -20;

  const signals = [];
  if (isStrong)                   signals.push('strongEntry');
  if (isModerate && !isStrong)    signals.push('modEntry');
  if (isRecovery)                 signals.push('recovery');
  if (isTrend)                    signals.push('trend');
  if (isPrime)                    signals.push('prime');
  if (isExtended)                 signals.push('extended');
  return signals;
}

// ── In-memory caches ──────────────────────────────────────────────────────────
const scanResultCache = { data: null, timestamp: 0 };
const SCAN_CACHE_TTL  = 60 * 60 * 1000; // 1 hour

// Active scan jobs: { [jobId]: { status, progress, total, matches, error } }
const scanJobs = {};

// ── GET /api/screener/universe ────────────────────────────────────────────────
router.get('/universe', (req, res) => {
  try {
    const universe = loadUniverse();
    const symbols  = getAllSymbols(universe);
    res.json({ universe, symbols, total: symbols.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/screener/universe/add ──────────────────────────────────────────
router.post('/universe/add', (req, res) => {
  const { symbol } = req.body;
  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'symbol is required' });
  }
  try {
    const universe = loadUniverse();
    const upper = symbol.toUpperCase().trim();
    if (!universe.custom.includes(upper)) {
      universe.custom.push(upper);
      saveUniverse(universe);
    }
    res.json({ ok: true, symbol: upper, customCount: universe.custom.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/screener/scan ───────────────────────────────────────────────────
// Returns { cached: true, matches } if a fresh result exists (< 1 hr old).
// Otherwise starts an async job and returns { jobId }.
router.post('/scan', async (req, res) => {
  const force = req.body?.force === true || req.query?.force === 'true';
  if (!force && scanResultCache.data && Date.now() - scanResultCache.timestamp < SCAN_CACHE_TTL) {
    return res.json({ cached: true, matches: scanResultCache.data });
  }

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  scanJobs[jobId] = { status: 'running', progress: 0, total: 0, matches: [] };

  // Fire-and-forget — Express already responds below
  runScan(jobId).catch(err => {
    if (scanJobs[jobId]) {
      scanJobs[jobId].status = 'error';
      scanJobs[jobId].error  = err.message;
    }
    console.error('[screener] scan error:', err.message);
  });

  res.json({ jobId });
});

// ── GET /api/screener/scan/progress/:jobId ────────────────────────────────────
router.get('/scan/progress/:jobId', (req, res) => {
  const job = scanJobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
  // Schedule cleanup 5 min after the job finishes so the client can collect it
  if (job.status === 'done' || job.status === 'error') {
    setTimeout(() => { delete scanJobs[req.params.jobId]; }, 5 * 60 * 1000);
  }
});

// ── Scan runner ───────────────────────────────────────────────────────────────
const SIGNAL_PRIORITY = { strongEntry: 0, modEntry: 1, recovery: 2, trend: 3, prime: 4, extended: 5 };
const BATCH_SIZE      = 8;
const BATCH_DELAY_MS  = 200;

async function runScan(jobId) {
  const universe  = loadUniverse();
  const symbols   = getAllSymbols(universe);
  const sectorMap = buildSectorMap(universe);
  const job       = scanJobs[jobId];
  job.total       = symbols.length;
  console.log(`[screener] starting scan of ${symbols.length} symbols`);

  const matches = [];

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (sym) => {
        const yahooSym = toYahooSymbol(sym);
        // analyzeAssetTiming(symbol, targetAmount, currentAmount)
        // Passing 0,0 takes the HOLD path — all indicators still calculated
        const analysis = await analyzeAssetTiming(yahooSym, 0, 0);
        if (!analysis || analysis.timing === 'ERROR' || analysis.timing === 'INSUFFICIENT_DATA') {
          if (analysis?.timing === 'ERROR') console.warn(`[screener] ERROR on ${sym}: ${analysis.recommendation}`);
          return null;
        }
        const signals = evaluateSignals(analysis.indicators);
        if (signals.length === 0) return null;
        console.log(`[screener] ✓ ${sym} → ${signals.join(', ')}`);

        const scores = calculateBuySellScore(analysis);
        return {
          symbol:    sym,        // original label (BTC, not BTC-USD)
          sector:    sectorMap[sym] ?? null,
          signals,
          buyScore:  scores?.buyScore  ?? null,
          sellScore: scores?.sellScore ?? null,
          indicators: analysis.indicators,
        };
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) matches.push(r.value);
    }

    job.progress = Math.min(i + BATCH_SIZE, symbols.length);
    // Incrementally expose matches as they come in
    job.matches = [...matches];

    if (i + BATCH_SIZE < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // Sort by best signal priority, then buyScore descending
  matches.sort((a, b) => {
    const pa = Math.min(...a.signals.map(s => SIGNAL_PRIORITY[s] ?? 99));
    const pb = Math.min(...b.signals.map(s => SIGNAL_PRIORITY[s] ?? 99));
    if (pa !== pb) return pa - pb;
    return (b.buyScore ?? 0) - (a.buyScore ?? 0);
  });

  job.matches = matches;
  job.status  = 'done';
  console.log(`[screener] scan complete — ${matches.length} signal matches out of ${symbols.length} symbols`);

  // Cache the completed result
  scanResultCache.data      = matches;
  scanResultCache.timestamp = Date.now();
}

module.exports = router;
