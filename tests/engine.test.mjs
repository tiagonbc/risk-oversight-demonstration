// Run with:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../docs/assets/engine.js';

const market = JSON.parse(fs.readFileSync(new URL('../docs/data/market.json', import.meta.url)));
const book = E.buildBook(), hist = E.simulateHistory(), vec = E.pnlVectors(book, hist), scenarios = E.buildScenarios(market);
const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b} (tolerance ${tol})`);

test('normal distribution function matches known values', () => {
  close(E.normCdf(0), 0.5, 1e-9); close(E.normCdf(1.96), 0.975, 1e-4); close(E.normCdf(-1.6449), 0.05, 1e-4);
});

test('Black-Scholes price matches a textbook value', () => {
  // Hull: S=42, K=40, r=10%, vol=20%, T=0.5 gives call 4.76 and put 0.81
  close(E.bsm(42, 40, 0.5, 0.10, 0, 0.20, 'call').price, 4.76, 0.005);
  close(E.bsm(42, 40, 0.5, 0.10, 0, 0.20, 'put').price, 0.81, 0.005);
});

test('put-call parity holds for every option in the book', () => {
  for (const p of book.filter((x) => x.type === 'option')) {
    const q = E.UNDERLYINGS[p.u].q, c = E.bsm(1, p.k, p.T, E.RATE, q, p.vol, 'call').price, pt = E.bsm(1, p.k, p.T, E.RATE, q, p.vol, 'put').price;
    close(c - pt, Math.exp(-q * p.T) - p.k * Math.exp(-E.RATE * p.T), 1e-6);
  }
});

test('Greeks agree with finite differences', () => {
  const g = E.bsm(1, 0.9, 0.5, 0.03, 0.01, 0.25, 'put'), h = 1e-4;
  const up = E.bsm(1 + h, 0.9, 0.5, 0.03, 0.01, 0.25, 'put').price, dn = E.bsm(1 - h, 0.9, 0.5, 0.03, 0.01, 0.25, 'put').price;
  close(g.delta, (up - dn) / (2 * h), 1e-5);
  close(g.gamma, (up - 2 * g.price + dn) / (h * h), 1e-3);
  close(g.vega, E.bsm(1, 0.9, 0.5, 0.03, 0.01, 0.26, 'put').price - g.price, 2e-5);
});

test('full revaluation and the sensitivities agree for a small move', () => {
  for (const p of book) close(E.positionPnl(p, 0.001, 0.1), E.taylorPnl(p, 0.001, 0.1), 2e-5 * Math.max(1, Math.abs(p.n)));
});

test('option desks are delta hedged, the flow desk is short gamma, the note book is long volatility', () => {
  const ex = E.exposures(book).byDesk;
  assert.ok(Math.abs(ex.flow.delta) < 60 && Math.abs(ex.struct.delta) < 60);
  assert.ok(ex.flow.gamma < 0);
  assert.ok(ex.struct.vega > 0);
});

test('the simulated history is reproducible and fat-tailed', () => {
  const again = E.simulateHistory();
  assert.deepEqual(again[100].ret, hist[100].ret);
  const r = hist.map((d) => d.ret.SPX), sd = E.stdev(r);
  assert.ok(sd > 0.006 && sd < 0.016, `daily standard deviation ${sd}`);
  assert.ok(r.filter((x) => Math.abs(x) > 3 * sd).length > 750 * 0.0027, 'more three-sigma days than a normal curve gives');
});

test('expected shortfall is at least value-at-risk at the same level', () => {
  const pnl = vec.model.total, a = E.varEs(pnl, 0.975, 0.975);
  assert.ok(a.es >= a.var);
  assert.ok(E.varEs(pnl).var > 0);
});

test('diversification: business VaR is below the sum of the desks', () => {
  const total = E.varEs(vec.model.total).var, parts = E.DESKS.reduce((s, d) => s + E.varEs(vec.model[d.id]).var, 0);
  assert.ok(total < parts);
});

test('rank correlation and distribution gap behave at their limits', () => {
  const a = Array.from({ length: 200 }, (_, i) => Math.sin(i) * i);
  close(E.spearman(a, a), 1, 1e-12); close(E.spearman(a, a.map((x) => -x)), -1, 1e-12);
  assert.equal(E.ksDistance(a, a), 0);
  assert.equal(E.ksDistance([1, 2, 3], [10, 11, 12]), 1);
});

test('planted model gap: only the note book is not green in the attribution test', () => {
  const zones = Object.fromEntries(E.DESKS.map((d) => [d.id, E.plaTest(vec.hypo[d.id].slice(-250), vec.taylor[d.id].slice(-250)).zone]));
  assert.deepEqual(zones, { cash: 'green', flow: 'green', struct: 'amber', fin: 'green' });
});

test('limits: exactly one breach, and it is the flow desk gamma', () => {
  const rows = E.limitTable(book, vec, scenarios), breaches = rows.filter((r) => r.status === 'breach');
  assert.equal(rows.length, 13);
  assert.equal(breaches.length, 1);
  assert.equal(`${breaches[0].desk} ${breaches[0].name}`, 'flow Gamma');
  assert.equal(E.utilisation(-79, 100).status, 'ok'); assert.equal(E.utilisation(80, 100).status, 'watch'); assert.equal(E.utilisation(-101, 100).status, 'breach');
});

test('scenarios: desk results add up, and the worst historical case is October 2008', () => {
  for (const s of scenarios) { const r = E.scenarioPnl(book, s); close(r.total, E.sum(Object.values(r.byDesk)), 1e-9); close(r.total, E.sum(Object.values(r.byUnderlying)), 1e-9); }
  const ranked = scenarios.filter((s) => s.kind === 'history').map((s) => [s.key, E.scenarioPnl(book, s).total]).sort((a, b) => a[1] - b[1]);
  assert.equal(ranked[0][0], 'gfc');
  assert.equal(scenarios.length, 9);
});

test('reverse stress lands exactly on the stress limit', () => {
  const r = E.reverseStress(book, E.LIMITS.business.stress);
  close(r.loss, E.LIMITS.business.stress, 1e-3);
  assert.ok(r.spot < 0 && r.vol > 0);
});

test('P&L explain: components add up, and the planted re-mark is the only unexplained item', () => {
  const x = E.pnlExplain(book, E.lastDayScenario(market));
  for (const d of E.DESKS) { const r = x[d.id]; close(r.delta + r.gamma + r.vega + r.theta + r.higher + r.unexplained, r.actual, 1e-9); }
  close(x.struct.unexplained, -2.1, 1e-12); close(x.flow.unexplained, 0, 1e-12);
  assert.ok(x.total.actual < -E.varEs(vec.model.total).var, 'the last day is a backtesting exception');
});

test('standardised approach: risk weights, a hand-checked bucket, and netting across desks', () => {
  assert.equal(E.FRTB.rw[12], 0.15); assert.equal(E.FRTB.rw[8], 0.5); close(E.FRTB.vegaRw(12), 0.55 * Math.SQRT2, 1e-12);
  // two long stock positions in bucket 8 (RY and TD, 100 each): K = sqrt(50^2 + 50^2 + 2 x rho x 50 x 50)
  const two = [{ desk: 'cash', u: 'RY', type: 'stock', n: 100 }, { desk: 'cash', u: 'TD', type: 'stock', n: 100 }].map((p) => ({ ...p, g: E.greeks(p) }));
  const sa = E.frtbSa(two, 'cash');
  close(sa.scenarios.medium.delta, Math.sqrt(2 * 2500 + 2 * 0.25 * 2500), 1e-9);
  close(sa.scenarios.high.delta, Math.sqrt(2 * 2500 + 2 * 0.3125 * 2500), 1e-9);
  assert.equal(sa.scenario, 'high'); assert.equal(sa.vega, 0); assert.equal(sa.curvature, 0);
  const whole = E.frtbSa(book).capital, parts = E.DESKS.reduce((s, d) => s + E.frtbSa(book, d.id).capital, 0);
  assert.ok(whole < parts, 'netting across desks lowers capital');
});

test('a long option has no curvature charge and a short one does', () => {
  const mk = (n) => [{ desk: 'flow', u: 'SPX', type: 'option', cp: 'put', k: 0.9, T: 0.5, n, vol: E.impliedVol('SPX', 0.9, 0.5) }].map((p) => ({ ...p, g: E.greeks(p) }));
  assert.equal(E.frtbSa(mk(100), 'flow').curvature, 0);
  assert.ok(E.frtbSa(mk(-100), 'flow').curvature > 0);
});

test('inverse normal matches known quantiles and inverts the distribution function', () => {
  close(E.normInv(0.975), 1.959964, 1e-5); close(E.normInv(0.99), 2.326348, 1e-5); close(E.normInv(0.5), 0, 1e-9);
  for (const p of [0.001, 0.02, 0.3, 0.8, 0.999]) close(E.normCdf(E.normInv(p)), p, 2e-7);
  close(E.normalVar(0, 1, 0.99), 2.326348, 1e-5);
});

test('moments: a symmetric series has no skew, and a fat-tailed one has excess kurtosis', () => {
  const m = E.moments([-2, -1, 0, 1, 2]);
  close(m.mean, 0, 1e-12); close(m.median, 0, 1e-12); close(m.skew, 0, 1e-12); close(m.sd, Math.sqrt(2.5), 1e-12); close(m.kurt, 1.7 - 3, 1e-12);
  assert.ok(E.moments([...Array(98).fill(0), -10, 10]).kurt > 10);
  assert.ok(E.moments(vec.model.total).skew < 0, 'the mock business has a longer loss tail');
});

test('histogram keeps every observation and clips outliers into the end bins', () => {
  const h = E.histogram([-5, -0.9, -0.1, 0.1, 0.4, 9], -1, 0.5, 4);
  assert.deepEqual(h, [2, 1, 2, 1]);
  assert.equal(E.sum(E.histogram(vec.model.total, -10, 0.5, 30)), 750);
});

test('least-squares beta recovers a known line', () => {
  const x = Array.from({ length: 50 }, (_, i) => i / 10 - 2.5), y = x.map((v) => 3 - 1.5 * v);
  const f = E.ols(x, y);
  close(f.slope, -1.5, 1e-12); close(f.intercept, 3, 1e-12); close(f.r2, 1, 1e-12); close(E.correlation(x, y), -1, 1e-12);
});

test('the flow desk is short gamma in the outcomes: its beta is larger on down days than on up days', () => {
  const x = hist.map((d) => d.ret.SPX * 100), y = vec.model.flow, dn = [[], []], up = [[], []];
  x.forEach((v, i) => { const t = v < 0 ? dn : up; t[0].push(v); t[1].push(y[i]); });
  assert.ok(E.ols(dn[0], dn[1]).slope > 1.5 * E.ols(up[0], up[1]).slope);
});

test('tail contributions by desk and by underlying add up exactly to expected shortfall', () => {
  const parts = Object.fromEntries(E.DESKS.map((d) => [d.id, vec.model[d.id]]));
  for (const L of [0.95, 0.975, 0.99]) {
    const es = E.varEs(vec.model.total, L, L).es;
    close(E.sum(Object.values(E.tailContribution(parts, vec.model.total, L))), es, 1e-9);
    close(E.sum(Object.values(E.tailContribution(E.pnlByUnderlying(book, hist), vec.model.total, L))), es, 1e-9);
  }
});

test('history file: aligned weekly series, sane rolling measures, events inside the range', () => {
  const h = JSON.parse(fs.readFileSync(new URL('../docs/data/history.json', import.meta.url))), n = h.weeks.length;
  assert.ok(n > 1000 && h.weeks[0] < '2007-02' && h.weeks[n - 1] === h.asOf);
  for (const m of Object.values(h.markets)) {
    for (const k of ['px', 'vol21', 'vol63', 'vol250', 'varSlow', 'varFast', 'dd', 'worst']) assert.equal(m[k].length, n, `${m.name} ${k}`);
    assert.ok(Math.abs(m.px[0] - 100) < 5, 'levels are rebased to 100 at the start of 2007');
    assert.ok(Math.max(...m.dd) <= 0 && Math.min(...m.vol21) > 0 && Math.min(...m.varFast) > 0);
  }
  // the fast measure reacts first: in the worst COVID week it is far above the slow one
  const us = h.markets.US, w = h.weeks.findIndex((d) => d >= '2020-03-20');
  assert.ok(us.varFast[w] > 1.5 * us.varSlow[w]);
  assert.equal(h.events.length, 22);
  for (const e of h.events) { assert.ok(e.week >= 0 && e.week < n && h.weeks[e.week] >= e.date); assert.ok(e.title && e.text && e.vix > 0); }
  for (let i = 1; i < h.events.length; i++) assert.ok(h.events[i].date > h.events[i - 1].date, 'events are in date order');
});

test('market data file: seven episodes with consistent dates and falls', () => {
  assert.equal(market.episodes.length, 7);
  for (const e of market.episodes) { assert.ok(e.peak < e.trough); assert.ok(e.peakToTrough[e.driver] < 0); assert.ok(e.vixPeak >= e.vixStart); }
  assert.equal(market.history.months.length, market.history.drawdown.length);
  for (const d of Object.values(market.dist)) {
    assert.equal(E.sum(d.hist.counts), d.n);
    assert.equal(d.var.length, 100);
    for (let i = 0; i < 99; i++) assert.ok(d.var[i] >= d.var[i + 1] && d.es[i] >= d.var[i], 'tail quantiles fall as the tail probability grows');
    assert.ok(d.kurt > 3, 'real daily returns have fat tails');
  }
  for (const b of Object.values(market.beta)) assert.equal(b.months.length, b.rollBeta.length);
});
