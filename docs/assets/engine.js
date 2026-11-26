// Risk Oversight Demonstration: the risk engine.
// Plain JavaScript, no dependencies. Runs in the browser and under `node --test`.
//
// Everything here is a mock: a fictional Global Equities business with four desks.
// Units: notionals and P&L in CAD millions; spot moves as fractions (-0.05 = -5%);
// volatility moves in points (1 point = 0.01 of implied volatility).

// ---------- maths ----------

export function normCdf(x) {
  // Abramowitz & Stegun 7.1.26 on erf: absolute error below 1.5e-7
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
const normPdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

export const RATE = 0.03; // flat risk-free rate used for discounting

export function bsm(S, K, T, r, q, vol, cp) {
  // Black-Scholes-Merton price and Greeks. vega per 1 vol point, theta per calendar day.
  if (T <= 0 || vol <= 0) {
    const intrinsic = cp === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    const itm = cp === 'call' ? S > K : S < K;
    return { price: intrinsic, delta: itm ? (cp === 'call' ? 1 : -1) : 0, gamma: 0, vega: 0, theta: 0 };
  }
  const sq = Math.sqrt(T), sd = vol * sq, dfr = Math.exp(-r * T), dfq = Math.exp(-q * T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * vol * vol) * T) / sd, d2 = d1 - sd;
  const pdf = normPdf(d1);
  const call = cp === 'call';
  const price = call ? S * dfq * normCdf(d1) - K * dfr * normCdf(d2) : K * dfr * normCdf(-d2) - S * dfq * normCdf(-d1);
  const delta = call ? dfq * normCdf(d1) : -dfq * normCdf(-d1);
  const gamma = dfq * pdf / (S * sd);
  const vega = S * dfq * pdf * sq / 100;
  const thetaY = call
    ? -S * dfq * pdf * vol / (2 * sq) - r * K * dfr * normCdf(d2) + q * S * dfq * normCdf(d1)
    : -S * dfq * pdf * vol / (2 * sq) + r * K * dfr * normCdf(-d2) - q * S * dfq * normCdf(-d1);
  return { price, delta, gamma, vega, theta: thetaY / 365 };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussFrom(rng) {
  let spare = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0; while (u === 0) u = rng();
    const m = Math.sqrt(-2 * Math.log(u)), a = 2 * Math.PI * rng();
    spare = m * Math.sin(a);
    return m * Math.cos(a);
  };
}

export function quantile(sorted, p) {
  // linear interpolation between order statistics; `sorted` ascending
  const n = sorted.length;
  if (!n) return NaN;
  const h = (n - 1) * p, lo = Math.floor(h), hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}
const sortAsc = (a) => [...a].sort((x, y) => x - y);
export const sum = (a) => a.reduce((s, x) => s + x, 0);

export function varEs(pnl, varLevel = 0.99, esLevel = 0.975) {
  // Value-at-risk and expected shortfall, both returned as positive loss numbers
  const s = sortAsc(pnl);
  const v = -quantile(s, 1 - varLevel);
  const cut = Math.max(1, Math.round(s.length * (1 - esLevel)));
  const es = -sum(s.slice(0, cut)) / cut;
  return { var: v, es };
}

// ---------- the mock business ----------

export const DESKS = [
  { id: 'cash', name: 'Cash & ETF', short: 'Cash', color: '#007095', what: 'Stock and ETF market making, index arbitrage' },
  { id: 'flow', name: 'Flow Derivatives', short: 'Flow', color: '#B7791F', what: 'Listed and OTC equity options for clients' },
  { id: 'struct', name: 'Structured Notes & Exotics', short: 'Structured', color: '#A3294F', what: 'Autocallable and principal-at-risk notes and their hedges' },
  { id: 'fin', name: 'Equity Financing', short: 'Financing', color: '#6B5CA5', what: 'Total return swaps and stock loan against client positions' },
];

// frtb = equity bucket in the Basel standardised approach (MAR21.72)
export const UNDERLYINGS = {
  SPX: { name: 'S&P 500', region: 'US', beta: 1, vol: 0.20, q: 0.013, frtb: 12, index: true },
  NDX: { name: 'Nasdaq-100', region: 'TECH', beta: 1, vol: 0.26, q: 0.006, frtb: 12, index: true },
  TX60: { name: 'S&P/TSX 60', region: 'CA', beta: 1, vol: 0.16, q: 0.028, frtb: 12, index: true },
  SX5E: { name: 'Euro Stoxx 50', region: 'EU', beta: 1, vol: 0.19, q: 0.030, frtb: 12, index: true },
  EWZ: { name: 'Brazil (MSCI)', region: 'EM', beta: 1, vol: 0.34, q: 0.050, frtb: 13, index: true },
  NVDA: { name: 'Nvidia', region: 'TECH', beta: 1.5, vol: 0.52, q: 0.000, frtb: 8, adv: 30000 },
  MSFT: { name: 'Microsoft', region: 'TECH', beta: 0.95, vol: 0.28, q: 0.007, frtb: 8, adv: 12000 },
  AAPL: { name: 'Apple', region: 'TECH', beta: 1.0, vol: 0.29, q: 0.005, frtb: 8, adv: 11000 },
  SHOP: { name: 'Shopify', region: 'TECH', beta: 1.6, vol: 0.55, q: 0.000, frtb: 8, adv: 520 },
  RY: { name: 'Royal Bank', region: 'CA', beta: 0.9, vol: 0.18, q: 0.035, frtb: 8, adv: 450 },
  TD: { name: 'TD Bank', region: 'CA', beta: 0.95, vol: 0.20, q: 0.042, frtb: 8, adv: 420 },
  ENB: { name: 'Enbridge', region: 'CA', beta: 0.7, vol: 0.17, q: 0.060, frtb: 7, adv: 300 },
  CNQ: { name: 'Canadian Natural', region: 'CA', beta: 1.3, vol: 0.30, q: 0.045, frtb: 7, adv: 350 },
  BCE: { name: 'BCE', region: 'CA', beta: 0.5, vol: 0.21, q: 0.070, frtb: 6, adv: 160 },
};
export const REGIONS = { US: 'United States', TECH: 'US technology', CA: 'Canada', EU: 'Europe', EM: 'Brazil / emerging' };

// Implied volatility of one option at inception: at-the-money level plus a downside skew that flattens with maturity
export function impliedVol(u, k, T) {
  const slope = 0.9 * Math.min(1, Math.sqrt(0.5 / T));
  return UNDERLYINGS[u].vol * (1 + slope * (1 - k));
}

const opt = (desk, u, cp, k, T, n, tag) => ({ desk, u, type: 'option', cp, k, T, n, vol: impliedVol(u, k, T), tag });
const stk = (desk, u, n, tag) => ({ desk, u, type: 'stock', n, tag });

function rawPositions() {
  return [
    // Cash & ETF: inventory and index-arbitrage residuals
    stk('cash', 'SPX', 34), stk('cash', 'NDX', 21), stk('cash', 'TX60', 46), stk('cash', 'SX5E', -12), stk('cash', 'EWZ', 6),
    stk('cash', 'NVDA', 14), stk('cash', 'SHOP', 9), stk('cash', 'RY', -18), stk('cash', 'TD', 11), stk('cash', 'ENB', 7), stk('cash', 'CNQ', -9),

    // Flow Derivatives: clients buy downside protection and single-stock calls, so the desk is short both
    opt('flow', 'SPX', 'put', 0.92, 0.25, -420, 'Client hedges'), opt('flow', 'SPX', 'put', 0.85, 0.5, -260, 'Client hedges'),
    opt('flow', 'SPX', 'call', 1.05, 0.25, 300, 'Overwriting flow'),
    opt('flow', 'NDX', 'put', 0.90, 0.25, -240, 'Client hedges'), opt('flow', 'NDX', 'call', 1.05, 0.17, 120, 'Overwriting flow'),
    opt('flow', 'TX60', 'put', 0.95, 0.5, -150, 'Client hedges'), opt('flow', 'TX60', 'call', 1.03, 0.25, 160, 'Overwriting flow'),
    opt('flow', 'NVDA', 'call', 1.10, 0.25, -70, 'Client call buying'), opt('flow', 'NVDA', 'put', 0.85, 0.25, -45, 'Client hedges'),
    opt('flow', 'SHOP', 'call', 1.15, 0.33, -35, 'Client call buying'),
    opt('flow', 'RY', 'put', 0.95, 0.5, -70, 'Client hedges'), opt('flow', 'CNQ', 'call', 1.08, 0.25, 45, 'Overwriting flow'),
    opt('flow', 'ENB', 'put', 0.93, 0.75, -40, 'Client hedges'),

    // Structured Notes & Exotics: shown as the vanilla profile of an autocallable book.
    // Note buyers sell the bank a long-dated downside put (the barrier) and receive coupons (the short call spread).
    opt('struct', 'TX60', 'put', 0.70, 4, 900, 'Note barriers'), opt('struct', 'RY', 'put', 0.70, 3.5, 350, 'Note barriers'),
    opt('struct', 'TD', 'put', 0.70, 3, 300, 'Note barriers'), opt('struct', 'ENB', 'put', 0.75, 4, 260, 'Note barriers'),
    opt('struct', 'BCE', 'put', 0.70, 3, 120, 'Note barriers'), opt('struct', 'SPX', 'put', 0.70, 3, 380, 'Note barriers'),
    opt('struct', 'SX5E', 'put', 0.65, 4, 420, 'Note barriers'),
    opt('struct', 'TX60', 'call', 1.00, 1, -300, 'Autocall coupons'), opt('struct', 'TX60', 'call', 1.05, 1, 300, 'Autocall coupons'),
    opt('struct', 'SPX', 'call', 1.00, 1, -150, 'Autocall coupons'), opt('struct', 'SPX', 'call', 1.05, 1, 150, 'Autocall coupons'),
    // the desk recycles its long volatility by selling shorter-dated options: a maturity mismatch worth watching
    opt('struct', 'TX60', 'put', 0.90, 1, -330, 'Vega recycling'), opt('struct', 'SPX', 'put', 0.90, 0.5, -260, 'Vega recycling'),

    // Equity Financing: small net market exposure on a large financed book (gross figures are in FINANCING)
    stk('fin', 'SPX', 9), stk('fin', 'RY', 6), stk('fin', 'TD', -5), stk('fin', 'ENB', 4), stk('fin', 'CNQ', 3),
    stk('fin', 'BCE', 3), stk('fin', 'SHOP', -2), stk('fin', 'NVDA', 4), stk('fin', 'MSFT', -3), stk('fin', 'AAPL', 3),
  ];
}

// Client positions financed by the bank (gross, CAD m). Net market risk is small; concentration and exit time are the risks.
export const FINANCING = [
  { u: 'SPX', gross: 900 }, { u: 'RY', gross: 620 }, { u: 'TD', gross: 540 }, { u: 'ENB', gross: 410 }, { u: 'NVDA', gross: 380 },
  { u: 'MSFT', gross: 310 }, { u: 'CNQ', gross: 300 }, { u: 'AAPL', gross: 290 }, { u: 'BCE', gross: 260 }, { u: 'SHOP', gross: 220 },
];
export const STRUCTURED_NOTE_NOTIONAL = 2730; // CAD m of notes outstanding (sum of the barrier puts)
const HEDGE_RATIO = { flow: 0.93, struct: 0.97 };

// How much of a volatility shock reaches an option: full for 3 months and shorter, less for long-dated
export const volDamp = (T) => Math.min(1, Math.sqrt(0.25 / T));

export function greeks(p) {
  if (p.type === 'stock') return { value: p.n, delta: p.n, gamma: 0, vega: 0, theta: 0 };
  const g = bsm(1, p.k, p.T, RATE, UNDERLYINGS[p.u].q, p.vol, p.cp);
  return { value: p.n * g.price, delta: p.n * g.delta, gamma: p.n * g.gamma, vega: p.n * g.vega * volDamp(p.T), theta: p.n * g.theta };
}

export function buildBook(overrides = {}) {
  // overrides: { scale: { tagOrIndex: factor }, extra: [positions] } used by the what-if checks
  let pos = rawPositions();
  if (overrides.scale) pos = pos.map((p, i) => (overrides.scale[i] !== undefined ? { ...p, n: p.n * overrides.scale[i] } : p));
  if (overrides.extra) pos = pos.concat(overrides.extra);
  // delta hedges: each option desk sells or buys stock against most of its option delta
  for (const desk of ['flow', 'struct']) {
    const net = {};
    for (const p of pos) if (p.desk === desk && p.type === 'option') net[p.u] = (net[p.u] || 0) + greeks(p).delta;
    for (const u of Object.keys(net)) pos.push(stk(desk, u, -HEDGE_RATIO[desk] * net[u], 'Delta hedge'));
  }
  return pos.map((p, id) => ({ ...p, id, g: greeks(p) }));
}

// ---------- revaluation ----------

export function positionPnl(p, ret, dvol, days = 0) {
  // Full revaluation. Sticky strike: each option keeps its own implied volatility when spot moves.
  if (p.type === 'stock') return p.n * ret;
  const u = UNDERLYINGS[p.u];
  const vol = Math.max(0.03, p.vol + (dvol / 100) * volDamp(p.T));
  const after = bsm(1 + ret, p.k, Math.max(p.T - days / 365, 1e-6), RATE, u.q, vol, p.cp).price;
  return p.n * (after - p.g.value / p.n);
}
export function taylorPnl(p, ret, dvol) {
  // What the sensitivities alone predict: delta, gamma and vega
  return p.g.delta * ret + 0.5 * p.g.gamma * ret * ret + p.g.vega * dvol;
}

// A scenario gives a spot move and a volatility move per region; single names scale by beta and by their own volatility
export function shockFor(u, sc) {
  const U = UNDERLYINGS[u];
  const eq = (sc.eq[U.region] ?? 0) / 100, vp = sc.vol[U.region] ?? 0;
  let ret = U.index ? eq : Math.max(-0.95, eq * U.beta);
  let dvol = vp * (U.index ? 1 : Math.min(2.2, U.vol / 0.22));
  if (sc.names && sc.names[u]) { ret = sc.names[u].ret / 100; dvol = sc.names[u].vol; }
  return { ret, dvol };
}
export function scenarioPnl(book, sc) {
  const byDesk = Object.fromEntries(DESKS.map((d) => [d.id, 0]));
  const byUnderlying = {};
  for (const p of book) {
    const { ret, dvol } = shockFor(p.u, sc);
    const x = positionPnl(p, ret, dvol);
    byDesk[p.desk] += x;
    byUnderlying[p.u] = (byUnderlying[p.u] || 0) + x;
  }
  return { byDesk, byUnderlying, total: sum(Object.values(byDesk)) };
}
export function gridPnl(book, spots, vols, deskId = null) {
  // P&L for a uniform spot move (%) and volatility move (points) across every underlying
  return vols.map((v) => spots.map((s) => {
    let t = 0;
    for (const p of book) {
      if (deskId && p.desk !== deskId) continue;
      const U = UNDERLYINGS[p.u];
      t += positionPnl(p, Math.max(-0.95, (s / 100) * (U.index ? 1 : U.beta)), v * (U.index ? 1 : Math.min(2.2, U.vol / 0.22)));
    }
    return t;
  }));
}
export function reverseStress(book, lossLimit) {
  // Smallest broad fall, with volatility rising 0.9 points per 1% fall, that loses more than the limit
  const loss = (s) => -gridPoint(book, s, -0.9 * s);
  let lo = 0, hi = -60;
  if (loss(hi) < lossLimit) return null;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (loss(mid) >= lossLimit) hi = mid; else lo = mid; }
  return { spot: hi, vol: -0.9 * hi, loss: loss(hi) };
}
function gridPoint(book, s, v) { return gridPnl(book, [s], [v])[0][0]; }

// ---------- simulated market history (for VaR, backtesting and the P&L attribution test) ----------

const REGION_MODEL = { US: [1.0, 0.0020], TECH: [1.25, 0.0060], CA: [0.80, 0.0050], EU: [0.90, 0.0060], EM: [1.10, 0.0140] };

export function simulateHistory(n = 750, seed = 2618962) {
  // One market factor with volatility clustering and occasional jumps, regional and single-name noise on top.
  // Implied volatility rises when prices fall, and by more than it falls when they rise.
  const rng = mulberry32(seed), g = gaussFrom(rng);
  const days = [];
  let h = 1;
  for (let t = 0; t < n; t++) {
    const z = g() + (rng() < 0.02 ? 2.4 * g() : 0);
    const sd = 0.0088 * Math.sqrt(h);
    const m = sd * z;
    h = Math.min(9, 0.04 + 0.86 * h + 0.10 * z * z);
    const reg = {}, regVol = {};
    for (const [r, [b, s]] of Object.entries(REGION_MODEL)) {
      reg[r] = b * m + s * Math.sqrt(h) * g();
      const pct = reg[r] * 100;
      regVol[r] = -(pct < 0 ? 1.15 : 0.7) * pct + 0.35 * g();
    }
    const ret = {}, dvol = {};
    for (const [u, U] of Object.entries(UNDERLYINGS)) {
      if (U.index) { ret[u] = reg[U.region]; dvol[u] = regVol[U.region]; } else {
        ret[u] = U.beta * reg[U.region] + (U.vol / Math.sqrt(252)) * 0.65 * g();
        dvol[u] = regVol[U.region] * Math.min(2.2, U.vol / 0.22) + 0.3 * g();
      }
    }
    // a risk the sensitivities do not carry (dividend and correlation marks on the exotic book)
    days.push({ ret, dvol, offModel: g() });
  }
  return days;
}

// Off-model P&L per desk as a share of that desk's daily standard deviation (planted: the exotic book carries the most)
export const OFF_MODEL_SHARE = { cash: 0.03, flow: 0.12, struct: 0.62, fin: 0.03 };

export function pnlVectors(book, history) {
  // For every simulated day: full revaluation (model), sensitivities only (taylor), and with volatility only (volOnly)
  const mk = () => Object.fromEntries([...DESKS.map((d) => d.id), 'total'].map((k) => [k, new Array(history.length).fill(0)]));
  const model = mk(), taylor = mk(), volOnly = mk();
  history.forEach((day, t) => {
    for (const p of book) {
      const r = day.ret[p.u], v = day.dvol[p.u];
      const a = positionPnl(p, r, v), b = taylorPnl(p, r, v), c = positionPnl(p, 0, v);
      model[p.desk][t] += a; model.total[t] += a;
      taylor[p.desk][t] += b; taylor.total[t] += b;
      volOnly[p.desk][t] += c; volOnly.total[t] += c;
    }
  });
  // hypothetical P&L = model P&L plus the off-model piece
  const hypo = mk();
  for (const d of DESKS) {
    const sd = stdev(model[d.id]);
    history.forEach((day, t) => {
      const x = model[d.id][t] + OFF_MODEL_SHARE[d.id] * sd * day.offModel;
      hypo[d.id][t] = x; hypo.total[t] += x;
    });
  }
  return { model, taylor, volOnly, hypo };
}
export function stdev(a) {
  const m = sum(a) / a.length;
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}

export function backtest(model, hypo, window = 500, level = 0.99) {
  // Each day's VaR comes from the `window` days before it; an exception is a loss larger than that VaR
  const out = [];
  for (let t = window; t < model.length; t++) {
    const v = -quantile(sortAsc(model.slice(t - window, t)), 1 - level);
    out.push({ t, var: v, pnl: hypo[t], exception: hypo[t] < -v });
  }
  const exceptions = out.filter((d) => d.exception).length;
  // Basel traffic light for 250 observations at 99%
  const zone = exceptions <= 4 ? 'green' : exceptions <= 9 ? 'amber' : 'red';
  return { days: out, exceptions, zone };
}

export function spearman(a, b) {
  const rank = (x) => { const idx = x.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(x.length); idx.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
  const ra = rank(a), rb = rank(b), n = a.length, ma = (n + 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - ma); da += (ra[i] - ma) ** 2; db += (rb[i] - ma) ** 2; }
  return num / Math.sqrt(da * db);
}
export function ksDistance(a, b) {
  // Largest gap between the two empirical distributions
  const sa = sortAsc(a), sb = sortAsc(b);
  let i = 0, j = 0, d = 0;
  while (i < sa.length && j < sb.length) {
    const x = Math.min(sa[i], sb[j]);
    while (i < sa.length && sa[i] <= x) i++;
    while (j < sb.length && sb[j] <= x) j++;
    d = Math.max(d, Math.abs(i / sa.length - j / sb.length));
  }
  return d;
}
export function plaTest(hypo, risk) {
  // FRTB P&L attribution test (MAR32): does the risk model's P&L track the desk's own P&L?
  const rho = spearman(hypo, risk), ks = ksDistance(hypo, risk);
  const zone = rho < 0.7 || ks > 0.12 ? 'red' : rho < 0.8 || ks > 0.09 ? 'amber' : 'green';
  return { spearman: rho, ks, zone };
}

// ---------- FRTB standardised approach, equity risk class (simplified from Basel MAR21) ----------

export const FRTB = {
  rw: { 1: 0.55, 2: 0.60, 3: 0.45, 4: 0.55, 5: 0.30, 6: 0.35, 7: 0.40, 8: 0.50, 9: 0.70, 10: 0.50, 11: 0.70, 12: 0.15, 13: 0.25 },
  rho: (b) => (b <= 4 ? 0.15 : b <= 8 ? 0.25 : b === 9 ? 0.075 : b === 10 ? 0.125 : b === 11 ? 0 : 0.80),
  gamma: (b, c) => {
    if (b === 11 || c === 11) return 0;
    const ib = b >= 12, ic = c >= 12;
    return ib && ic ? 0.75 : ib || ic ? 0.45 : 0.15;
  },
  vegaRw: (b) => Math.min(1, 0.55 * Math.sqrt((b === 9 || b === 10 || b === 11 ? 60 : 20) / 10)),
  bucketName: { 6: 'Large cap, telecom & industrials', 7: 'Large cap, energy & materials', 8: 'Large cap, financials & technology', 12: 'Large-cap indices', 13: 'Other indices' },
};
const CORR_SCENARIOS = { low: (x) => Math.max(2 * x - 1, 0.75 * x), medium: (x) => x, high: (x) => Math.min(1, 1.25 * x) };

function aggregate(ws, adj, squareCorr = false, psi = null) {
  // ws: { underlying: weighted sensitivity }. Returns the charge after within-bucket and across-bucket aggregation.
  const buckets = {};
  for (const [u, w] of Object.entries(ws)) (buckets[UNDERLYINGS[u].frtb] ||= []).push(w);
  const K = {}, S = {};
  for (const [b, arr] of Object.entries(buckets)) {
    let r = adj(FRTB.rho(+b)); if (squareCorr) r *= r;
    let v = 0;
    for (let i = 0; i < arr.length; i++) for (let j = 0; j < arr.length; j++) {
      if (i === j) v += squareCorr ? Math.max(arr[i], 0) ** 2 : arr[i] ** 2;
      else v += r * arr[i] * arr[j] * (psi ? psi(arr[i], arr[j]) : 1);
    }
    K[b] = Math.sqrt(Math.max(0, v)); S[b] = sum(arr);
  }
  const ids = Object.keys(K);
  let tot = 0;
  for (const b of ids) for (const c of ids) {
    if (b === c) tot += K[b] ** 2;
    else { let gm = adj(FRTB.gamma(+b, +c)); if (squareCorr) gm *= gm; tot += gm * S[b] * S[c] * (psi ? psi(S[b], S[c]) : 1); }
  }
  if (tot < 0 && !squareCorr) {
    // Basel alternative: cap each bucket sum by its own charge and repeat
    tot = 0;
    for (const b of ids) S[b] = Math.max(Math.min(S[b], K[b]), -K[b]);
    for (const b of ids) for (const c of ids) tot += b === c ? K[b] ** 2 : adj(FRTB.gamma(+b, +c)) * S[b] * S[c];
  }
  return { charge: Math.sqrt(Math.max(0, tot)), K };
}

export function frtbSa(book, deskId = null) {
  const pos = deskId ? book.filter((p) => p.desk === deskId) : book;
  const delta = {}, vega = {}, up = {}, down = {};
  for (const p of pos) {
    const b = UNDERLYINGS[p.u].frtb, rw = FRTB.rw[b];
    delta[p.u] = (delta[p.u] || 0) + rw * p.g.delta;
    if (p.type !== 'option') continue;
    // vega sensitivity = vega x implied volatility (MAR21.25); maturities are netted per underlying here
    const rawVega = p.n * bsm(1, p.k, p.T, RATE, UNDERLYINGS[p.u].q, p.vol, p.cp).vega;
    vega[p.u] = (vega[p.u] || 0) + FRTB.vegaRw(b) * rawVega * p.vol * 100;
    // curvature: loss beyond delta when spot moves by the risk weight, up and down (MAR21.5)
    up[p.u] = (up[p.u] || 0) - (positionPnl(p, rw, 0) - rw * p.g.delta);
    down[p.u] = (down[p.u] || 0) - (positionPnl(p, -rw, 0) + rw * p.g.delta);
  }
  const psi = (a, b) => (a < 0 && b < 0 ? 0 : 1);
  const scen = {};
  for (const [name, adj] of Object.entries(CORR_SCENARIOS)) {
    const d = aggregate(delta, adj).charge, v = aggregate(vega, adj).charge;
    const cu = aggregate(up, adj, true, psi).charge, cd = aggregate(down, adj, true, psi).charge;
    scen[name] = { delta: d, vega: v, curvature: Math.max(cu, cd), total: d + v + Math.max(cu, cd) };
  }
  const binding = Object.entries(scen).sort((a, b) => b[1].total - a[1].total)[0];
  // residual risk add-on: 0.1% of notional for instruments with gap, correlation or behavioural risk (MAR23)
  const rrao = !deskId || deskId === 'struct' ? 0.001 * STRUCTURED_NOTE_NOTIONAL : 0;
  return { ...binding[1], scenario: binding[0], scenarios: scen, rrao, capital: binding[1].total + rrao, weighted: { delta, vega, up, down } };
}

// ---------- limits, exposures, liquidity ----------

export function exposures(book) {
  const byDesk = Object.fromEntries(DESKS.map((d) => [d.id, { delta: 0, gamma: 0, vega: 0, theta: 0 }]));
  const byUnderlying = {};
  for (const p of book) {
    const e = byDesk[p.desk], u = (byUnderlying[p.u] ||= { delta: 0, gamma: 0, vega: 0, byDesk: {} });
    for (const k of ['delta', 'gamma', 'vega', 'theta']) { e[k] += p.g[k]; if (k !== 'theta') u[k] += p.g[k]; }
    u.byDesk[p.desk] = (u.byDesk[p.desk] || 0) + p.g.delta;
  }
  return { byDesk, byUnderlying };
}

export function financingLiquidity(participation = 0.2) {
  const gross = sum(FINANCING.map((f) => f.gross));
  return FINANCING.map((f) => {
    const U = UNDERLYINGS[f.u];
    return { u: f.u, name: U.name, gross: f.gross, share: f.gross / gross, days: U.adv ? f.gross / (participation * U.adv) : 0.5 };
  }).sort((a, b) => b.days - a.days);
}

export function utilisation(value, limit) {
  const u = Math.abs(value) / limit;
  return { value, limit, u, status: u > 1 ? 'breach' : u >= 0.8 ? 'watch' : 'ok' };
}

// ---------- scenarios built from measured market episodes (docs/data/market.json) ----------

// Implied volatility moves by region for a given VIX change. Where the VIX did not move but a local
// market fell (Brazil 2017), local implied volatility is assumed to rise 0.6 points per 1% fall.
const VOL_BETA = { US: 1, TECH: 1.2, CA: 0.8, EU: 1, EM: 1.3 };
export function volShock(vixChange, moves = {}) {
  const out = {};
  for (const [r, b] of Object.entries(VOL_BETA)) out[r] = +(Math.max(vixChange * b, r === 'EM' ? -0.6 * (moves.EM ?? 0) : -99)).toFixed(1);
  return out;
}

export function buildScenarios(market) {
  const ep = Object.fromEntries(market.episodes.map((e) => [e.key, e]));
  const win = (w, label) => ({ eq: w.moves, vol: volShock(w.vixTo - w.vixFrom, w.moves), vix: [w.vixFrom, w.vixTo], window: label });
  const ten = (k) => win(ep[k].worst10, `${ep[k].worst10.from} to ${ep[k].worst10.to}`);
  const list = [
    { key: 'gfc', name: 'October 2008', kind: 'history', span: 'worst ten trading days', ...ten('gfc') },
    { key: 'euro', name: 'August 2011', kind: 'history', span: 'worst ten trading days', ...ten('euro') },
    { key: 'br17', name: 'Brazil, 18 May 2017', kind: 'history', span: 'one day', ...win(ep.br17.worstDay, ep.br17.worstDay.date) },
    { key: 'br18', name: 'Brazil, mid 2018', kind: 'history', span: 'worst ten trading days', ...ten('br18') },
    { key: 'covid', name: 'March 2020', kind: 'history', span: 'worst ten trading days', ...ten('covid') },
    { key: 'rates', name: 'June 2022', kind: 'history', span: 'worst ten trading days', ...ten('rates') },
    { key: 'ai26', name: 'AI unwind, 2026 so far', kind: 'history', span: `peak to latest low, ${ep.ai26.tradingDays} trading days`,
      eq: ep.ai26.peakToTrough, vol: volShock(ep.ai26.vixPeak - ep.ai26.vixStart, ep.ai26.peakToTrough), vix: [ep.ai26.vixStart, ep.ai26.vixPeak], window: `${ep.ai26.peak} to ${ep.ai26.trough}` },
  ];
  // two "what if" cases that translate a past lesson to the book as it stands
  const gap = ep.br17.worstDay.moves.EM, up = market.facts.bestDay;
  list.push({ key: 'gapname', name: 'Overnight gap in one crowded name', kind: 'what-if', span: `Nvidia falls ${Math.abs(gap)}%, as Brazil did in one day in 2017`,
    eq: { US: -1.5, TECH: -3, CA: -0.5, EU: -0.5, EM: -1 }, vol: volShock(4), names: { NVDA: { ret: gap, vol: 25 } }, vix: null, window: 'hypothetical' });
  list.push({ key: 'rebound', name: 'Sharp rebound', kind: 'what-if', span: `one day up ${up}%, as on ${market.facts.bestDayDate}`,
    eq: { US: up, TECH: up, CA: +(up * 0.9).toFixed(1), EU: +(up * 0.6).toFixed(1), EM: up }, vol: volShock(-12), vix: null, window: 'hypothetical' });
  return list;
}

export function lastDayScenario(market) {
  const d = market.lastDay;
  return { eq: d.moves, vol: volShock(d.vixTo - d.vixFrom, d.moves), date: d.date, vix: [d.vixFrom, d.vixTo] };
}

// Unexplained P&L planted for the demo: a dividend and correlation re-mark on the exotic book
export const PLANTED_MARKS = { struct: -2.1 };

export function pnlExplain(book, sc, marks = PLANTED_MARKS) {
  // delta, gamma, vega and one day of theta from the sensitivities; "higher" is what full revaluation adds on a
  // large move (the spot-volatility cross effects); "unexplained" is whatever is left: here, the planted re-mark
  const rows = Object.fromEntries(DESKS.map((d) => [d.id, { delta: 0, gamma: 0, vega: 0, theta: 0, higher: 0, unexplained: 0, actual: 0 }]));
  for (const p of book) {
    const { ret, dvol } = shockFor(p.u, sc);
    const r = rows[p.desk];
    const d = p.g.delta * ret, g = 0.5 * p.g.gamma * ret * ret, v = p.g.vega * dvol, th = p.g.theta;
    const full = positionPnl(p, ret, dvol, 1);
    r.delta += d; r.gamma += g; r.vega += v; r.theta += th; r.higher += full - (d + g + v + th); r.actual += full;
  }
  for (const [desk, m] of Object.entries(marks)) { rows[desk].unexplained += m; rows[desk].actual += m; }
  const total = { delta: 0, gamma: 0, vega: 0, theta: 0, higher: 0, unexplained: 0, actual: 0 };
  for (const r of Object.values(rows)) for (const k of Object.keys(total)) total[k] += r[k];
  return { ...rows, total };
}

// ---------- limits ----------

export const LIMITS = {
  business: { var: 8, stress: 90 },
  cash: { delta: 1.25, var: 4.5 },
  flow: { gamma: 3.0, vega: 1.0, var: 6, stress: 150 },
  struct: { vega: 2.0, var: 4 },
  fin: { delta: 0.5, days: 10, share: 0.15 },
};

export function limitTable(book, vec, scenarios) {
  const ex = exposures(book).byDesk;
  const worst = (desk) => Math.min(...scenarios.filter((s) => s.kind === 'history').map((s) => { const r = scenarioPnl(book, s); return desk ? r.byDesk[desk] : r.total; }));
  const liq = financingLiquidity();
  const topShare = [...liq].filter((x) => !UNDERLYINGS[x.u].index).sort((a, b) => b.share - a.share)[0];
  const row = (desk, name, unit, value, limit, note) => ({ desk, name, unit, note, ...utilisation(value, limit) });
  return [
    row('business', 'Value-at-risk, 1 day 99%', 'CAD m', varEs(vec.model.total).var, LIMITS.business.var),
    row('business', 'Worst historical stress', 'CAD m', worst(null), LIMITS.business.stress),
    row('cash', 'Net delta', 'CAD m per 1%', ex.cash.delta / 100, LIMITS.cash.delta),
    row('cash', 'Value-at-risk', 'CAD m', varEs(vec.model.cash).var, LIMITS.cash.var),
    row('flow', 'Gamma', 'CAD m of delta per 1%', ex.flow.gamma / 100, LIMITS.flow.gamma, 'Short gamma: the desk has to sell as the market falls'),
    row('flow', 'Vega', 'CAD m per vol point', ex.flow.vega, LIMITS.flow.vega),
    row('flow', 'Value-at-risk', 'CAD m', varEs(vec.model.flow).var, LIMITS.flow.var),
    row('flow', 'Worst historical stress', 'CAD m', worst('flow'), LIMITS.flow.stress),
    row('struct', 'Vega', 'CAD m per vol point', ex.struct.vega, LIMITS.struct.vega),
    row('struct', 'Value-at-risk', 'CAD m', varEs(vec.model.struct).var, LIMITS.struct.var),
    row('fin', 'Net delta', 'CAD m per 1%', ex.fin.delta / 100, LIMITS.fin.delta),
    row('fin', `Days to exit, ${liq[0].name}`, 'days at 20% of volume', liq[0].days, LIMITS.fin.days),
    row('fin', `Largest single name, ${topShare.name}`, 'share of financed book', topShare.share, LIMITS.fin.share),
  ];
}

// Delta of a desk (or the whole book) after a uniform market move: shows who has to trade, and which way
export function deltaProfile(book, spots, deskId = null) {
  return spots.map((s) => {
    let d = 0;
    for (const p of book) {
      if (deskId && p.desk !== deskId) continue;
      const U = UNDERLYINGS[p.u], r = Math.max(-0.95, (s / 100) * (U.index ? 1 : U.beta));
      d += p.type === 'stock' ? p.n * (1 + r) : p.n * bsm(1 + r, p.k, p.T, RATE, U.q, p.vol, p.cp).delta * (1 + r);
    }
    return d / 100;
  });
}

// Liquidity-horizon adjusted expected shortfall (MAR33, simplified): prices at 10 days, volatility at 20 days
export function liquidityAdjustedEs(vec, key = 'total') {
  const all = varEs(vec.model[key]).es * Math.sqrt(10);
  const volOnly = varEs(vec.volOnly[key]).es * Math.sqrt(10);
  return { es10: all, volAddOn: volOnly, total: Math.sqrt(all ** 2 + volOnly ** 2) };
}

// ---------- statistics (distribution shape, bell-curve comparison, beta, tail contributions) ----------

export function moments(a) {
  const n = a.length, mean = sum(a) / n;
  let s2 = 0, s3 = 0, s4 = 0;
  for (const x of a) { const d = x - mean; s2 += d * d; s3 += d * d * d; s4 += d * d * d * d; }
  const sd = Math.sqrt(s2 / (n - 1)), pop = Math.sqrt(s2 / n), s = sortAsc(a);
  return { n, mean, median: quantile(s, 0.5), sd, skew: s3 / n / pop ** 3, kurt: s4 / n / pop ** 4 - 3, min: s[0], max: s[n - 1],
    beyond3: a.filter((x) => Math.abs(x - mean) > 3 * sd).length };
}

export function histogram(a, lo, step, bins) {
  const counts = new Array(bins).fill(0);
  for (const x of a) counts[Math.max(0, Math.min(bins - 1, Math.floor((x - lo) / step)))]++;
  return counts;
}

export function normInv(p) {
  // Inverse of the normal distribution function (Acklam's rational approximation, relative error below 1.2e-9)
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const tail = (q) => (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Value-at-risk if the series followed a bell curve with the same mean and standard deviation
export const normalVar = (mean, sd, level) => normInv(level) * sd - mean;

export function ols(x, y) {
  // Least-squares line y = intercept + slope x. The slope is the beta of y to x.
  const n = x.length;
  if (n < 3) return { slope: 0, intercept: 0, r2: 0, n };
  const mx = sum(x) / n, my = sum(y) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 0, n };
}
export const correlation = (x, y) => { const f = ols(x, y); return Math.sign(f.slope) * Math.sqrt(f.r2); };

export function tailDays(total, level) {
  // Indices of the worst (1 - level) share of days, worst first
  const k = Math.max(1, Math.round(total.length * (1 - level)));
  return total.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]).slice(0, k).map((d) => d[1]);
}
export function tailContribution(parts, total, level) {
  // Each part's average loss on the business's worst days. The parts add up exactly to the expected shortfall.
  const idx = tailDays(total, level), out = {};
  for (const [k, v] of Object.entries(parts)) out[k] = -sum(idx.map((i) => v[i])) / idx.length;
  return out;
}
export function pnlByUnderlying(book, history) {
  const out = {};
  history.forEach((day, t) => {
    for (const p of book) (out[p.u] ||= new Array(history.length).fill(0))[t] += positionPnl(p, day.ret[p.u], day.dvol[p.u]);
  });
  return out;
}
