import * as E from './engine.js';
import { lineChart, barChart, hbars, histChart, scatterChart, clearCharts, num, signed, esc, divColor, hideTip } from './charts.js';

const ROUTES = [
  { path: '/', n: '', label: 'Overview' },
  { path: '/oversight', n: '01', label: 'Oversight', goal: 'Risk oversight and communication' },
  { path: '/challenge', n: '02', label: 'Challenge', goal: 'Effective challenge and risk management' },
  { path: '/partners', n: '03', label: 'Partnership', goal: 'Partnership across functions' },
  { path: '/stress', n: '04', label: 'Stress', goal: 'Risk framework enhancement' },
  { path: '/capital', n: '05', label: 'Measures & capital', goal: 'Measurement and process improvement' },
  { path: '/markets', n: '06', label: 'Markets', goal: 'Regulatory and market expertise' },
  { path: '/history', n: '', label: 'History' },
  { path: '/statistics', n: '', label: 'Statistics' },
  { path: '/about', n: '', label: 'About' },
];
// Menu icons: one line-drawn glyph per section, drawn in the current text colour
const ic = (d) => `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  '/': ic('<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/>'),
  '/oversight': ic('<path d="M3 14.5a7 7 0 1 1 14 0"/><path d="M10 14.5l3.4-4.6"/><circle cx="10" cy="14.5" r="1.1"/><path d="M5.2 9.8l1 .7M10 6.2v1.2M14.8 9.8l-1 .7"/>'),
  '/challenge': ic('<path d="M4 3.5h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9.5L6 16.5v-3H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/><path d="M8.3 7a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3"/><path d="M10 11.6v.1"/>'),
  '/partners': ic('<circle cx="5" cy="5.5" r="2"/><circle cx="15" cy="5.5" r="2"/><circle cx="10" cy="14.5" r="2"/><path d="M7 5.5h6M6 7.3l3 5.4M14 7.3l-3 5.4"/>'),
  '/stress': ic('<path d="M11.2 2.5L4.5 11.2h4.9l-.9 6.3 6.9-8.9h-5l.8-6.1z"/>'),
  '/capital': ic('<path d="M3 17h14"/><rect x="4.4" y="10.5" width="2.8" height="4.5"/><rect x="8.6" y="7" width="2.8" height="8"/><rect x="12.8" y="3.5" width="2.8" height="11.5"/>'),
  '/markets': ic('<path d="M5.5 3v3M5.5 12v5M10 2.5v2.5M10 10v7.5M14.5 5.5v3.5M14.5 14v3"/><rect x="4" y="6" width="3" height="6"/><rect x="8.5" y="5" width="3" height="5"/><rect x="13" y="9" width="3" height="5"/>'),
  '/history': ic('<path d="M3 3.5v13.5h14"/><path d="M5.5 13.5l3-4.5 2.5 2.5 2-5 2.5 3"/>'),
  '/statistics': ic('<path d="M2 15.2c3 0 4-3.2 5-6.4.8-2.6 1.6-4.6 3-4.6s2.200 2 3 4.600c1 3.200 2 6.400 5 6.400"/><path d="M2 17.500h16"/><path d="M5.200 15.200v-1.700" />'),
  '/about': ic('<circle cx="10" cy="7" r="3"/><path d="M4 17c.6-3 3-4.6 6-4.6s5.4 1.6 6 4.6"/>'),
};
const DESK = Object.fromEntries(E.DESKS.map((d) => [d.id, d]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const date = (iso) => { const [y, m, d] = iso.split('-'); return `${+d} ${MONTHS[+m - 1]} ${y}`; };
const cad = (x, d = 1) => `CAD ${num(x, d)}m`;
const isoToText = (s) => s.replace(/\d{4}-\d{2}-\d{2}/g, (m) => date(m));
const pctTxt = (x) => `${num(x, 1)}%`;
const ST = { ok: 'Within limit', watch: 'Watch', breach: 'Breach' };
const ZONE = { green: ['ok', 'Green'], amber: ['watch', 'Amber'], red: ['breach', 'Red'] };
const st = (s, label) => `<span class="st ${s}">${label || ST[s]}</span>`;

let S = null;
const ui = { limFilter: 'all', btDesk: 'total', btLevel: 99, exDesk: 'total', scn: 'gfc', gridDesk: 'all', corr: 'binding', whatif: 0, ep: 'covid', code: 'sql',
  hMarket: 'US', hRange: 'all', hWin: 21, hMeasure: 'var', hLog: true, hEvents: true, hEvent: null,
  stSeries: 'total', level: 99, stNormal: true, stLog: false, betaDesk: 'flow', betaFactor: 'SPX', rollKind: 'beta', corrMode: 'all' };

// ---------- one-time computation ----------

function compute(market) {
  const book = E.buildBook(), hist = E.simulateHistory(), vec = E.pnlVectors(book, hist);
  const scenarios = E.buildScenarios(market).map((s) => ({ ...s, res: E.scenarioPnl(book, s) }));
  const last = E.lastDayScenario(market), explain = E.pnlExplain(book, last);
  const limits = E.limitTable(book, vec, scenarios);
  const keys = ['total', ...E.DESKS.map((d) => d.id)];
  const bt = {}, vr = {};
  for (const k of keys) {
    vr[k] = E.varEs(vec.model[k]);
    const b = E.backtest(vec.model[k], vec.hypo[k]);
    const days = b.days.map((d) => ({ var: d.var, pnl: d.pnl, exception: d.exception }));
    days.push({ var: vr[k].var, pnl: explain[k].actual, exception: explain[k].actual < -vr[k].var, real: true });
    const exceptions = days.slice(-250).filter((d) => d.exception).length;
    bt[k] = { days: days.slice(-250), exceptions, zone: exceptions <= 4 ? 'green' : exceptions <= 9 ? 'amber' : 'red' };
  }
  const pla = Object.fromEntries(E.DESKS.map((d) => [d.id, E.plaTest(vec.hypo[d.id].slice(-250), vec.taylor[d.id].slice(-250))]));
  const sa = { total: E.frtbSa(book), ...Object.fromEntries(E.DESKS.map((d) => [d.id, E.frtbSa(book, d.id)])) };
  return { market, book, hist, vec, scenarios, last, explain, limits, bt, vr, pla, sa, ex: E.exposures(book), liq: E.financingLiquidity(),
    les: E.liquidityAdjustedEs(vec), reverse: E.reverseStress(book, E.LIMITS.business.stress), checks: null, whatif: {} };
}

const worstHist = () => S.scenarios.filter((s) => s.kind === 'history').sort((a, b) => a.res.total - b.res.total)[0];
const counts = () => ({ breach: S.limits.filter((l) => l.status === 'breach').length, watch: S.limits.filter((l) => l.status === 'watch').length, n: S.limits.length });

function structVega() {
  let long = 0, short = 0;
  for (const p of S.book) {
    if (p.desk !== 'struct' || p.type !== 'option') continue;
    const v = p.n * E.bsm(1, p.k, p.T, E.RATE, E.UNDERLYINGS[p.u].q, p.vol, p.cp).vega;
    if (p.T > 1) long += v; else short += v;
  }
  return { long, short };
}

function dataChecks() {
  if (S.checks) return S.checks;
  const opts = S.book.filter((p) => p.type === 'option');
  // delta from a 1% bump against the sum of sensitivities
  const bump = S.book.reduce((a, p) => a + (E.positionPnl(p, 0.01, 0) - E.positionPnl(p, -0.01, 0)) / 2, 0);
  const sens = S.book.reduce((a, p) => a + p.g.delta * 0.01, 0);
  // put-call parity on every option's strike and maturity
  let parity = 0;
  for (const p of opts) {
    const q = E.UNDERLYINGS[p.u].q, c = E.bsm(1, p.k, p.T, E.RATE, q, p.vol, 'call').price, pt = E.bsm(1, p.k, p.T, E.RATE, q, p.vol, 'put').price;
    if (Math.abs(c - pt - (Math.exp(-q * p.T) - p.k * Math.exp(-E.RATE * p.T))) < 1e-6) parity++;
  }
  const finOk = E.DESKS.filter((d) => Math.abs(S.explain[d.id].unexplained) <= 0.5).length;
  const lagDays = Math.round((new Date(S.market.asOf) - new Date(S.market.episodes.find((e) => e.key === 'ai26').trough)) / 864e5);
  S.checks = [
    { name: 'Positions match the front-office feed', d: 'Every trade in the risk system exists in the trading system, with the same size', c: `${S.book.length} of ${S.book.length}`, s: 'ok' },
    { name: 'Every option has a volatility marked today', d: 'Planted for the demo: one long-dated BCE put was last marked two days ago', c: `${opts.length - 1} of ${opts.length}`, s: 'watch' },
    { name: 'Risk P&L agrees with Finance P&L, desk by desk', d: 'Tolerance CAD 0.5m. Structured Notes is out by the re-mark that is open with the desk', c: `${finOk} of ${E.DESKS.length} desks`, s: finOk === E.DESKS.length ? 'ok' : 'breach' },
    { name: 'Full revaluation agrees with the sensitivities', d: 'A 1% move repriced position by position against delta times 1%', c: `${num(bump, 2)} vs ${num(sens, 2)}`, s: Math.abs(bump - sens) < 0.05 ? 'ok' : 'breach' },
    { name: 'Pricing library passes put-call parity', d: 'Call minus put equals forward minus strike, at every strike and maturity in the book', c: `${parity} of ${opts.length}`, s: parity === opts.length ? 'ok' : 'breach' },
    { name: 'VaR history window is complete', d: 'No missing days or missing risk factors in the scenario history', c: `${S.hist.length} of ${S.hist.length} days`, s: 'ok' },
    { name: 'Limits match the governance register', d: 'The limits loaded this morning are the approved ones, same version and date', c: `${S.limits.length} of ${S.limits.length}`, s: 'ok' },
    { name: 'Scenario library is current', d: `The latest episode in the library ends ${lagDays} days before the data date`, c: `${S.scenarios.length} scenarios`, s: lagDays <= 10 ? 'ok' : 'watch' },
    { name: 'Backtesting exceptions are recorded', d: 'Yesterday’s loss was larger than VaR: logged, explained and reported the same morning', c: '1 new', s: 'watch' },
  ];
  return S.checks;
}

// ---------- shared pieces ----------

const seg = (key, options) => `<div class="seg" role="group">${options.map(([v, l]) => `<button data-seg="${key}" data-v="${v}" aria-pressed="${String(ui[key]) === String(v)}">${l}</button>`).join('')}</div>`;
const deskOpts = (first) => [first, ...E.DESKS.map((d) => [d.id, d.short])];
const head = (r, h1, lede) => `<header class="ph"><div class="num">${r.n}</div><div><p class="goal">${r.goal}</p><h1>${h1}</h1>${lede ? `<p class="lede">${lede}</p>` : ''}</div></header>`;
const brief = (posting, mine) => `<div class="brief"><div><div class="k">The posting asks for</div><p>${posting}</p></div><div class="mine"><div class="k">What I would bring</div><p>${mine}</p></div></div>`;
const kpi = (l, v, s) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
const legend = (items) => `<div class="legend">${items.map(([c, l, sq]) => `<span><i class="${sq ? 'sq' : ''}" style="background:${c}"></i>${l}</span>`).join('')}</div>`;
function prevNext(path) {
  const i = ROUTES.findIndex((r) => r.path === path), a = ROUTES[i - 1], b = ROUTES[i + 1];
  return `<div class="pn">${a ? `<a href="#${a.path}"><span>Previous</span>${a.n ? a.n + ' ' : ''}${a.label}</a>` : '<span></span>'}${b ? `<a href="#${b.path}"><span>Next</span>${b.n ? b.n + ' ' : ''}${b.label}</a>` : '<span></span>'}</div>
  <div class="foot"><span>Demonstration built by Tiago Costa. Mock positions and limits at a fictional desk; market episodes measured from real daily data to ${date(S.market.asOf)}. Not affiliated with CIBC.</span><a href="#/about">How it is built</a></div>`;
}

// ---------- pages ----------

const PAGES = {};

PAGES['/'] = () => {
  const c = counts(), w = worstHist(), ch = dataChecks(), okc = ch.filter((x) => x.s === 'ok').length;
  const rows = [
    ['/oversight', '01', 'Oversight', 'Risk oversight and communication', 'One page each morning: what moved, what is close to a limit, and who needs to know.', `${c.breach} breach`, `${c.watch} on watch, ${c.n} limits`],
    ['/challenge', '02', 'Challenge', 'Effective challenge', 'Questions for the desks, each backed by a number they can check for themselves.', cad(S.explain.struct.unexplained), 'unexplained P&L, open'],
    ['/partners', '03', 'Partnership', 'Partnership across functions', 'One timetable shared with Trading, Finance, Technology and Governance, and data checks before anything is reported.', `${ch.length - okc} flagged`, `of ${ch.length} data checks`],
    ['/stress', '04', 'Stress', 'Risk framework enhancement', 'Scenarios measured from the crises I traded through, replayed on the book as it stands.', cad(w.res.total, 0), `worst: ${w.name}`],
    ['/capital', '05', 'Measures & capital', 'Measurement and process improvement', 'Expected shortfall, backtesting, the FRTB standardised charge and a pre-trade what-if, all automated.', cad(S.sa.total.capital, 0), 'standardised capital'],
    ['/markets', '06', 'Markets', 'Regulatory and market expertise', 'The products, the capital rules, and what each market episode since 2009 changed in how I manage risk.', `${S.market.episodes.length}`, 'episodes measured'],
  ];
  return {
    html: `
    <div class="hero">
      <div>
        <p class="for">For the role of Director, Trading Market Risk, Global Equities</p>
        <h1>How I would oversee market risk for a Global Equities business</h1>
        <p class="lede">The posting sets six goals. Each one is answered here with a working tool: the metrics, the charts and the procedure I would run. The positions are mock. The market episodes are real, and I traded through them.</p>
      </div>
      <div class="slip">
        <div class="slip-h"><b>Risk brief</b><span>close of ${date(S.last.date)}</span></div>
        <div class="slip-r"><span>Day P&amp;L, all desks</span><span>${cad(S.explain.total.actual)}</span></div>
        <div class="slip-r"><span>Value-at-risk, 1 day 99%</span><span>${cad(S.vr.total.var)}</span></div>
        <div class="slip-r"><span>Limits</span><span>${c.breach} breach · ${c.watch} watch</span></div>
        <div class="slip-r"><span>Worst historical stress</span><span>${cad(w.res.total)}</span></div>
        <a class="go" href="#/oversight">Open the morning brief →</a>
      </div>
    </div>
    <div class="goals">
      ${rows.map((r) => `<a class="goal-row" href="#${r[0]}"><span class="n">${r[1]}</span><span class="t"><i class="ic">${ICONS[r[0]]}</i><span class="tx"><b>${r[2]}</b><span>${r[3]}</span></span></span><span class="d">${r[4]}</span><span class="f"><b>${r[5]}</b><span>${r[6]}</span></span><span class="arr">→</span></a>`).join('')}
      <a class="goal-row" href="#/history"><span class="n">+</span><span class="t"><i class="ic">${ICONS['/history']}</i><span class="tx"><b>History</b><span>Prices, volatility, events</span></span></span><span class="d">Twenty years of weekly prices for five markets with rolling volatility, value-at-risk and drawdown on one time axis, and the market events behind each spike.</span><span class="f"><b>22</b><span>events measured</span></span><span class="arr">→</span></a>
      <a class="goal-row" href="#/statistics"><span class="n">+</span><span class="t"><i class="ic">${ICONS['/statistics']}</i><span class="tx"><b>Statistics</b><span>Behind every number</span></span></span><span class="d">Move the confidence level and watch the tail: distributions, value-at-risk against the bell curve, betas and correlations, for the mock desks and for real markets.</span><span class="f"><b>${num(S.market.dist.US.var[0] / E.normalVar(S.market.dist.US.mean, S.market.dist.US.sd, 0.999), 1)}×</b><span>S&amp;P 500 tail vs bell curve</span></span><span class="arr">→</span></a>
    </div>
    <section class="blk">
      <div class="blk-h"><h2>The markets behind the scenarios</h2><a class="btn" href="#/markets">See each episode</a>
        <p>S&amp;P 500, fall from its running high at each month-end since 2007. I began trading in February 2009, a month before the low, and have traded full time since 2017. The shaded periods are the scenarios used in this tool.</p></div>
      <div class="chart" id="c-hist"></div>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>What this work protects</h2></div>
      <div class="cols3">
        <div><h3>Clients</h3><p>A structured note is a promise to a client that depends on its hedge holding in a fall. Barrier and gap risk are followed name by name, and financed positions are sized so they can be unwound in days, not weeks.</p></div>
        <div><h3>The bank's capital</h3><p>Every desk has limits on delta, gamma, vega, value-at-risk and stress loss. A breach is escalated the same morning with a plan and a date, and capital is measured before a trade, not after.</p></div>
        <div><h3>Trust in the numbers</h3><p>Each figure traces back to positions and market data that passed their checks. Each challenge is logged with the desk's answer. Independent oversight only works when it is on time and on the record.</p></div>
      </div>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Who built it</h2><a class="btn" href="#/about">About and method</a></div>
      <p style="max-width:48em">I am Tiago Costa. I have traded since February 2009 and full time on my own capital since 2017, running more than twenty systematic strategies in Canadian, US and Brazilian equities with execution software, pre-trade limits and daily reconciliation that I built. Earlier I traded and risk-managed a $2B portfolio of power contracts at EDP in Brazil. I designed and built this tool for this role, and I can change any part of it.</p>
    </section>
    ${prevNext('/')}`,
    after: () => historyChart('c-hist', null, 250),
  };
};

function historyChart(id, selected, height, onPick) {
  const h = S.market.history, mi = (iso) => Math.max(0, h.months.indexOf(iso.slice(0, 7)));
  const short = { gfc: '2008', euro: '2011', br17: '2017', br18: '2018', covid: '2020', rates: '2022', ai26: '2026' };
  const spans = S.market.episodes.map((e) => ({ key: e.key, from: mi(e.peak), to: Math.max(mi(e.trough), mi(e.peak) + 1), label: short[e.key], on: e.key === selected, row: e.key === 'br17' ? 1 : 0 }));
  const xt = []; h.months.forEach((m, i) => { if (m.endsWith('-01') && (+m.slice(0, 4)) % 3 === 0) xt.push({ i, label: m.slice(0, 4) }); });
  lineChart(document.getElementById(id), {
    n: h.months.length, height, label: 'S&P 500 drawdown from its high, by month', yFmt: (v) => num(v, 0) + '%', yMax: 2,
    series: [{ name: 'S&P 500', color: '#8b1d41', values: h.drawdown, area: true, width: 1.6 }], spans, xTicks: xt,
    tip: (i) => `<b>${MONTHS[+h.months[i].slice(5) - 1]} ${h.months[i].slice(0, 4)}</b><div class="r"><span>Below the high</span><span>${num(h.drawdown[i])}%</span></div><div class="r"><span>Highest VIX close</span><span>${num(h.vixMax[i])}</span></div>`,
    onClick: onPick ? (i) => { const hit = spans.filter((s) => i >= s.from - 2 && i <= s.to + 2).sort((a, b) => Math.abs((a.from + a.to) / 2 - i) - Math.abs((b.from + b.to) / 2 - i))[0]; if (hit) onPick(hit.key); } : null,
  });
}

PAGES['/oversight'] = (r) => {
  const c = counts(), x = S.explain.total, mult = Math.abs(x.actual) / S.vr.total.var, w = worstHist();
  const groups = [['business', 'All desks', '#1d2024'], ...E.DESKS.map((d) => [d.id, d.name, d.color])];
  const shown = (l) => ui.limFilter === 'all' || l.status !== 'ok';
  const dec = (l) => (l.limit >= 20 ? 0 : l.limit >= 4 ? 1 : 2);
  const fmtV = (l) => (l.unit.startsWith('share') ? pctTxt(l.value * 100) : num(Math.abs(l.value), dec(l)));
  const fmtL = (l) => (l.unit.startsWith('share') ? pctTxt(l.limit * 100) : num(l.limit, dec(l)));
  const limHtml = groups.map(([id, name, color]) => {
    const rows = S.limits.filter((l) => l.desk === id && shown(l));
    if (!rows.length) return '';
    return `<div class="lim-group"><i class="dot" style="background:${color}"></i>${name}</div>` + rows.map((l) => `
      <div class="lim"><div class="nm"><b>${l.name}</b><span>${l.unit}</span></div>
      <div class="track"><div class="fill ${l.status}" style="width:${Math.min(l.u / 1.25, 1) * 100}%"></div><div class="mk w" style="left:64%"></div><div class="mk" style="left:80%"></div></div>
      <div class="val"><b>${fmtV(l)}</b> of ${fmtL(l)} · ${Math.round(l.u * 100)}%</div>${st(l.status)}</div>`).join('');
  }).join('');
  const us = Object.keys(S.ex.byUnderlying).sort((a, b) => Math.abs(S.ex.byUnderlying[b].delta) - Math.abs(S.ex.byUnderlying[a].delta));
  const maxD = Math.max(...us.map((u) => Math.abs(S.ex.byUnderlying[u].delta)));
  const cell = (v) => { if (!v || Math.abs(v) < 0.05) return '<td class="c" style="color:#b9b5ad">·</td>'; const k = divColor(v, maxD); return `<td class="c" style="background:${k.bg};color:${k.fg}">${signed(v, 1)}</td>`; };
  const heat = `<div class="tbl-wrap"><table class="heat"><thead><tr><th>Underlying</th>${E.DESKS.map((d) => `<th class="num">${d.short}</th>`).join('')}<th class="num">All</th></tr></thead><tbody>
    ${us.map((u) => `<tr><td>${E.UNDERLYINGS[u].name}</td>${E.DESKS.map((d) => cell(S.ex.byUnderlying[u].byDesk[d.id])).join('')}${cell(S.ex.byUnderlying[u].delta)}</tr>`).join('')}</tbody></table></div>`;
  return {
    html: `${head(r, 'What moved, what is close to a limit, and who needs to know?')}
    ${brief('Monitor trading activity, limit utilization and key risk exposures across the desks, and communicate changes in desk P&amp;L and risk on time, with clear analysis for senior management.', 'A brief that is ready before the desks open: P&amp;L against value-at-risk, every limit on one scale, and a note a senior reader finishes in a minute. The numbers refresh themselves, so my time goes to judgment.')}
    <div class="kpis">
      ${kpi(`Day P&amp;L, ${date(S.last.date)}`, `${num(x.actual)}<small>CAD m</small>`, `S&amp;P 500 ${num(S.last.eq.US)}%, Nasdaq-100 ${num(S.last.eq.TECH)}%, VIX ${S.last.vix[0]} to ${S.last.vix[1]}`)}
      ${kpi('Loss against value-at-risk', `${num(mult, 1)}<small>× VaR</small>`, `VaR is ${cad(S.vr.total.var)}. A loss above it is a backtesting exception`)}
      ${kpi('Limits', `${c.breach}<small>breach</small> ${c.watch}<small>watch</small>`, `${c.n} limits across four desks; watch starts at 80%`)}
      ${kpi('Worst historical stress', `${num(w.res.total, 0)}<small>CAD m</small>`, `${w.name}, ${Math.round((Math.abs(w.res.total) / E.LIMITS.business.stress) * 100)}% of the stress limit`)}
    </div>
    <section class="blk">
      <div class="blk-h"><h2>Every limit on one scale</h2>${seg('limFilter', [['all', 'All limits'], ['open', 'Breach and watch only']])}</div>
      <div class="lim-scale"><div></div><div><span style="left:0">0</span><span style="left:64%">80%</span><span style="left:80%">100%</span></div><div></div><div></div></div>
      ${limHtml}
      <p class="read"><b>How to read it.</b> Each bar is how much of a limit is used. The dark line is the limit; the pale line is 80%, where a desk goes on watch. Flow Derivatives is over its gamma limit: after the fall, its short puts sit closer to the market, so the desk has to sell more stock for every further 1% down.</p>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Daily P&amp;L against value-at-risk</h2><div class="ctl">${seg('btLevel', [[95, '95%'], ['97.5', '97.5%'], [99, '99%']])} ${seg('btDesk', deskOpts(['total', 'All desks']))}</div>
        <p>250 trading days. A good risk model is crossed about two or three times a year: more means it understates risk, none at all means it may be too loose to be useful.</p></div>
      ${legend([['#5a616b', 'Daily P&amp;L', true], ['#8b1d41', 'Value-at-risk (loss side)'], ['#c41f3e', 'Exception: loss larger than VaR', true]])}
      <div class="chart" id="c-bt"></div>
      <p class="read" id="bt-read"></p>
    </section>
    <section class="blk two wide-left">
      <div><div class="blk-h"><h2>Where the exposure sits</h2><p>Net delta by underlying and desk, in CAD m of stock-equivalent. Blue is long, orange is short.</p></div>${heat}</div>
      <div><div class="blk-h"><h2>The morning note</h2><button class="btn" id="copy-note">Copy</button><p>Written from the numbers on this page. This is the paragraph senior management would receive.</p></div>
        <div class="note" id="note">${morningNote()}</div></div>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>The procedure behind the page</h2></div>
      <ol class="steps">
        <li><span><b>Check the data before reading it.</b> Positions, prices and volatilities pass their checks first (see Partnership). A wrong input is fixed at the source, not adjusted in the report.</span></li>
        <li><span><b>Explain the P&amp;L.</b> Split each desk's result into delta, gamma, vega and time decay. Whatever is left over is a question for the desk and for Finance.</span></li>
        <li><span><b>Read the limits.</b> Breaches go to the desk head and to Limit Monitoring and Governance the same morning, with the cause, the desk's plan and a date.</span></li>
        <li><span><b>Write one paragraph.</b> What happened, why, what is open, and what I need from whom. Sent before the open, in words a non-specialist can follow.</span></li>
      </ol>
    </section>
    ${prevNext(r.path)}`,
    after: () => {
      const k = ui.btDesk, lvl = +ui.btLevel, b = btAt(k, lvl), d = b.days, n = d.length;
      lineChart(document.getElementById('c-bt'), {
        n, height: 300, label: 'Daily P&L against value-at-risk', yFmt: (v) => num(v, 0),
        bars: { values: d.map((q) => q.pnl) }, series: [{ name: 'VaR', color: '#8b1d41', values: d.map((q) => -q.var), width: 1.8 }],
        points: d.map((q, i) => (q.exception ? { i, value: q.pnl } : null)).filter(Boolean),
        xTicks: [{ i: 0, label: '250 days ago', anchor: 'start' }, { i: Math.round(n / 2), label: '125 days ago' }, { i: n - 1, label: date(S.last.date), anchor: 'end' }],
        tip: (i) => `<b>${d[i].real ? date(S.last.date) : `Day ${i + 1} of ${n}`}</b><div class="r"><span>P&amp;L</span><span>${signed(d[i].pnl, 2)}</span></div><div class="r"><span>VaR</span><span>${num(d[i].var, 2)}</span></div>${d[i].exception ? '<div>Exception</div>' : ''}`,
      });
      const z = ZONE[b.zone];
      document.getElementById('bt-read').innerHTML = `<b>${k === 'total' ? 'All desks' : DESK[k].name}:</b> ${b.exceptions} exception${b.exceptions === 1 ? '' : 's'} in 250 days. ${lvl === 99 ? `${st(z[0], z[1] + ' zone')} &nbsp;Basel's test allows up to four before a model moves from green to amber.` : `At ${lvl}% a sound model expects about ${num(250 * (1 - lvl / 100), 1)}.`} <a href="#/statistics">See the full distribution</a>. The last bar is the real market move of ${date(S.last.date)} applied to the mock book; earlier days are simulated.`;
      document.getElementById('copy-note').onclick = (ev) => { navigator.clipboard?.writeText(document.getElementById('note').innerText); ev.target.textContent = 'Copied'; };
    },
  };
};

function btAt(k, lvl) {
  // Backtest at another confidence level, with the real last day appended as on the 99% view
  if (lvl === 99) return S.bt[k];
  const key = `${k}@${lvl}`;
  if ((S.btx ||= {})[key]) return S.btx[key];
  const v = E.varEs(S.vec.model[k], lvl / 100).var, b = E.backtest(S.vec.model[k], S.vec.hypo[k], 500, lvl / 100);
  const days = b.days.map((d) => ({ var: d.var, pnl: d.pnl, exception: d.exception }));
  days.push({ var: v, pnl: S.explain[k].actual, exception: S.explain[k].actual < -v, real: true });
  const last = days.slice(-250);
  return (S.btx[key] = { days: last, exceptions: last.filter((d) => d.exception).length, zone: 'green' });
}

function morningNote() {
  const x = S.explain, t = x.total, c = counts(), mult = Math.abs(t.actual) / S.vr.total.var;
  const br = S.limits.filter((l) => l.status === 'breach');
  return `<div class="hd">TO: Head of Trading Market Risk, Global Equities · ${date(S.last.date)} close</div>
  <p><b>Global Equities lost ${cad(Math.abs(t.actual))}, ${num(mult, 1)} times one-day value-at-risk (${cad(S.vr.total.var)}).</b> This is a backtesting exception and is recorded as one. The S&amp;P 500 fell ${num(Math.abs(S.last.eq.US))}% and the Nasdaq-100 ${num(Math.abs(S.last.eq.TECH))}%; the VIX closed at ${S.last.vix[1]} from ${S.last.vix[0]}.</p>
  <p><b>Where it came from.</b> Flow Derivatives lost ${cad(Math.abs(x.flow.actual))}, of which ${cad(Math.abs(x.flow.vega))} was the rise in volatility on its short options. Cash &amp; ETF lost ${cad(Math.abs(x.cash.actual))} on its long inventory. Structured Notes gained ${cad(x.struct.actual)} on long-dated volatility, after a ${cad(Math.abs(x.struct.unexplained))} re-mark that the sensitivities do not explain.</p>
  <p><b>Limits.</b> ${br.map((l) => `${DESK[l.desk]?.name || 'Business'} ${l.name.toLowerCase()} is at ${Math.round(l.u * 100)}% of its limit`).join('; ')}. ${c.watch} other limits are above 80%, including the business stress limit.</p>
  <p><b>Open today.</b> (1) Flow desk to give its plan for gamma by 10:00. (2) Finance and the Structured desk to confirm the re-mark. (3) Stress team and I refresh the AI-unwind scenario with yesterday's levels.</p>`;
}

PAGES['/challenge'] = (r) => {
  const x = S.explain, sv = structVega(), nv = S.ex.byUnderlying.NVDA, gap = S.scenarios.find((s) => s.key === 'gapname'), reb = S.scenarios.find((s) => s.key === 'rebound');
  const gam = S.limits.find((l) => l.desk === 'flow' && l.name === 'Gamma'), spots = [-5];
  const flowAfter = E.deltaProfile(S.book, [-5, 0], 'flow');
  const bce = S.liq[0], ry = S.limits.find((l) => l.name.startsWith('Largest'));
  const qs = [
    ['Flow Derivatives', 'Your gamma is over its limit and growing as the market falls. What is the plan if we open another 5% lower?', `After a further 5% fall the desk would be long CAD ${num((flowAfter[0] - flowAfter[1]) * 100, 0)}m more stock than it is hedged for, and would have to sell it into a falling market.`, `${Math.round(gam.u * 100)}%`, 'of the gamma limit'],
    ['Structured Notes', 'What is the CAD 2.1m that delta, gamma, vega and time decay do not explain?', 'A loss the sensitivities cannot see usually means a dividend, correlation or barrier mark moved. I would ask for the re-mark by underlying, and check it against Finance’s independent price verification.', cad(x.struct.unexplained), 'unexplained P&L'],
    ['Structured Notes', `Your vega is reported as ${cad(S.ex.byDesk.struct.vega)} a point. What is it by maturity?`, `Before any weighting the desk is long ${cad(sv.long)} per point in options beyond one year and short ${cad(Math.abs(sv.short))} inside one year. The small reported figure rests on long-dated volatility moving a fraction as far as short-dated. When volatility collapses after a spike, the long side gives it back.`, cad(reb.res.byDesk.struct), 'in a sharp rebound'],
    ['Cash & ETF, Flow, Financing', 'Three desks hold Nvidia. Who owns the total?', `Net of hedges the business is long ${cad(nv.delta)} of Nvidia across ${Object.values(nv.byDesk).filter((v) => Math.abs(v) > 0.5).length} desks, and the flow desk is short calls on it. No single desk limit sees the sum.`, cad(gap.res.total), `if it gaps ${num(Math.abs(S.market.episodes.find((e) => e.key === 'br17').worstDay.moves.EM))}% overnight`],
    ['Equity Financing', 'How long would it take to exit the largest financed positions if a client defaulted this week?', `${bce.name} would take ${num(bce.days, 1)} days at 20% of daily volume, and ${ry.name.split(', ')[1]} is ${pctTxt(ry.value * 100)} of the financed book against a ${pctTxt(ry.limit * 100)} cap.`, `${num(bce.days, 1)} days`, `to exit ${bce.name}`],
  ];
  const sp = [-20, -15, -10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10];
  return {
    html: `${head(r, 'Where would I push back, and with what evidence?')}
    ${brief('Provide effective challenge on trading strategies, positions and risk management practices. Identify material market risk factors and emerging risk, and apply sound judgment to support strong second-line oversight.', 'Nine years of running my own book taught me which questions a trader hopes nobody asks. I would bring them to the desk with a number attached, log the answer, and follow up until it is closed.')}
    <div class="kpis">
      ${kpi('Unexplained P&amp;L', `${num(x.struct.unexplained)}<small>CAD m</small>`, 'Structured Notes, open with the desk and Finance')}
      ${kpi('Flow desk gamma', `${Math.round(gam.u * 100)}<small>% of limit</small>`, 'Short options moved closer to the market in the fall')}
      ${kpi('Structured vega by maturity', `${signed(sv.long, 1)}<small>/</small>${num(sv.short, 1)}`, `CAD m per point beyond and inside one year, before weighting. Reported net: ${num(S.ex.byDesk.struct.vega)}`)}
      ${kpi('Nvidia across desks', `${num(nv.delta, 0)}<small>CAD m</small>`, 'Net long; no single desk limit sees the total')}
    </div>
    <section class="blk">
      <div class="blk-h"><h2>Why the P&amp;L moved</h2>${seg('exDesk', deskOpts(['total', 'All desks']))}
        <p>The day's result split into what each sensitivity predicts. The last bar is what none of them explains.</p></div>
      <div class="chart" id="c-ex"></div>
      <p class="read"><b>How to read it.</b> Delta is the market direction, gamma the change in delta during the move, vega the change in implied volatility, theta one day of time decay. Large-move effects appear when prices and volatility move a lot together, and are a reason not to trust small-move sensitivities on a day like this. Unexplained should be near zero: when it is not, I ask.</p>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Who has to trade if the market keeps moving</h2>
        <p>Each desk's delta after a further market move, in CAD m per 1%. A line that rises to the left means the desk gets longer as prices fall and has to sell into the fall.</p></div>
      ${legend([...E.DESKS.map((d) => [d.color, d.name]), ['#1d2024', 'All desks']])}
      <div class="chart" id="c-dp"></div>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>The challenge log for today</h2><p>Each question names the desk, states the evidence and stays open until it is answered.</p></div>
      ${qs.map((q, i) => `<div class="q"><div class="i">${String(i + 1).padStart(2, '0')}</div><div><b>${q[1]}</b><p>${q[2]}</p><div class="to">To: ${q[0]}</div></div><div class="ev"><b>${q[3]}</b><span>${q[4]}</span></div></div>`).join('')}
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Risks the daily numbers do not show</h2><p>Value-at-risk and the Greeks cover price and volatility. On an exotic and financing book, these also need a number and an owner.</p></div>
      <div class="tbl-wrap"><table><thead><tr><th>Risk</th><th>Why it matters here</th><th>How I would size it</th></tr></thead><tbody>
        <tr><td><b>Dividends</b></td><td>Long-dated notes assume dividends years ahead. A cut by one bank or pipeline reprices every note written on it.</td><td>Reprice with dividends 20% lower on each name; hold a reserve against the largest.</td></tr>
        <tr><td><b>Correlation</b></td><td>Worst-of notes lose when the stocks in the basket stop moving together.</td><td>Reprice with correlations 10 points lower, and at the lowest level seen in each past crisis.</td></tr>
        <tr><td><b>Barrier gaps</b></td><td>Near a barrier the hedge changes sign within a few percent. A market that gaps through it cannot be hedged on the way.</td><td>List every note within 10% of its barrier, with the loss if the stock opens 5% beyond it.</td></tr>
        <tr><td><b>Exit time and borrow</b></td><td>Financed positions are only as safe as the time it takes to sell them or the cost to keep borrowing them.</td><td>Days to exit at 20% of volume, by name, and the loss if that takes twice as long in a stressed market.</td></tr>
        <tr><td><b>Crowding</b></td><td>The same name or theme held by several desks, and by clients, sells off together.</td><td>One cross-desk table by name and theme, with a gap scenario for the top five.</td></tr>
      </tbody></table></div>
    </section>
    ${prevNext(r.path)}`,
    after: () => {
      const k = ui.exDesk, e = x[k];
      barChart(document.getElementById('c-ex'), {
        cats: ['Delta', 'Gamma', 'Vega', 'Theta', 'Large-move', 'Unexplained', 'Total'], catsNarrow: ['Delta', 'Gamma', 'Vega', 'Theta', 'Large', 'Unexpl.', 'Total'], sub: ['direction', 'convexity', 'volatility', 'one day', 'effects', '', 'P&L'],
        values: [e.delta, e.gamma, e.vega, e.theta, e.higher, e.unexplained, e.actual],
        colors: ['#5a616b', '#5a616b', '#5a616b', '#5a616b', '#5a616b', '#c41f3e', '#1d2024'], height: 300, dec: 1, label: 'P&L explained by component',
        tip: (i) => `<b>${['Delta', 'Gamma', 'Vega', 'Theta', 'Large-move effects', 'Unexplained', 'Total P&L'][i]}</b><div class="r"><span>${k === 'total' ? 'All desks' : DESK[k].name}</span><span>${signed([e.delta, e.gamma, e.vega, e.theta, e.higher, e.unexplained, e.actual][i], 2)}</span></div>`,
      });
      const ser = [...E.DESKS.map((d, i) => ({ name: d.short, color: d.color, values: E.deltaProfile(S.book, sp, d.id), dy: [0, 0, 0, 0][i] })), { name: 'All desks', color: '#1d2024', values: E.deltaProfile(S.book, sp), width: 2.4 }];
      lineChart(document.getElementById('c-dp'), {
        n: sp.length, height: 300, label: 'Desk delta after a market move', series: ser, endLabels: false, yFmt: (v) => num(v, 1),
        xTicks: sp.map((s, i) => ({ i, label: (s > 0 ? '+' : '') + s + '%' })).filter((_, i) => i % 2 === 0),
        tip: (i) => `<b>Market ${signed(sp[i], 1)}%</b>${ser.map((s) => `<div class="r"><span>${s.name}</span><span>${signed(s.values[i], 2)}</span></div>`).join('')}`,
      });
    },
  };
};

PAGES['/partners'] = (r) => {
  const ch = dataChecks(), okc = ch.filter((x) => x.s === 'ok').length;
  const day = [
    ['06:30', 'Data lands', 'Positions from the trading systems, closing prices and volatility marks, Finance’s P&L.', 'Technology · Market Risk Solutions', 'A failed feed is flagged to its owner before anyone reads a number'],
    ['07:00', 'Checks run', 'The nine checks below. Nothing is reported until they pass or the exception is written down.', 'Quantitative Risk · Finance', 'A list of what failed, with the trade or price that caused it'],
    ['07:30', 'Limits and P&L explain', 'Utilization against every limit; each desk’s P&L split into its drivers.', 'Limit Monitoring and Governance', 'Breaches and new watch items, with cause'],
    ['08:15', 'Brief goes out', 'One paragraph and one page, before the desks open.', 'Head of Trading Market Risk · senior management', 'What happened, why, what is open'],
    ['10:00', 'Challenge meeting', 'Open questions put to the desk heads; answers and dates logged.', 'Trading', 'A written question, the evidence, and time to answer'],
    ['15:30', 'Intraday look', 'Positions and limits rechecked on live prices on volatile days.', 'Trading · global risk managers', 'Early warning before the close, across time zones'],
    ['Weekly', 'Stress and measures review', 'Scenario results, new scenarios, model performance and capital.', 'Stress team · Quantitative Risk · Finance', 'Results by desk, and what changed since last week'],
  ];
  return {
    html: `${head(r, 'Who needs what from market risk, and by when?')}
    ${brief('Build strong working relationships with partners across Capital Markets Risk, Trading, Finance, Technology, Quantitative Risk, Market Risk Solutions, and Limit Monitoring and Governance, and improve reporting, processes and risk transparency together.', 'Oversight is a shared production line. I would agree one timetable with every partner, publish the checks that run before anything is reported, and fix problems where they start. At EDP I reported positions and risk to senior management; in my own operation I am every one of these functions, so I know what each needs from the others.')}
    <div class="kpis three">
      ${kpi('Data checks clean this morning', `${okc}<small>of ${ch.length}</small>`, 'The rest are written up with an owner, not hidden')}
      ${kpi('Partner functions in the daily cycle', '7', 'Each with a named hand-off and a time')}
      ${kpi('From data to brief', '1h 45<small>min</small>', 'Target for an automated run: 06:30 to 08:15')}
    </div>
    <section class="blk">
      <div class="blk-h"><h2>One day in the cycle</h2><p>A proposed timetable. The times would be agreed with each team; the principle is that every hand-off has an owner and a clock.</p></div>
      ${day.map((d) => `<div class="day"><div class="t">${d[0]}</div><div><b>${d[1]}</b><p>${d[2]}</p></div><div class="w"><b>${d[3]}</b>${d[4]}</div></div>`).join('')}
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Checks that run before the brief goes out</h2><p>These run live on the mock book each time this page loads. Two problems were planted so the page shows what a failure looks like.</p></div>
      ${ch.map((c) => `<div class="chk"><div>${c.name}<span class="d">${c.d}</span></div><div class="c">${c.c}</div>${st(c.s, c.s === 'ok' ? 'Pass' : c.s === 'watch' ? 'Review' : 'Fail')}</div>`).join('')}
    </section>
    <section class="blk">
      <div class="blk-h"><h2>What each partner gives and gets</h2></div>
      <div class="tbl-wrap"><table><thead><tr><th>Partner</th><th>What I need from them</th><th>What they get from me</th></tr></thead><tbody>
        <tr><td><b>Trading</b></td><td>Strategy intent, hedging plans, early notice of large or unusual trades</td><td>Fast, consistent answers; challenge in writing with evidence; no surprises upward</td></tr>
        <tr><td><b>Finance</b></td><td>Official P&amp;L and independent price verification results</td><td>A P&amp;L explain that reconciles to theirs, and the list of differences</td></tr>
        <tr><td><b>Technology</b></td><td>Reliable feeds, a place to run code, change control</td><td>Clear specifications, tested prototypes in Python and SQL, fewer manual spreadsheets to support</td></tr>
        <tr><td><b>Quantitative Risk</b></td><td>Model documentation, known limitations, validation results</td><td>Evidence from the desk level: where the model's P&amp;L drifts from the desk's, and on which products</td></tr>
        <tr><td><b>Market Risk Solutions</b></td><td>Risk system output and reporting tools</td><td>Requirements that come from daily use, and help testing new reports</td></tr>
        <tr><td><b>Limit Monitoring and Governance</b></td><td>The approved limit framework and escalation rules</td><td>Breaches reported the same morning with cause and plan; proposals when a limit no longer fits the business</td></tr>
        <tr><td><b>Stress team</b></td><td>Scenario design standards and firm-wide scenarios</td><td>Equity-specific scenarios, results by desk, and the positions that drive them</td></tr>
      </tbody></table></div>
    </section>
    ${prevNext(r.path)}`,
  };
};

PAGES['/stress'] = (r) => {
  const sc = S.scenarios.find((s) => s.key === ui.scn) || S.scenarios[0], w = worstHist(), rv = S.reverse;
  const spots = [-40, -30, -20, -10, -5, 0, 5, 10, 20], vols = [0, 10, 20, 40];
  const grid = E.gridPnl(S.book, spots, vols, ui.gridDesk === 'all' ? null : ui.gridDesk), gmax = Math.max(...grid.flat().map(Math.abs));
  const btn = (s) => `<button data-seg="scn" data-v="${s.key}" aria-pressed="${s.key === sc.key}"><b>${s.name}</b><span class="p">${signed(s.res.total, 1)}</span><span class="sp">${isoToText(s.span)}</span></button>`;
  const reg = [['US', 'S&P 500'], ['TECH', 'Nasdaq-100'], ['CA', 'Canada'], ['EU', 'Europe'], ['EM', 'Brazil']];
  return {
    html: `${head(r, 'What would the crises I traded through do to this book?')}
    ${brief('Partner with the Stress team to strengthen scenario analysis and support enhancements to the broader market risk framework for the Global Equities business.', 'Scenarios should come from what markets have really done, be sized on the worst ten days and not the average one, and grow as new episodes happen. I would add the cases value-at-risk misses: a fall without a volatility spike, a gap in one name, a violent rebound.')}
    <div class="kpis">
      ${kpi('Worst historical scenario', `${num(w.res.total, 0)}<small>CAD m</small>`, `${w.name}: ${Math.round((Math.abs(w.res.total) / E.LIMITS.business.stress) * 100)}% of the CAD ${E.LIMITS.business.stress}m stress limit`)}
      ${kpi('Fall that breaks the stress limit', `${num(rv.spot, 0)}<small>%</small>`, `Reverse stress: a broad fall of that size with volatility up ${num(rv.vol, 0)} points`)}
      ${kpi('Scenarios in the library', `${S.scenarios.length}`, `${S.scenarios.filter((s) => s.kind === 'history').length} measured from market data, ${S.scenarios.filter((s) => s.kind !== 'history').length} what-if cases`)}
      ${kpi('Largest loss on a rally', `${num(S.scenarios.find((s) => s.key === 'rebound').res.byDesk.struct, 0)}<small>CAD m</small>`, 'Structured Notes in a sharp rebound: stress is not only about falls')}
    </div>
    <section class="blk">
      <div class="blk-h"><h2>Replay a scenario on the book</h2><p>Each historical scenario uses the real moves of five equity markets and the VIX over the window shown. Positions are repriced one by one; figures are P&amp;L in CAD m.</p></div>
      <div class="scn-layout">
        <div class="scn-list"><div class="grp">Measured from history</div>${S.scenarios.filter((s) => s.kind === 'history').map(btn).join('')}<div class="grp">What-if cases</div>${S.scenarios.filter((s) => s.kind !== 'history').map(btn).join('')}</div>
        <div>
          <h3>${sc.name} <span class="muted" style="font-weight:400">· ${isoToText(sc.span)}${sc.kind === 'history' ? `, ${sc.window.split(' to ').map(date).join(' to ')}` : ''}</span></h3>
          <div class="facts">${reg.map(([k, l]) => `<span>${l} <b>${signed(sc.eq[k] ?? 0, 1)}%</b></span>`).join('')}${sc.vix ? `<span>VIX <b>${sc.vix[0]} → ${sc.vix[1]}</b></span>` : `<span>Volatility <b>${signed(sc.vol.US, 0)} pts</b></span>`}</div>
          <div class="chart" id="c-scn"></div>
          <div class="two" style="margin-top:18px">
            <div><h3>Where it comes from</h3><div class="chart" id="c-drv"></div></div>
            <div><h3>What I would take from it</h3><p style="font-size:14.5px;color:var(--ink2)">${scenarioRead(sc)}</p></div>
          </div>
        </div>
      </div>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Every combination of fall and volatility</h2>${seg('gridDesk', deskOpts(['all', 'All desks']))}
        <p>P&amp;L in CAD m if every market moves by the percentage across the top while implied volatility rises by the points on the left.</p></div>
      <div class="tbl-wrap"><table class="heat"><thead><tr><th>Volatility</th>${spots.map((s) => `<th class="num">${s > 0 ? '+' : ''}${s}%</th>`).join('')}</tr></thead><tbody>
        ${vols.map((v, i) => `<tr><td>${v === 0 ? 'unchanged' : `+${v} points`}</td>${spots.map((s, j) => { const k = divColor(grid[i][j], gmax); return `<td class="c" style="background:${k.bg};color:${k.fg}">${Math.abs(grid[i][j]) < 0.05 ? '0' : signed(grid[i][j], 0)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="read"><b>How to read it.</b> The top row is the case that hurts most and is least expected: prices fall but volatility does not rise, as in 2022, so the book's long volatility does not pay. Reading down a column shows how much of the loss the long-dated options give back when volatility does rise.</p>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>How a new scenario enters the library</h2></div>
      <ol class="steps">
        <li><span><b>Measure the episode.</b> Peak to trough, worst day and worst ten trading days for each market, and the move in volatility, taken from data and dated.</span></li>
        <li><span><b>Translate it to today's book.</b> A 2017 gap in Brazil is a lesson about one market gapping while the rest stay calm. The scenario that matters now is the same gap in the names this book is crowded in.</span></li>
        <li><span><b>Agree it with the Stress team and the desks.</b> The desks say what they would do in it. A plan that needs liquidity the scenario removes is not a plan.</span></li>
        <li><span><b>Set a limit against it, and rerun it daily.</b> A scenario with no limit is a report. The reverse stress is recomputed with it, so we always know how far away the limit is.</span></li>
      </ol>
    </section>
    ${prevNext(r.path)}`,
    after: () => {
      barChart(document.getElementById('c-scn'), {
        cats: [...E.DESKS.map((d) => d.short), 'All desks'], catsNarrow: ['Cash', 'Flow', 'Notes', 'Fin.', 'All'], values: [...E.DESKS.map((d) => sc.res.byDesk[d.id]), sc.res.total],
        colors: [...E.DESKS.map((d) => d.color), '#1d2024'], height: 290, dec: 1, label: 'Scenario P&L by desk',
        limit: sc.res.total < -20 ? { value: -E.LIMITS.business.stress, label: 'Limit' } : null,
        tip: (i) => (i < 4 ? `<b>${E.DESKS[i].name}</b><div>${E.DESKS[i].what}</div><div class="r"><span>P&amp;L</span><span>${signed(sc.res.byDesk[E.DESKS[i].id], 2)}</span></div>` : `<b>All desks</b><div class="r"><span>P&amp;L</span><span>${signed(sc.res.total, 2)}</span></div><div class="r"><span>Stress limit</span><span>${num(-E.LIMITS.business.stress, 0)}</span></div>`),
      });
      const drv = Object.entries(sc.res.byUnderlying).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6).map(([u, v]) => ({ label: E.UNDERLYINGS[u].name, value: v, color: v < 0 ? '#c2513a' : '#2f6f9f' }));
      hbars(document.getElementById('c-drv'), { rows: drv, labelWidth: 122, label: 'Largest contributions by underlying' });
    },
  };
};

function scenarioRead(sc) {
  const d = sc.res.byDesk;
  const m = {
    gfc: `The flow desk's short puts lose ${cad(Math.abs(d.flow), 0)} and the note book's long volatility earns ${cad(d.struct, 0)} back. The business survives on an offset between two desks, so the first question is whether that offset would really hold: same underlyings, same maturities, same days.`,
    euro: 'A third of the 2008 loss in a market that fell half as far. Losses grow faster than the fall because the short puts gain delta on the way down.',
    br17: 'Almost nothing, because this book holds little Brazil. That is the point: a 16% one-day gap with a calm VIX is invisible until it is in a market you hold. See the what-if case that applies it to Nvidia.',
    br18: 'A slow fall in one market while the US rose. Value-at-risk stayed calm throughout; a cumulative loss trigger is what catches a move like this.',
    covid: `The fastest fall in the library. Canada fell further than the US, and this book is long Canada through its note barriers and inventory. The offset from long volatility is the largest here (${cad(d.struct, 0)}), which also makes it the scenario most exposed to that offset failing.`,
    rates: `The loss is two-thirds of the 2008 case on less than half the fall, because volatility barely rose and the long-dated options paid only ${cad(d.struct, 0)}. A scenario library needs falls without a volatility spike.`,
    ai26: 'The episode still under way. Technology fell four times as far as Europe, so the damage depends on where the book is crowded, not on the index. This scenario is refreshed with each new low.',
    gapname: 'One name gapping costs more than the whole of Brazil 2017 did, with every index nearly flat. Concentration limits by name, across desks, are the control.',
    rebound: `The business makes money, but Structured Notes loses ${cad(Math.abs(d.struct), 0)} as volatility collapses. A desk can breach on a good day for the bank; limits are read desk by desk.`,
  };
  return m[sc.key] || '';
}

PAGES['/capital'] = (r) => {
  const sa = S.sa, pick = (o) => (ui.corr === 'binding' ? o : { ...o.scenarios[ui.corr], rrao: o.rrao, capital: o.scenarios[ui.corr].total + o.rrao });
  const rows = E.DESKS.map((d) => ({ d, c: pick(sa[d.id]) })), tot = pick(sa.total);
  const sumDesks = rows.reduce((a, x) => a + x.c.capital, 0), mx = Math.max(...rows.flatMap((x) => [x.c.delta, x.c.vega, x.c.curvature, x.c.rrao]), tot.vega);
  const bc = (v, color) => `<td><div class="bar-cell"><span>${num(v, 1)}</span><i style="width:${Math.max(v > 0.05 ? 2 : 0, (v / mx) * 100)}%;background:${color}"></i></div></td>`;
  const plaG = Object.values(S.pla).filter((p) => p.zone === 'green').length;
  const wi = whatIf(ui.whatif), base = whatIf(-1);
  const wrow = (l, a, b, unit, better) => { const dlt = b - a; const good = better === 'lower' ? Math.abs(b) < Math.abs(a) - 1e-9 : false; return `<tr><td>${l}</td><td class="num">${num(a, 1)}</td><td class="num">${num(b, 1)}</td><td class="num" style="color:${Math.abs(dlt) < 0.05 ? 'inherit' : good ? 'var(--ok)' : 'var(--breach)'}">${signed(dlt, 1)}</td><td class="muted">${unit}</td></tr>`; };
  return {
    html: `${head(r, 'Are the risk measures telling the truth, and what do they cost in capital?')}
    ${brief('Lead initiatives to enhance internal risk measures and FRTB capital metrics. Use quantitative, database and coding skills to streamline and automate oversight processes, reporting and ad hoc analysis.', 'I build my own measures and I test them against outcomes: every model I trade is scored on data it has not seen. Here that habit becomes three tests, plus a capital calculation and a pre-trade what-if, all in code that runs without me.')}
    <div class="kpis">
      ${kpi('Standardised capital, equity risk', `${num(sa.total.capital, 0)}<small>CAD m</small>`, `Binding case: ${sa.total.scenario} correlation. Sum of desks alone: ${cad(E.DESKS.reduce((a, d) => a + sa[d.id].capital, 0), 0)}`)}
      ${kpi('Expected shortfall, liquidity-adjusted', `${num(S.les.total, 1)}<small>CAD m</small>`, '97.5%, ten-day prices and twenty-day volatility')}
      ${kpi('Backtesting, all desks', `${S.bt.total.exceptions}<small>exceptions</small>`, `${ZONE[S.bt.total.zone][1]} zone over 250 days at 99%`)}
      ${kpi('P&amp;L attribution test', `${plaG}<small>of 4 green</small>`, 'Structured Notes is amber: its model misses part of its P&amp;L')}
    </div>
    <section class="blk">
      <div class="blk-h"><h2>What each desk costs under the standardised approach</h2>${seg('corr', [['binding', 'Binding case'], ['low', 'Low correlation'], ['medium', 'Medium'], ['high', 'High']])}
        <p>The sensitivities-based method for equity risk: delta, vega and curvature charges by desk, plus the add-on for exotic notes. CAD m.</p></div>
      <div class="tbl-wrap"><table><thead><tr><th>Desk</th><th>Delta</th><th>Vega</th><th>Curvature</th><th>Residual add-on</th><th class="num">Total</th></tr></thead><tbody>
        ${rows.map(({ d, c }) => `<tr><td class="nw"><span class="dot" style="background:${d.color};margin-right:8px"></span>${d.name}</td>${bc(c.delta, d.color)}${bc(c.vega, d.color)}${bc(c.curvature, d.color)}${bc(c.rrao, d.color)}<td class="num">${num(c.capital, 1)}</td></tr>`).join('')}
        <tr><td class="muted">Sum of the four desks</td><td></td><td></td><td></td><td></td><td class="num">${num(sumDesks, 1)}</td></tr>
        <tr class="total"><td>Business, netted</td>${bc(tot.delta, '#1d2024')}${bc(tot.vega, '#1d2024')}${bc(tot.curvature, '#1d2024')}${bc(tot.rrao, '#1d2024')}<td class="num">${num(tot.capital, 1)}</td></tr>
      </tbody></table></div>
      <p class="read"><b>How to read it.</b> Netting across desks saves ${cad(sumDesks - tot.capital, 0)}: the note book's long volatility offsets the flow desk's short. Vega is the largest charge, so the cheapest capital is saved by matching volatility by underlying across the two desks, which is also the offset the stress page depends on.</p>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Would each desk keep its internal model?</h2><p>Under FRTB a desk must pass two tests to use an internal model. Fail, and it moves to the standardised charge above.</p></div>
      <div class="tbl-wrap"><table><thead><tr><th>Desk</th><th class="num">Exceptions, 99%</th><th class="num">Rank correlation</th><th class="num">Distribution gap</th><th>Attribution test</th><th>Backtesting</th></tr></thead><tbody>
        ${E.DESKS.map((d) => { const p = S.pla[d.id], b = S.bt[d.id]; return `<tr><td class="nw"><span class="dot" style="background:${d.color};margin-right:8px"></span>${d.name}</td><td class="num">${b.exceptions}</td><td class="num">${num(p.spearman, 2)}</td><td class="num">${num(p.ks, 3)}</td><td>${st(ZONE[p.zone][0], ZONE[p.zone][1])}</td><td>${st(b.exceptions <= 12 ? 'ok' : 'breach', b.exceptions <= 12 ? 'Pass' : 'Fail')}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="read"><b>How to read it.</b> The attribution test compares the P&amp;L the risk model predicts with the desk's own. Green needs a rank correlation above 0.80 and a distribution gap below 0.09. Backtesting fails a desk above 12 exceptions a year. Structured Notes is amber because dividend and correlation moves are in its P&amp;L but not in its risk model: the fix is to add those factors, and the table above shows what the desk costs if it loses its model.</p>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Before the trade: what a hedge does to every measure</h2>${seg('whatif', WHATIFS.map((w, i) => [i, w.short]))}
        <p>${WHATIFS[ui.whatif].text}</p></div>
      <div class="tbl-wrap"><table><thead><tr><th>Measure</th><th class="num">Now</th><th class="num">After</th><th class="num">Change</th><th></th></tr></thead><tbody>
        ${wrow('Value-at-risk, all desks', base.var, wi.var, 'CAD m', 'lower')}
        ${wrow('Worst historical stress', base.stress, wi.stress, 'CAD m', 'lower')}
        ${wrow('Flow desk gamma', base.gamma, wi.gamma, 'CAD m of delta per 1%, limit 3.0', 'lower')}
        ${wrow('One-name gap scenario', base.gap, wi.gap, 'CAD m', 'lower')}
        ${wrow('Standardised capital', base.cap, wi.cap, 'CAD m', 'lower')}
      </tbody></table></div>
      <p class="read"><b>What it shows.</b> ${WHATIFS[ui.whatif].read}</p>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Automation: the same checks, written once</h2>${seg('code', [['sql', 'SQL'], ['py', 'Python']])}
        <p>Examples of how I would write the daily work so it runs unattended. In my own trading, an application I built replaced two to three hours a day of manual reconciliation.</p></div>
      <pre>${ui.code === 'sql' ? CODE_SQL : CODE_PY}</pre>
    </section>
    ${prevNext(r.path)}`,
  };
};

const WHATIFS = [
  { short: 'Buy back half the Nasdaq puts', text: 'The flow desk buys back half of its short Nasdaq-100 puts (CAD 120m notional).', read: 'This clears the gamma breach and cuts the 2008-style loss, but standardised capital rises: the business becomes longer volatility overall, and the vega charge grows. Risk falls while capital goes up, which is why both are shown before the trade.',
    spec: (book) => ({ scale: { [book.findIndex((p) => p.desk === 'flow' && p.u === 'NDX' && p.cp === 'put')]: 0.5 } }) },
  { short: 'Buy S&P 500 puts', text: 'The flow desk buys CAD 300m of six-month S&P 500 puts struck 15% below the market.', read: 'The strongest cut to stress loss and it turns the desk long gamma, at the highest capital cost of the three. Worth it if the stress limit is the binding constraint; expensive if capital is.',
    spec: () => ({ extra: [{ desk: 'flow', u: 'SPX', type: 'option', cp: 'put', k: 0.85, T: 0.5, n: 300, vol: E.impliedVol('SPX', 0.85, 0.5), tag: 'Hedge' }] }) },
  { short: 'Halve the short Nvidia calls', text: 'The flow desk buys back half of its short Nvidia calls (CAD 35m notional).', read: 'The only one of the three that lowers capital as well as risk, because single-stock technology carries a 50% risk weight. It does little for a broad fall: it is the answer to the crowded-name question, not to the stress limit.',
    spec: (book) => ({ scale: { [book.findIndex((p) => p.desk === 'flow' && p.u === 'NVDA' && p.cp === 'call')]: 0.5 } }) },
];
function whatIf(i) {
  if (S.whatif[i]) return S.whatif[i];
  const book = i < 0 ? S.book : E.buildBook(WHATIFS[i].spec(S.book)), vec = i < 0 ? S.vec : E.pnlVectors(book, S.hist);
  const hist = S.scenarios.filter((s) => s.kind === 'history').map((s) => E.scenarioPnl(book, s).total);
  S.whatif[i] = { var: E.varEs(vec.model.total).var, stress: Math.min(...hist), gamma: E.exposures(book).byDesk.flow.gamma / 100,
    gap: E.scenarioPnl(book, S.scenarios.find((s) => s.key === 'gapname')).total, cap: E.frtbSa(book).capital };
  return S.whatif[i];
}

const CODE_SQL = `<span class="c">-- Limit utilization for the morning brief, worst first</span>
<span class="k">SELECT</span> d.desk_name, l.measure, r.value, l.limit_value,
       <span class="k">ABS</span>(r.value) / l.limit_value                <span class="k">AS</span> utilization,
       <span class="k">CASE WHEN ABS</span>(r.value) &gt;  l.limit_value        <span class="k">THEN</span> 'breach'
            <span class="k">WHEN ABS</span>(r.value) &gt;= 0.8 * l.limit_value  <span class="k">THEN</span> 'watch'
            <span class="k">ELSE</span> 'ok' <span class="k">END</span>                            <span class="k">AS</span> status
<span class="k">FROM</span>   risk_results r
<span class="k">JOIN</span>   limits l  <span class="k">ON</span> l.desk_id = r.desk_id <span class="k">AND</span> l.measure = r.measure
                <span class="k">AND</span> r.cob_date <span class="k">BETWEEN</span> l.valid_from <span class="k">AND</span> l.valid_to  <span class="c">-- the limit approved on that day</span>
<span class="k">JOIN</span>   desks d   <span class="k">ON</span> d.desk_id = r.desk_id
<span class="k">WHERE</span>  r.cob_date = :cob_date
<span class="k">ORDER BY</span> utilization <span class="k">DESC</span>;`;
const CODE_PY = `<span class="k">import</span> numpy <span class="k">as</span> np, pandas <span class="k">as</span> pd

<span class="k">def</span> var_es(pnl: pd.Series, var_level=0.99, es_level=0.975):
    <span class="c">"""Historical value-at-risk and expected shortfall, as positive loss numbers."""</span>
    var = -np.quantile(pnl, 1 - var_level)
    tail = pnl.nsmallest(max(1, round(len(pnl) * (1 - es_level))))
    <span class="k">return</span> var, -tail.mean()

<span class="k">def</span> morning_checks(desk_pnl: pd.DataFrame, finance_pnl: pd.Series, var: pd.Series):
    <span class="c">"""One row per desk: exception flag and the gap to Finance's official P&amp;L."""</span>
    out = pd.DataFrame({"pnl": desk_pnl.iloc[-1], "var": var})
    out["exception"] = out.pnl &lt; -out["var"]
    out["gap_to_finance"] = out.pnl - finance_pnl
    out["needs_review"] = out.exception | (out.gap_to_finance.abs() &gt; 0.5)
    <span class="k">return</span> out.sort_values("gap_to_finance", key=abs, ascending=<span class="k">False</span>)`;

const EP_NOTES = {
  gfc: { year: '2008–09', where: 'I placed my first trades in February 2009, a month before the low of 9 March.', teaches: (e) => `Everything fell together. In the ten worst trading days the S&P 500 lost ${num(Math.abs(e.worst10.moves.US))}% and Canada ${num(Math.abs(e.worst10.moves.CA))}%, and the VIX stayed high for months, so hedges that relied on calm returning did not get it.`, control: 'Stress limits sized on ten-day moves with prices and volatility shocked together, and an explicit test of every offset between desks.' },
  euro: { year: '2011', where: 'Trading my own account while finishing my engineering degree in Brazil.', teaches: (e) => `A story everyone had read about for a year repriced in days: the VIX went from ${e.worst10.vixFrom} to ${e.worst10.vixTo} in ten sessions. Europe fell furthest, and an exposure that looked small was not.`, control: 'A watch list of slow-building risks with triggers agreed in advance, so the response is decided before the week it is needed.' },
  br17: { year: '2017', where: 'Moving into full-time trading, in Brazilian equities, when a political recording was leaked overnight.', teaches: (e) => `Brazil fell ${num(Math.abs(e.worstDay.moves.EM))}% in one session with the exchange halted, while the S&P 500 rose and the VIX fell. No global indicator warned, and no stop-loss worked through the gap.`, control: 'Gap scenarios and concentration limits by name and by market, held separately from value-at-risk, because VaR cannot see a gap coming.' },
  br18: { year: '2018', where: 'Trading Brazilian equities full time through a national truckers’ strike and an election.', teaches: (e) => `A ${num(Math.abs(e.peakToTrough.EM))}% fall over ${e.tradingDays} trading days while the US made new highs. Few single days were dramatic, so daily measures stayed calm the whole way down.`, control: 'Cumulative loss triggers by desk and by strategy: a month-to-date and quarter-to-date loss that forces a review even when every day was inside VaR.' },
  covid: { year: '2020', where: 'Running systematic models with risk limits set in advance. They stayed live through the fall, and the period was profitable for me.', teaches: (e) => `The fastest fall of its size on record: ${num(Math.abs(e.peakToTrough.US))}% in ${e.tradingDays} trading days, the VIX at ${e.vixPeak}, and a ${num(Math.abs(e.worstDay.moves.US))}% loss in one day. What mattered was having decided the rules while calm, and being able to get out of positions at all.`, control: 'Limits and de-risking rules agreed before the event, and days-to-exit measured on every financed position.' },
  rates: { year: '2022', where: 'Trading full time in US, Canadian and Brazilian markets.', teaches: (e) => `The Nasdaq-100 fell ${num(Math.abs(e.peakToTrough.TECH))}% over the year, yet the VIX never closed above ${e.vixPeak}. Protection that depends on volatility spiking did not pay, because the fall was slow.`, control: 'Scenarios where prices fall and volatility does not rise, and hedges judged by what they do in that case.' },
  ai26: { year: '2026', where: 'Trading it now. It has been a hard stretch for my models, and a useful one.', teaches: (e) => `A fall concentrated in one theme: the Nasdaq-100 is down ${num(Math.abs(e.peakToTrough.TECH))}% from its high and Europe ${num(Math.abs(e.peakToTrough.EU))}%. The index hides it; the damage is in a handful of crowded names held by everyone.`, control: 'One cross-desk view by name and theme, a gap scenario for the largest, and a scenario library that is updated while the episode is still running.' },
};

PAGES['/markets'] = (r) => {
  const e = S.market.episodes.find((x) => x.key === ui.ep), nt = EP_NOTES[e.key], f = S.market.facts;
  const drv = e.driver === 'EM' ? ['EM', 'Brazil'] : e.driver === 'TECH' ? ['TECH', 'Nasdaq-100'] : ['US', 'S&P 500'];
  return {
    html: `${head(r, 'What each market episode since 2009 taught me about risk')}
    ${brief('Maintain deep knowledge of capital markets products, valuation approaches, sensitivities, risk models, and regulatory developments affecting market risk and capital, with a focus on Global Equities and equity derivatives.', 'I have traded since February 2009, through the end of the financial crisis, the euro crisis, Brazil in 2017 and 2018, COVID, 2022 and this year’s AI unwind. Each one changed a rule I trade by. Below are the measured facts of each and the control it turns into.')}
    <section class="blk">
      <div class="blk-h"><h2>Seven episodes, measured</h2><p>S&amp;P 500, fall from its running high at each month-end. Choose an episode below, or click a shaded period.</p></div>
      <div class="chart" id="c-hist2"></div>
      <div class="ep-tabs">${S.market.episodes.map((x) => `<button data-seg="ep" data-v="${x.key}" aria-pressed="${x.key === e.key}"><span class="y">${EP_NOTES[x.key].year}</span>${x.name}</button>`).join('')}</div>
      <div class="ep">
        <div class="ep-figs">
          <div><div class="l">${drv[1]}, peak to trough</div><div class="v">${num(e.peakToTrough[drv[0]])}%</div><div class="s">${date(e.peak)} to ${date(e.trough)}</div></div>
          <div><div class="l">Trading days</div><div class="v">${e.tradingDays}</div><div class="s">from high to low</div></div>
          <div><div class="l">Worst single day</div><div class="v">${num(e.worstDay.moves[drv[0]])}%</div><div class="s">${date(e.worstDay.date)}</div></div>
          <div><div class="l">Worst ten trading days</div><div class="v">${num(e.worst10.moves[drv[0]])}%</div><div class="s">to ${date(e.worst10.to)}</div></div>
          <div><div class="l">Highest VIX close</div><div class="v">${e.vixPeak}</div><div class="s">${date(e.vixPeakDate)}, from ${e.vixStart} at the high</div></div>
          <div><div class="l">Canada · Europe, same period</div><div class="v">${num(e.peakToTrough.CA, 0)}% · ${num(e.peakToTrough.EU, 0)}%</div><div class="s">US-listed country funds</div></div>
        </div>
        <div><dl>
          <dt>Where I was</dt><dd>${nt.where}</dd>
          <dt>What it teaches</dt><dd>${nt.teaches(e)}</dd>
          <dt>The control it becomes</dt><dd>${nt.control}</dd>
        </dl><p style="margin-top:18px"><button class="btn" id="run-scn">Replay it on the book →</button></p></div>
      </div>
      <p class="read"><b>One number worth remembering.</b> Since February 2009 the S&amp;P 500 has had ${f.beyond3sd} days more than three standard deviations from normal. A bell curve predicts ${Math.round(f.expectedNormal)}. Any measure that assumes the bell curve is wrong by a factor of ${Math.round(f.beyond3sd / f.expectedNormal)} exactly when it matters. <a href="#/statistics">Explore the distributions</a>.</p>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>The products, in plain terms</h2><p>The four product families named in the posting, the risk that defines each, and where this tool looks at it.</p></div>
      <div class="tbl-wrap"><table><thead><tr><th>Product</th><th>What it is</th><th>The risk that defines it</th><th>What I watch</th></tr></thead><tbody>
        <tr><td><b>Structured notes</b></td><td>A note that pays a coupon and returns the principal unless a stock or index falls through a barrier. Widely sold to Canadian investors.</td><td>The bank ends up long volatility for years and exposed to dividends, with hedges that change sign near the barrier.</td><td>Vega by maturity, dividend assumptions, notes close to their barrier (Challenge)</td></tr>
        <tr><td><b>Equity exotics</b></td><td>Options whose payoff depends on the path or on several stocks at once: barriers, worst-of baskets, autocalls.</td><td>Correlation and gap risk that vanilla sensitivities do not capture; model choice matters.</td><td>Unexplained P&amp;L, the attribution test, the residual add-on (Measures &amp; capital)</td></tr>
        <tr><td><b>Equity options</b></td><td>Listed and over-the-counter calls and puts bought and sold for clients.</td><td>Short gamma: the desk must sell as prices fall and buy as they rise. Losses grow faster than the move.</td><td>Gamma and vega limits, the delta profile, the fall-and-volatility grid (Oversight, Stress)</td></tr>
        <tr><td><b>Equity financing</b></td><td>Lending against client stock positions, through total return swaps and stock loan.</td><td>Little market risk day to day; large loss if a client fails and the position cannot be sold quickly.</td><td>Concentration by name, days to exit at 20% of volume (Oversight, Challenge)</td></tr>
      </tbody></table></div>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>The capital rules this tool implements</h2><p>FRTB, the Fundamental Review of the Trading Book, is the Basel standard for market risk capital. In Canada it is OSFI's Capital Adequacy Requirements, Chapter 9.</p></div>
      <div class="tbl-wrap"><table><thead><tr><th>Rule</th><th>What it does</th><th>Where it is here</th></tr></thead><tbody>
        <tr><td><b>Standardised approach</b></td><td>Capital from sensitivities: delta, vega and curvature, with set risk weights and correlations, taken at the worst of three correlation cases.</td><td>Capital table by desk, equity risk class</td></tr>
        <tr><td><b>Residual risk add-on</b></td><td>A charge on the notional of instruments with gap, correlation or behavioural risk that sensitivities miss.</td><td>0.1% of note notional on the Structured desk</td></tr>
        <tr><td><b>Expected shortfall</b></td><td>Replaces value-at-risk for internal models: the average loss in the worst 2.5% of days, scaled for how long each risk takes to exit.</td><td>Liquidity-adjusted figure, Measures &amp; capital</td></tr>
        <tr><td><b>Desk-level tests</b></td><td>Each desk must pass backtesting and the P&amp;L attribution test to keep its internal model.</td><td>Eligibility table by desk</td></tr>
      </tbody></table></div>
      <p class="read">These are simplified teaching versions written from the published Basel text, for one risk class. At the bank I would start by learning its own models, its limit framework and its submissions to OSFI, and I would not assume this page matches them.</p>
    </section>
    ${prevNext(r.path)}`,
    after: () => {
      historyChart('c-hist2', e.key, 260, (k) => { ui.ep = k; render(true); });
      document.getElementById('run-scn').onclick = () => { ui.scn = e.key; location.hash = '#/stress'; };
    },
  };
};

PAGES['/about'] = () => ({
  html: `<header class="ph" style="grid-template-columns:1fr"><div><p class="goal">About</p><h1>Who built this, how, and what is real</h1></div></header>
  <section class="blk two">
    <div><div class="blk-h"><h2>Tiago Costa</h2></div>
      <p>I have traded since February 2009, and full time on my own capital since 2017. I run more than twenty systematic strategies in Canadian, US and Brazilian equities and ETFs, sending over two thousand orders a month through execution software I built, with pre-trade limits, a duplicate-order guard, an exposure cap and a daily reconciliation of every fill.</p>
      <p>Before that I was at EDP in Brazil, where I traded and risk-managed a $2B portfolio of power contracts and reported positions and risk to senior management, then led the launch of EDP Solar. I am an electrical engineer and a Level I Candidate in the CFA Program.</p>
      <p>What I would bring to second-line oversight is the first-line view: I know how a book behaves in a fall because I have owned one in every fall since 2009, and I can build the tools the oversight needs.</p>
      <p><a class="btn" href="https://www.linkedin.com/in/tiagonbc" target="_blank" rel="noopener">LinkedIn profile</a></p></div>
    <div><div class="blk-h"><h2>What is real and what is mock</h2></div>
      <div class="tbl-wrap"><table><tbody>
        <tr><td><b>Real</b></td><td>The seven market episodes: every fall, date and VIX level is measured from daily data to ${date(S.market.asOf)}. The market move in the morning brief is the real one of ${date(S.last.date)}.</td></tr>
        <tr><td><b>Mock</b></td><td>The business, its four desks, all ${S.book.length} positions, the limits and the client financing book. None of it describes CIBC or any real firm.</td></tr>
        <tr><td><b>Simulated</b></td><td>The 750-day history behind value-at-risk and backtesting, generated with volatility clustering and jumps from a fixed seed.</td></tr>
        <tr><td><b>Planted</b></td><td>One limit breach, one unexplained P&amp;L item, one stale volatility mark and one model gap, so the pages show what a problem looks like.</td></tr>
      </tbody></table></div></div>
  </section>
  <section class="blk two">
    <div><div class="blk-h"><h2>How it is built</h2></div>
      <ol class="steps">
        <li><span><b>A risk engine in plain JavaScript</b>, with no libraries: option pricing, full revaluation, value-at-risk, expected shortfall, backtesting, the attribution test and the standardised capital charge.</span></li>
        <li><span><b>A Python script</b> that measures the market episodes, return distributions, betas and rolling risk from daily data. It publishes statistics, plus weekly index levels rebased to 100 for the History page; no daily prices.</span></li>
        <li><span><b>Automated tests</b> that run on every change: pricing identities, the capital aggregation, the limit logic and the planted problems.</span></li>
        <li><span><b>Charts drawn directly in SVG</b>, so the page loads in one request and works on a phone.</span></li>
      </ol>
      <p class="read">I designed and built it for this role, working with an AI coding agent under tests. If you would like a different product, measure or view, I can add it.</p></div>
    <div><div class="blk-h"><h2>Simplifications to know about</h2></div>
      <ol class="steps">
        <li><span>The note book is shown as its vanilla option profile. Barriers, autocall dates and worst-of baskets are not priced; they are listed as risks to size separately.</span></li>
        <li><span>Options keep their own implied volatility when prices move. Long-dated options feel a share of each volatility move, falling with the square root of maturity.</span></li>
        <li><span>The capital charge covers the equity risk class only, nets maturities within each underlying, and leaves out the default risk charge.</span></li>
        <li><span>Where no local volatility index was in my data, Brazilian implied volatility is assumed to rise 0.6 points for each 1% fall.</span></li>
        <li><span>Everything is in Canadian dollars with currencies held constant.</span></li>
      </ol></div>
  </section>
  <section class="blk">
    <div class="blk-h"><h2>Glossary</h2></div>
    <div class="tbl-wrap"><table><tbody>
      ${[['Delta', 'How much a position gains or loses when the market moves 1%.'], ['Gamma', 'How much delta itself changes when the market moves. A short-gamma desk gets longer as prices fall and has to sell into the fall.'], ['Vega', 'Gain or loss when implied volatility, the market’s price for uncertainty, rises one point.'], ['Value-at-risk (VaR)', 'The loss that should be exceeded on only one day in a hundred.'], ['Expected shortfall', 'The average loss on the worst days, beyond value-at-risk.'], ['Backtesting exception', 'A day when the loss was larger than value-at-risk said it should be.'], ['P&L explain', 'Splitting a day’s profit or loss into the part each sensitivity predicts, to find the part none of them does.'], ['Stress scenario', 'A large, specific market move applied to today’s positions.'], ['Reverse stress', 'Working backwards: how large a move would it take to lose a given amount?'], ['FRTB', 'The Basel rules for how much capital a bank holds against its trading positions.'], ['Second line', 'Independent risk oversight, separate from the traders (first line) and from audit (third line).'], ['Autocallable note', 'A structured note that repays early if the underlying is above a set level on an observation date.']].map(([a, b]) => `<tr><td style="width:210px"><b>${a}</b></td><td>${b}</td></tr>`).join('')}
    </tbody></table></div>
  </section>
  ${prevNext('/about')}`,
});

// ---------- history ----------

const H_WIN = { 21: ['vol21', '1 month'], 63: ['vol63', '3 months'], 250: ['vol250', '1 year'] };
const H_RANGE = { all: 0, '10y': 522, '5y': 261, '1y': 53 };
const pctRank = (arr, v) => { const a = arr.filter((x) => x != null); return Math.round((a.filter((x) => x <= v).length / a.length) * 100); };

function histWindow(h) {
  const n = h.weeks.length;
  if (ui.hRange === 'event' && ui.hEvent != null) { const w = h.events[ui.hEvent].week; return [Math.max(0, w - 30), Math.min(n - 1, w + 48)]; }
  const k = H_RANGE[ui.hRange] || 0;
  return [k ? Math.max(0, n - k) : 0, n - 1];
}
function histTicks(weeks, a, b) {
  const nn = b - a + 1, years = nn / 52, out = [];
  for (let i = a + 1; i <= b; i++) {
    const [y, m] = weeks[i].split('-'), [py, pm] = weeks[i - 1].split('-');
    if (years > 2.5) { const step = years > 13 ? 3 : years > 6 ? 2 : 1; if (y !== py && +y % step === 0) out.push({ i: i - a, label: y }); }
    else if (m !== pm && (+m - 1) % 3 === 0) out.push({ i: i - a, label: `${MONTHS[+m - 1]} ${y}` });
  }
  return out;
}
function eventEffect(h, mk, ev) {
  // What the event did to the rolling measures of the selected market, read from the weekly series
  const w = ev.week, n = h.weeks.length, at = (arr, i) => arr[Math.max(0, Math.min(n - 1, i))];
  const span = (arr, from, to) => arr.slice(Math.max(0, from), Math.min(n, to + 1)).filter((x) => x != null);
  const vols = span(mk.vol21, w, w + 10), peak = Math.max(...vols), toPeak = vols.indexOf(peak);
  return { volBefore: at(mk.vol21, w - 1), volPeak: peak, toPeak, fastBefore: at(mk.varFast, w - 1), fastPeak: Math.max(...span(mk.varFast, w, w + 6)),
    slowBefore: at(mk.varSlow, w - 1), slowLater: Math.max(...span(mk.varSlow, w, w + 26)), ddLow: Math.min(...span(mk.dd, w, w + 26)) };
}

PAGES['/history'] = () => {
  if (!S.h) {
    fetch('data/history.json').then((r) => r.json()).then((h) => { S.h = h; if (location.hash === '#/history') render(true); })
      .catch(() => { document.getElementById('main').innerHTML = '<p class="loading">Could not load the price history.</p>'; });
    return { html: '<p class="loading">Loading the price history…</p>' };
  }
  const h = S.h, n = h.weeks.length, last = n - 1;
  if (ui.hMarket === 'US' && ui.hMeasure === 'beta') ui.hMeasure = 'var';
  const mk = h.markets[ui.hMarket], [a, b] = histWindow(h), nn = b - a + 1, sl = (arr) => arr.slice(a, b + 1);
  const [volKey, volName] = H_WIN[ui.hWin], volNow = mk[volKey][last], ddMin = Math.min(...mk.dd), ddAt = h.weeks[mk.dd.indexOf(ddMin)];
  const ev = ui.hEvent != null ? h.events[ui.hEvent] : null, fx = ev ? eventEffect(h, mk, ev) : null;
  const ranges = [['all', 'Since 2007'], ['10y', '10 years'], ['5y', '5 years'], ['1y', '1 year'], ...(ev ? [['event', 'Around the event']] : [])];
  const measures = [['var', 'Value-at-risk'], ['dd', 'Drawdown'], ...(ui.hMarket === 'US' ? [] : [['beta', 'Beta to S&P 500']])];
  const riskLegend = ui.hMeasure === 'var' ? legend([['#007095', 'Fast: from recent volatility'], ['#1d2024', 'Slow: worst 1% of the last 250 days']])
    : ui.hMeasure === 'dd' ? legend([['#8b1d41', 'Fall from the running high since 2007']]) : legend([['#6B5CA5', 'Beta to the S&P 500, last 250 trading days']]);
  return {
    html: `<header class="ph" style="grid-template-columns:1fr"><div><p class="goal">History</p><h1>Price history, volatility and the events behind them</h1>
      <p class="lede">Twenty years of weekly prices for five markets, with the rolling risk measures a desk is managed on. Every spike in volatility has a date and a cause: the numbered flags mark them, and each one can be opened.</p></div></header>
    <div class="ctlbar">
      <label>Market <select id="h-market">${Object.entries(h.markets).map(([k, m]) => `<option value="${k}" ${k === ui.hMarket ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>
      ${seg('hRange', ranges)}
      <label class="tog"><input type="checkbox" id="h-log" ${ui.hLog ? 'checked' : ''}> Log scale</label>
      <label class="tog"><input type="checkbox" id="h-events" ${ui.hEvents ? 'checked' : ''}> Events</label>
    </div>
    <div class="kpis">
      ${kpi(`Volatility now, ${volName}`, `${num(volNow, 1)}<small>%</small>`, `Annualised, from daily moves. Higher than in ${pctRank(mk[volKey], volNow)}% of weeks since 2007`)}
      ${kpi('Value-at-risk now, 1 day 99%', `${num(mk.varFast[last], 1)}<small>%</small>`, `From recent volatility. The slow 250-day measure still says ${num(mk.varSlow[last], 1)}%`)}
      ${kpi('Below its high', `${num(mk.dd[last], 1)}<small>%</small>`, `Deepest since 2007: ${num(ddMin, 0)}% in the week to ${date(ddAt)}`)}
      ${kpi('VIX', `${num(h.vix[last], 1)}`, `US implied volatility at ${date(h.asOf)}. Higher than in ${pctRank(h.vix, h.vix[last])}% of weeks since 2007`)}
    </div>
    <section class="blk">
      <div class="blk-h"><h2>${mk.name}: price, volatility and risk on one time axis</h2>
        <p>Weekly, ${date(h.weeks[a])} to ${date(h.weeks[b])}. The level is rebased to 100 in January 2007. Move the pointer over any chart to read all three at that week; click a flag to zoom in on the event.</p></div>
      <h3>Price</h3>
      <div class="chart" id="c-h-px"></div>
      <div class="blk-h sub"><h3>Volatility</h3>${seg('hWin', [[21, '1 month'], [63, '3 months'], [250, '1 year']])}</div>
      ${legend([['#8b1d41', `Realised volatility, ${volName} window`], ['#7b808a', 'VIX: volatility implied by S&P 500 options']])}
      <div class="chart" id="c-h-vol"></div>
      <div class="blk-h sub"><h3>Rolling risk</h3>${seg('hMeasure', measures)}</div>
      ${riskLegend}
      <div class="chart" id="c-h-risk"></div>
      <p class="read"><b>How to read it.</b> Realised volatility is what prices did; the VIX is what options charged for the next month. The two value-at-risk lines are the lesson for a risk manager: the fast one jumps in the week of an event and falls back within months, while the slow one barely moves at first and then stays high for a year after the danger has passed. A limit framework needs both, and needs to know which one it is looking at.</p>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>The events behind the spikes</h2><p>${h.events.length} dated events. The moves are measured from the data for the market selected above. Click a row to zoom the charts to that event.</p></div>
      ${ev ? `<div class="note" style="margin-bottom:18px"><div class="hd">EVENT ${ui.hEvent + 1} · ${date(ev.date)} · ${ev.where}</div>
        <p><b>${ev.title}.</b> ${ev.text}</p>
        <p><b>What it did to the measures (${mk.name}).</b> The market moved ${signed(ev.moves[ui.hMarket], 1)}% that day and the VIX closed at ${ev.vix.toFixed(1)} from ${ev.vixPrev.toFixed(1)}. One-month volatility went from ${num(fx.volBefore, 0)}% to a peak of ${num(fx.volPeak, 0)}%${fx.toPeak > 0 ? `, ${fx.toPeak} week${fx.toPeak > 1 ? 's' : ''} later` : ' that week'}. The fast value-at-risk measure moved from ${num(fx.fastBefore, 1)}% to ${num(fx.fastPeak, 1)}% within six weeks; the slow one moved from ${num(fx.slowBefore, 1)}% to ${num(fx.slowLater, 1)}% over the following six months. At its lowest in those six months the market stood ${num(Math.abs(fx.ddLow), 0)}% below its high since 2007.</p></div>` : ''}
      <div class="tbl-wrap"><table class="events"><thead><tr><th></th><th>Date</th><th>Event</th><th class="num">${mk.name.split(' (')[0]}, that day</th><th class="num">VIX close</th></tr></thead><tbody>
        ${h.events.map((e, i) => `<tr class="ev-row ${i === ui.hEvent ? 'on' : ''}" data-ev="${i}" tabindex="0"><td><span class="evn">${i + 1}</span></td><td class="nw">${date(e.date)}</td><td><b>${e.title}</b> <span class="tag">${e.where}</span><div class="muted">${e.text}</div></td><td class="num" style="color:${e.moves[ui.hMarket] < 0 ? 'var(--neg)' : 'var(--pos)'}">${signed(e.moves[ui.hMarket], 1)}%</td><td class="num">${e.vixPrev.toFixed(1)} → ${e.vix.toFixed(1)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="read">Dates and descriptions are from the public record; every number is measured from daily data. The 2026 entry is described from the data alone.</p>
    </section>
    ${prevNext('/history')}`,
    after: () => {
      const marks = ui.hEvents ? h.events.map((e, i) => ({ i: e.week - a, label: String(i + 1), on: i === ui.hEvent })).filter((q) => q.i >= 0 && q.i < nn) : [];
      const xTicks = histTicks(h.weeks, a, b);
      const tip = (i) => {
        const w = a + i, hit = h.events.filter((e) => e.week === w);
        return `<b>Week to ${date(h.weeks[w])}</b><div class="r"><span>Level (2007 = 100)</span><span>${num(mk.px[w], 1)}</span></div><div class="r"><span>Volatility, ${volName}</span><span>${num(mk[volKey][w], 1)}%</span></div><div class="r"><span>VIX</span><span>${num(h.vix[w], 1)}</span></div><div class="r"><span>VaR fast / slow</span><span>${num(mk.varFast[w], 1)}% / ${num(mk.varSlow[w], 1)}%</span></div><div class="r"><span>Below the high</span><span>${num(mk.dd[w], 1)}%</span></div><div class="r"><span>Worst day that week</span><span>${signed(mk.worst[w], 1)}%</span></div>${hit.map((e) => `<div>${e.title}</div>`).join('')}`;
      };
      const pick = (i) => {
        const w = a + i, tol = Math.max(1, nn / 50); let best = -1, bd = 1e9;
        h.events.forEach((e, k) => { const d = Math.abs(e.week - w); if (d < bd) { bd = d; best = k; } });
        if (best >= 0 && bd <= tol) { ui.hEvent = best; ui.hRange = 'event'; render(true); }
      };
      const base = { n: nn, xTicks, tip, sync: 'hist', onClick: pick };
      lineChart(document.getElementById('c-h-px'), { ...base, height: 300, label: `${mk.name} level`, log: ui.hLog, includeZero: false, marks, yFmt: (v) => num(v, 0),
        series: [{ name: mk.name, color: '#8b1d41', values: sl(mk.px), width: 1.8 }] });
      lineChart(document.getElementById('c-h-vol'), { ...base, height: 210, label: 'Volatility', marks, marksPlain: true, yFmt: (v) => num(v, 0) + '%',
        series: [{ name: 'VIX', color: '#7b808a', values: sl(h.vix), width: 1.3 }, { name: 'Realised', color: '#8b1d41', values: sl(mk[volKey]), width: 1.8 }] });
      const risk = ui.hMeasure === 'var'
        ? { yFmt: (v) => num(v, 0) + '%', series: [{ name: 'Slow', color: '#1d2024', values: sl(mk.varSlow), width: 1.5, dash: '5 4' }, { name: 'Fast', color: '#007095', values: sl(mk.varFast), width: 1.8 }] }
        : ui.hMeasure === 'dd' ? { yFmt: (v) => num(v, 0) + '%', yMax: 2, series: [{ name: 'Drawdown', color: '#8b1d41', values: sl(mk.dd), width: 1.6, area: true }] }
          : { yFmt: (v) => num(v, 1), includeZero: false, series: [{ name: 'Beta', color: '#6B5CA5', values: sl(mk.beta), width: 1.8 }] };
      lineChart(document.getElementById('c-h-risk'), { ...base, height: 210, label: 'Rolling risk', marks, marksPlain: true, ...risk });
      document.getElementById('h-market').addEventListener('change', (e) => { ui.hMarket = e.target.value; render(true); });
      document.getElementById('h-log').addEventListener('change', (e) => { ui.hLog = e.target.checked; render(true); });
      document.getElementById('h-events').addEventListener('change', (e) => { ui.hEvents = e.target.checked; render(true); });
      document.querySelectorAll('.ev-row').forEach((r) => r.addEventListener('keydown', (e) => { if (e.key === 'Enter') r.click(); }));
    },
  };
};

// ---------- statistics ----------

const STAT_DESKS = [['total', 'All desks'], ['cash', 'Cash & ETF'], ['flow', 'Flow Derivatives'], ['struct', 'Structured Notes'], ['fin', 'Equity Financing']];
const FACTORS = [['SPX', 'S&P 500'], ['NDX', 'Nasdaq-100'], ['TX60', 'S&P/TSX 60']];
const MKT_COLORS = { TECH: '#007095', CA: '#B7791F', EU: '#A3294F', EM: '#6B5CA5' };

function statSeries(key) {
  S.stat ||= {};
  if (S.stat[key]) return S.stat[key];
  const d = S.market.dist[key];
  let o;
  if (d) {
    const c = d.hist.counts, first = c.findIndex((v) => v > 0), last = c.length - 1 - [...c].reverse().findIndex((v) => v > 0);
    const a = Math.max(0, first - 2), b = Math.min(c.length - 1, last + 2), ix = (L) => Math.max(0, Math.min(99, Math.round((1 - L) * 1000) - 1));
    o = { real: true, label: d.name, pct: true, m: d, hist: { lo: d.hist.lo + a * d.hist.step, step: d.hist.step, counts: c.slice(a, b + 1) }, varAt: (L) => d.var[ix(L)], esAt: (L) => d.es[ix(L)] };
  } else {
    const v = S.vec.model[key], sorted = [...v].sort((p, q) => p - q), m = E.moments(v), span = m.max - m.min;
    const step = [0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1].find((s) => span / s <= 48) || 2, lo = Math.floor(m.min / step) * step, nb = Math.floor((m.max - lo) / step) + 1;
    o = { real: false, label: STAT_DESKS.find((s) => s[0] === key)[1], pct: false, m, hist: { lo, step, counts: E.histogram(v, lo, step, nb) }, varAt: (L) => -E.quantile(sorted, 1 - L), esAt: (L) => E.varEs(v, L, L).es };
  }
  return (S.stat[key] = o);
}

function drawStats() {
  const s = statSeries(ui.stSeries), L = ui.level / 100, m = s.m, f = (x, d = 2) => num(x, d) + (s.pct ? '%' : ''), unit = s.pct ? 'daily return' : 'CAD m, daily P&amp;L';
  const v = s.varAt(L), es = s.esAt(L), vn = E.normalVar(m.mean, m.sd, L), every = 1 / (1 - L);
  document.querySelectorAll('.st-level').forEach((e) => { e.textContent = `${ui.level.toFixed(1)}%`; });
  document.getElementById('st-tiles').innerHTML =
    kpi(`Value-at-risk at ${ui.level.toFixed(1)}%${s.pct ? '' : ', CAD m'}`, `${f(v)}${s.pct ? '' : '<small>m</small>'}`, `Measured from ${m.n.toLocaleString('en-CA')} days: a worse day comes about once in ${every >= 100 ? Math.round(every).toLocaleString('en-CA') : num(every, 0)}`)
    + kpi('If it were a bell curve', `${f(vn)}${s.pct ? '' : '<small>m</small>'}`, 'Same average and standard deviation, normal distribution')
    + kpi('Expected shortfall', `${f(es)}${s.pct ? '' : '<small>m</small>'}`, 'Average loss on the days beyond value-at-risk')
    + kpi('Measured against bell curve', `${num(v / vn, 2)}<small>×</small>`, v / vn > 1.05 ? 'The real tail is fatter than the bell curve says' : v / vn < 0.95 ? 'At this level the bell curve overstates the loss' : 'About the same at this level');
  const h = s.hist, nb = h.counts.length;
  const normal = ui.stNormal ? h.counts.map((_, i) => m.n * (E.normCdf((h.lo + (i + 1) * h.step - m.mean) / m.sd) - E.normCdf((h.lo + i * h.step - m.mean) / m.sd))) : null;
  histChart(document.getElementById('c-hist'), {
    lo: h.lo, step: h.step, counts: h.counts, normal, log: ui.stLog, var: v, es, varLabel: `VaR ${f(v)}`, esLabel: `ES ${f(es)}`, height: 330, label: `Distribution of ${s.label}`,
    xFmt: (x) => num(x, h.step < 0.1 ? 1 : 0) + (s.pct ? '%' : ''),
    tip: (i) => `<b>${f(h.lo + i * h.step, h.step < 0.1 ? 2 : 2)} to ${f(h.lo + (i + 1) * h.step)}</b><div class="r"><span>Days observed</span><span>${h.counts[i]}</span></div>${normal ? `<div class="r"><span>Bell curve expects</span><span>${num(normal[i], normal[i] < 10 ? 2 : 0)}</span></div>` : ''}`,
  });
  const skewRead = m.skew < -0.15 ? 'Negative: the large losses are bigger than the large gains' : m.skew > 0.15 ? 'Positive: the large gains are bigger than the large losses' : 'Close to symmetric';
  const kurtRead = m.kurt > 1 ? 'Fat tails: extreme days come far more often than a bell curve allows' : m.kurt > 0.3 ? 'Somewhat fatter tails than a bell curve' : 'Close to a bell curve';
  const exp3 = m.n * 0.0027;
  const rows = [
    ['Days observed', m.n.toLocaleString('en-CA'), s.real ? 'Real daily returns since February 2009' : 'Simulated history, full revaluation of the mock book'],
    ['Average', f(m.mean, 3), 'The typical day is close to zero; risk is in the spread, not the average'],
    ['Median', f(m.median, 3), m.median > m.mean ? 'Above the average: a few large losses pull the average down' : 'Close to the average'],
    ['Standard deviation', f(m.sd, 2), 'The usual size of a daily move'],
    ['Skewness', num(m.skew, 2), skewRead],
    ['Excess kurtosis', num(m.kurt, 2), kurtRead],
    ['Worst day', f(m.min), s.real ? date(m.minDate) : 'In the simulated history'],
    ['Best day', (m.max > 0 ? '+' : '') + f(m.max), s.real ? date(m.maxDate) : 'In the simulated history'],
    ['Days beyond 3 standard deviations', String(m.beyond3), `A bell curve expects ${num(exp3, 1)}: ${num(m.beyond3 / exp3, 1)} times as many happened`],
  ];
  document.getElementById('st-table').innerHTML = rows.map((r) => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="muted">${r[2]}</td></tr>`).join('');
  document.getElementById('st-unit').innerHTML = `${s.label}, ${unit}`;
  // value-at-risk across confidence levels: measured against the bell curve
  const lv = Array.from({ length: 100 }, (_, i) => 90 + i * 0.1), hv = lv.map((l) => s.varAt(l / 100)), nv = lv.map((l) => E.normalVar(m.mean, m.sd, l / 100));
  const cur = Math.max(0, Math.min(99, Math.round((ui.level - 90) * 10)));
  lineChart(document.getElementById('c-curve'), {
    n: 100, height: 270, label: 'Value-at-risk by confidence level', yFmt: (x) => num(x, s.pct ? 0 : 1) + (s.pct ? '%' : ''),
    series: [{ name: 'Bell curve', color: '#1d2024', values: nv, width: 1.6, dash: '5 4' }, { name: 'Measured', color: '#8b1d41', values: hv, width: 2.2 }],
    points: [{ i: cur, value: hv[cur], color: '#8b1d41' }],
    xTicks: [[0, '90%'], [50, '95%'], [75, '97.5%'], [90, '99%']].map(([i, label]) => ({ i, label, anchor: i === 0 ? 'start' : i === 99 ? 'end' : 'middle' })),
    tip: (i) => `<b>${lv[i].toFixed(1)}% confidence</b><div class="r"><span>Measured</span><span>${f(hv[i])}</span></div><div class="r"><span>Bell curve</span><span>${f(nv[i])}</span></div><div class="r"><span>Ratio</span><span>${num(hv[i] / nv[i], 2)}×</span></div>`,
    onClick: (i) => { ui.level = +lv[i].toFixed(1); document.getElementById('st-lvl').value = ui.level; drawStats(); },
  });
  // who contributes to the business's worst days
  const parts = Object.fromEntries(E.DESKS.map((d) => [d.id, S.vec.model[d.id]])), tc = E.tailContribution(parts, S.vec.model.total, L);
  const esT = E.varEs(S.vec.model.total, L, L).es, alone = Object.fromEntries(E.DESKS.map((d) => [d.id, E.varEs(S.vec.model[d.id], L, L).es]));
  const mx = Math.max(...E.DESKS.flatMap((d) => [alone[d.id], Math.abs(tc[d.id])]));
  const bar = (x, color) => `<td><div class="bar-cell"><span>${signed(x, 2)}</span><i style="width:${(Math.abs(x) / mx) * 100}%;background:${x < 0 ? '#2f6f9f' : color}"></i></div></td>`;
  document.getElementById('st-contrib').innerHTML = E.DESKS.map((d) => `<tr><td class="nw"><span class="dot" style="background:${d.color};margin-right:8px"></span>${d.name}</td>${bar(alone[d.id], d.color)}${bar(tc[d.id], d.color)}<td class="num">${num((tc[d.id] / esT) * 100, 0)}%</td></tr>`).join('')
    + `<tr class="total"><td>All desks</td><td class="num">${num(E.sum(Object.values(alone)), 2)}</td><td class="num">${num(esT, 2)}</td><td class="num">100%</td></tr>`;
  const off = E.DESKS.filter((d) => tc[d.id] < 0).map((d) => d.name);
  document.getElementById('st-contrib-read').innerHTML = `<b>How to read it.</b> On its own, each desk's expected shortfall at ${ui.level.toFixed(1)}% adds up to ${cad(E.sum(Object.values(alone)), 1)}. Together the business loses ${cad(esT, 1)} on its worst days, because the desks do not have their worst days together. ${off.length ? `${off.join(' and ')} ${off.length > 1 ? 'make' : 'makes'} money on those days (shown in blue), which is the offset the Stress page questions.` : ''}`;
  S.byU ||= E.pnlByUnderlying(S.book, S.hist);
  const tu = Object.entries(E.tailContribution(S.byU, S.vec.model.total, L)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
  hbars(document.getElementById('c-contrib-u'), { rows: tu.map(([u, x]) => ({ label: E.UNDERLYINGS[u].name, value: x, color: x < 0 ? '#2f6f9f' : '#c2513a' })), labelWidth: 122, dec: 2, label: 'Tail contribution by underlying' });
}

function drawBeta() {
  const x = S.hist.map((d) => d.ret[ui.betaFactor] * 100), y = S.vec.model[ui.betaDesk];
  const pick = (cond) => { const xi = [], yi = []; x.forEach((v, i) => { if (cond(v)) { xi.push(v); yi.push(y[i]); } }); return E.ols(xi, yi); };
  const all = E.ols(x, y), dn = pick((v) => v < 0), up = pick((v) => v >= 0), fac = FACTORS.find((q) => q[0] === ui.betaFactor)[1], name = STAT_DESKS.find((q) => q[0] === ui.betaDesk)[1];
  document.getElementById('beta-tiles').innerHTML =
    kpi('Beta, all days', `${signed(all.slope, 2)}<small>m</small>`, `CAD m of P&amp;L for each 1% move in the ${fac}`)
    + kpi('Beta on down days', `${signed(dn.slope, 2)}<small>m</small>`, `Per 1%, on the ${dn.n} days the ${fac} fell`)
    + kpi('Beta on up days', `${signed(up.slope, 2)}<small>m</small>`, `Per 1%, on the ${up.n} days it rose`)
    + kpi('Explained by this factor', `${num(all.r2 * 100, 0)}<small>%</small>`, 'R-squared: the share of the P&amp;L swings this one index accounts for');
  scatterChart(document.getElementById('c-beta'), {
    points: x.map((v, i) => ({ x: v, y: y[i], i })), color: ui.betaDesk === 'total' ? '#5a616b' : DESK[ui.betaDesk].color, height: 350, yDec: 0, label: `${name} P&L against the ${fac}`,
    xLabel: `${fac}, daily move`, yLabel: 'P&L, CAD m',
    lines: [{ ...all, color: '#1d2024', width: 1.4, dash: '5 4' }, { ...dn, to: 0, color: '#c2513a', width: 2.4 }, { ...up, from: 0, color: '#2f6f9f', width: 2.4 }],
    tip: (p) => `<b>Day ${p.i + 1} of ${x.length}</b><div class="r"><span>${fac}</span><span>${signed(p.x, 2)}%</span></div><div class="r"><span>${name} P&amp;L</span><span>${signed(p.y, 2)}</span></div>`,
  });
  const gap = dn.slope - up.slope, scale = Math.max(Math.abs(dn.slope), Math.abs(up.slope), 0.05);
  document.getElementById('beta-read').innerHTML = `<b>How to read it.</b> Each dot is one day. The slope of a line is the beta: how much the desk makes or loses for each 1% the index moves. `
    + (gap / scale > 0.25 ? `Here the red line is steeper than the blue one: ${name} loses ${cad(Math.abs(dn.slope), 2)} per 1% on the way down and ${up.slope > 0 ? `makes only ${cad(up.slope, 2)}` : `still loses ${cad(Math.abs(up.slope), 2)}`} per 1% on the way up. That bend is short gamma, visible in the outcomes without any model.`
      : gap / scale < -0.25 ? `Here the blue line is steeper than the red one: ${name} gains more on the way up than it loses on the way down. That bend is long gamma or long volatility showing through.`
        : `Here the two lines have nearly the same slope: ${name} behaves like a plain stock position, and one beta describes it well.`);
}

PAGES['/statistics'] = () => {
  const B = S.market.beta, keys = Object.keys(B), months = B.TECH.months, kind = ui.rollKind === 'beta' ? 'rollBeta' : 'rollCorr';
  const idsAll = S.vec.model.total.map((_, i) => i), ids = ui.corrMode === 'tail' ? E.tailDays(S.vec.model.total, 0.9) : idsAll;
  const cm = E.DESKS.map((a) => E.DESKS.map((b) => (a.id === b.id ? 1 : E.correlation(ids.map((i) => S.vec.model[a.id][i]), ids.map((i) => S.vec.model[b.id][i])))));
  const cc = (v) => { const k = divColor(v, 1); return `<td class="c" style="background:${k.bg};color:${k.fg}">${signed(v, 2)}</td>`; };
  const opt = (list) => list.map(([k, l]) => `<option value="${k}" ${ui.stSeries === k ? 'selected' : ''}>${l}</option>`).join('');
  return {
    html: `<header class="ph" style="grid-template-columns:1fr"><div><p class="goal">Statistics</p><h1>The distributions, tails and betas behind every number</h1>
      <p class="lede">Every figure in this tool is a summary of a distribution. Here you can open it up: choose a series, move the confidence level, and compare what really happened with what a bell curve would predict.</p></div></header>
    <div class="ctlbar">
      <label>Series <select id="st-series"><optgroup label="Mock desks, daily P&amp;L">${opt(STAT_DESKS)}</optgroup><optgroup label="Real markets, daily returns since 2009">${opt(Object.entries(S.market.dist).map(([k, d]) => [k, d.name]))}</optgroup></select></label>
      <label class="rng">Confidence <input type="range" id="st-lvl" min="90" max="99.9" step="0.1" value="${ui.level}" aria-label="Confidence level"> <b class="st-level mono"></b></label>
      <label class="tog"><input type="checkbox" id="st-normal" ${ui.stNormal ? 'checked' : ''}> Bell curve</label>
      <label class="tog"><input type="checkbox" id="st-log" ${ui.stLog ? 'checked' : ''}> Log scale</label>
    </div>
    <div class="kpis" id="st-tiles"></div>
    <section class="blk">
      <div class="blk-h"><h2>The distribution and its tail</h2><span class="muted" id="st-unit" style="font-size:13.5px"></span>
        <p>How often each daily result happened. The solid line is value-at-risk at the chosen confidence, the dashed line is expected shortfall, and the days beyond value-at-risk are in orange.</p></div>
      ${legend([['#9aa0a8', 'Days observed', true], ['#c2513a', 'Days beyond value-at-risk', true], ['#1d2024', 'Bell curve with the same average and spread']])}
      <div class="chart" id="c-hist"></div>
      <p class="read"><b>How to read it.</b> Drag the confidence slider and the line moves along the tail. Tick Log scale to see the far tail: the bars that sit where the bell curve has already dropped to zero are the days a normal model says should never happen.</p>
    </section>
    <section class="blk two">
      <div><div class="blk-h"><h2>The numbers behind the shape</h2></div>
        <div class="tbl-wrap"><table><tbody id="st-table"></tbody></table></div></div>
      <div><div class="blk-h"><h2>Value-at-risk at every confidence level</h2><p>Measured against the bell curve. Click the chart to set the level.</p></div>
        ${legend([['#8b1d41', 'Measured'], ['#1d2024', 'Bell curve']])}
        <div class="chart" id="c-curve"></div>
        <p class="read">The two lines sit together at ordinary levels and separate as confidence rises. The gap at 99% and beyond is why stress scenarios and expected shortfall sit next to value-at-risk.</p></div>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Who is behind the business's worst days</h2><span class="muted" style="font-size:13.5px">at <b class="st-level mono"></b> confidence, CAD m</span>
        <p>Each desk's expected shortfall on its own, and its share of the loss on the days the whole business does worst. Moves with the confidence slider.</p></div>
      <div class="two">
        <div><div class="tbl-wrap"><table><thead><tr><th>Desk</th><th>On its own</th><th>On the business's worst days</th><th class="num">Share</th></tr></thead><tbody id="st-contrib"></tbody></table></div>
          <p class="read" id="st-contrib-read"></p></div>
        <div><h3>By underlying</h3><div class="chart" id="c-contrib-u"></div><p class="read">Orange adds to the loss on those days; blue offsets it.</p></div>
      </div>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Beta: how each desk moves with the market</h2><div class="ctl">${seg('betaDesk', STAT_DESKS.map(([k, l]) => [k, k === 'total' ? l : DESK[k].short]))} ${seg('betaFactor', FACTORS)}</div>
        <p>Daily P&amp;L of the desk against the daily move of an index, over the 750 simulated days, with one line fitted to down days and one to up days.</p></div>
      <div class="kpis" id="beta-tiles"></div>
      ${legend([['#c2513a', 'Fit on down days'], ['#2f6f9f', 'Fit on up days'], ['#1d2024', 'Fit on all days']])}
      <div class="chart" id="c-beta"></div>
      <p class="read" id="beta-read"></p>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Real markets: beta to the S&amp;P 500, calm and stressed</h2>
        <p>Measured from daily returns since February 2009. The stressed columns use only the ${B.TECH.nDown} days when the S&amp;P 500 fell more than 2%.</p></div>
      <div class="tbl-wrap"><table><thead><tr><th>Market</th><th class="num">Beta, all days</th><th class="num">Beta, S&amp;P down &gt;2%</th><th class="num">Correlation</th><th class="num">Average move then</th><th class="num">Fell together</th></tr></thead><tbody>
        ${keys.map((k) => `<tr><td class="nw"><span class="dot" style="background:${MKT_COLORS[k]};margin-right:8px"></span>${B[k].name}</td><td class="num">${num(B[k].beta, 2)}</td><td class="num" style="${B[k].betaDown > B[k].beta + 0.1 ? 'color:var(--breach);font-weight:500' : ''}">${num(B[k].betaDown, 2)}</td><td class="num">${num(B[k].corr, 2)}</td><td class="num">${num(B[k].avgDown, 2)}%</td><td class="num">${num(B[k].fellTogether, 0)}%</td></tr>`).join('')}
        <tr><td class="muted">S&amp;P 500 itself on those days</td><td></td><td></td><td></td><td class="num">${num(B.TECH.avgUsDown, 2)}%</td><td></td></tr>
      </tbody></table></div>
      <p class="read"><b>How to read it.</b> A beta of 1 means the market moves one for one with the S&amp;P 500. Brazil's beta rises from ${num(B.EM.beta, 2)} on all days to ${num(B.EM.betaDown, 2)} on the bad ones, and Canada's from ${num(B.CA.beta, 2)} to ${num(B.CA.betaDown, 2)}: diversification shrinks on the days it is needed. A hedge ratio set on calm-market betas is too small in a selloff.</p>
      <div class="blk-h" style="margin-top:26px"><h3 style="font-size:16px">Rolling one year</h3>${seg('rollKind', [['beta', 'Beta'], ['corr', 'Correlation']])}</div>
      ${legend(keys.map((k) => [MKT_COLORS[k], B[k].name]))}
      <div class="chart" id="c-roll"></div>
      <p class="read">Betas are not constants. Each line is re-estimated every month on the previous 250 trading days, so a limit or hedge built on last year's number has to be checked against this one.</p>
    </section>
    <section class="blk">
      <div class="blk-h"><h2>Do the desks lose together?</h2>${seg('corrMode', [['all', 'All days'], ['tail', 'Worst 10% of days']])}
        <p>Correlation of daily P&amp;L between desks, from −1 (one gains when the other loses) to +1 (they move together).</p></div>
      <div class="tbl-wrap"><table class="heat" style="max-width:640px"><thead><tr><th></th>${E.DESKS.map((d) => `<th class="num">${d.short}</th>`).join('')}</tr></thead><tbody>
        ${E.DESKS.map((d, i) => `<tr><td class="nw"><span class="dot" style="background:${d.color};margin-right:8px"></span>${d.short}</td>${cm[i].map(cc).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="read"><b>How to read it.</b> Orange cells are the natural offsets inside the business. Switch to the worst 10% of days to see whether an offset is still there when it is needed; the business's diversification benefit is only as real as those cells.</p>
    </section>
    ${prevNext('/statistics')}`,
    after: () => {
      drawStats(); drawBeta();
      const xt = []; months.forEach((mo, i) => { if (mo.endsWith('-01') && (+mo.slice(0, 4)) % 2 === 0) xt.push({ i, label: mo.slice(0, 4) }); });
      lineChart(document.getElementById('c-roll'), {
        n: months.length, height: 280, label: 'Rolling one-year beta to the S&P 500', includeZero: ui.rollKind !== 'beta', yFmt: (v) => num(v, 1),
        series: keys.map((k) => ({ name: B[k].name, color: MKT_COLORS[k], values: B[k][kind], width: 1.8 })), xTicks: xt,
        tip: (i) => `<b>${MONTHS[+months[i].slice(5) - 1]} ${months[i].slice(0, 4)}</b>${keys.map((k) => `<div class="r"><span>${B[k].name}</span><span>${num(B[k][kind][i], 2)}</span></div>`).join('')}`,
      });
      document.getElementById('st-lvl').addEventListener('input', (ev) => { ui.level = +ev.target.value; drawStats(); });
      document.getElementById('st-series').addEventListener('change', (ev) => { ui.stSeries = ev.target.value; drawStats(); });
      document.getElementById('st-normal').addEventListener('change', (ev) => { ui.stNormal = ev.target.checked; drawStats(); });
      document.getElementById('st-log').addEventListener('change', (ev) => { ui.stLog = ev.target.checked; drawStats(); });
    },
  };
};

// ---------- router ----------

function nav(path) {
  document.getElementById('nav').innerHTML = ROUTES.map((r, i) => `${i === 1 || i === ROUTES.length - 3 ? '<div class="gap"></div>' : ''}<a href="#${r.path}" class="${r.path === path ? 'on' : ''}"><span class="ic">${ICONS[r.path]}</span><span>${r.label}</span><span class="n">${r.n}</span></a>`).join('');
  const on = document.querySelector('#nav a.on'); if (on && innerWidth <= 820) on.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function render(keepScroll) {
  const path = ROUTES.some((r) => r.path === location.hash.slice(1)) ? location.hash.slice(1) : '/';
  const r = ROUTES.find((x) => x.path === path), main = document.getElementById('main'), y = scrollY;
  clearCharts();
  const page = PAGES[path](r);
  main.innerHTML = page.html;
  nav(path);
  document.title = `${r.label} · Risk Oversight Demonstration`;
  if (page.after) page.after();
  if (keepScroll) scrollTo(0, y); else scrollTo(0, 0);
}
document.addEventListener('click', (ev) => {
  const row = ev.target.closest('[data-ev]');
  if (row) { ui.hEvent = +row.dataset.ev; ui.hRange = 'event'; render(true); document.querySelector('.ctlbar')?.scrollIntoView({ block: 'start' }); return; }
  const b = ev.target.closest('[data-seg]');
  if (!b) return;
  const v = b.dataset.v; ui[b.dataset.seg] = /^-?\d+$/.test(v) ? +v : v;
  render(true);
});
addEventListener('hashchange', () => render(false));
addEventListener('scroll', hideTip, { passive: true });

fetch('data/market.json').then((r) => r.json()).then((m) => { S = compute(m); window.__risk = { S, E }; render(false); })
  .catch((err) => { document.getElementById('main').innerHTML = `<p class="loading">Could not load the market data (${esc(err.message)}). Serve the folder over http, for example: python -m http.server.</p>`; });
