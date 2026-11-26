"""Builds docs/data/market.json: derived statistics only (no price series are published).

Reads the local Norgate cache kept by the DAA Lab project and measures the market
episodes used as stress scenarios: peak-to-trough, worst day, worst ten trading days,
and how far the VIX moved. Run:  python build_data.py
"""
import glob, json, os, sys
import numpy as np
import pandas as pd

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'DAA Lab', 'data', 'cache')

def load(sym):
    best = None
    for f in glob.glob(os.path.join(CACHE, 'ng_' + sym.replace('$', '_') + '_[01]*.pkl')):
        s = pd.read_pickle(f)
        if isinstance(s, pd.DataFrame):
            s = s.iloc[:, 0]
        s = s.dropna()
        if best is None or s.index[-1] > best.index[-1] or (s.index[-1] == best.index[-1] and len(s) > len(best)):
            best = s
    if best is None:
        sys.exit('missing ' + sym)
    return best.astype(float)

S = {'US': load('$SPX'), 'TECH': load('$NDX'), 'CA': load('EWC'), 'EU': load('VGK'), 'EM': load('EWZ')}
VIX = load('$VIX')

EPISODES = [
    ('gfc',   'Global financial crisis',        '2008-09-01', '2009-03-31', 'US'),
    ('euro',  'Euro debt crisis and US downgrade', '2011-07-01', '2011-10-31', 'US'),
    ('br17',  'Brazil political gap',           '2017-05-10', '2017-05-31', 'EM'),
    ('br18',  'Brazil strike and election year', '2018-01-15', '2018-09-30', 'EM'),
    ('covid', 'COVID crash',                    '2020-02-10', '2020-04-15', 'US'),
    ('rates', 'Rate shock bear market',         '2022-01-01', '2022-12-31', 'TECH'),
    ('ai26',  'AI unwind',                      '2026-07-01', '2026-11-30', 'TECH'),
]

def pct(a, b):
    return round((b / a - 1) * 100, 1)

def at(s, d):
    s2 = s[:d]
    return float(s2.iloc[-1]) if len(s2) else float('nan')

out = {'asOf': str(S['US'].index[-1].date()), 'episodes': []}
for key, name, a, b, driver in EPISODES:
    d = S[driver][a:b]
    # peak to trough inside the window
    run_max = d.cummax()
    dd = d / run_max - 1
    trough = dd.idxmin()
    peak = d[:trough].idxmax()
    # worst single day and worst ten trading days
    r1 = d.pct_change()
    wd = r1.idxmin()
    r10 = d / d.shift(10) - 1
    w10_end = r10.idxmin()
    w10_start = d.index[d.index.get_loc(w10_end) - 10]
    prev = d.index[d.index.get_loc(wd) - 1]
    v = VIX[a:b]
    ep = {
        'key': key, 'name': name, 'driver': driver,
        'peak': str(peak.date()), 'trough': str(trough.date()),
        'tradingDays': int(len(d[peak:trough]) - 1),
        'peakToTrough': {k: pct(at(s, peak), at(s, trough)) for k, s in S.items() if s.index[0] <= peak},
        'worstDay': {'date': str(wd.date()), 'moves': {k: pct(at(s, prev), at(s, wd)) for k, s in S.items() if s.index[0] <= prev},
                     'vixFrom': round(at(VIX, prev), 1), 'vixTo': round(at(VIX, wd), 1)},
        'worst10': {'from': str(w10_start.date()), 'to': str(w10_end.date()),
                    'moves': {k: pct(at(s, w10_start), at(s, w10_end)) for k, s in S.items() if s.index[0] <= w10_start},
                    'vixFrom': round(at(VIX, w10_start), 1), 'vixTo': round(at(VIX, w10_end), 1)},
        'vixPeak': round(float(v.max()), 1), 'vixPeakDate': str(v.idxmax().date()),
        'vixStart': round(at(VIX, peak), 1),
    }
    out['episodes'].append(ep)

# the last trading day in the data: used as "yesterday" in the morning brief
last, prev = S['US'].index[-1], S['US'].index[-2]
out['lastDay'] = {'date': str(last.date()),
                  'moves': {k: pct(at(s, prev), at(s, last)) for k, s in S.items()},
                  'vixFrom': round(at(VIX, prev), 1), 'vixTo': round(at(VIX, last), 1)}

# long view since 2007: month-end drawdown from the running high, and the month's highest VIX close
spx = S['US']['2007-01-01':]
ddm = (spx / spx.cummax() - 1).resample('ME').min() * 100
vxm = VIX['2007-01-01':].resample('ME').max()
out['history'] = {'months': [d.strftime('%Y-%m') for d in ddm.index],
                  'drawdown': [round(float(x), 1) for x in ddm.values],
                  'vixMax': [round(float(x), 1) for x in vxm.reindex(ddm.index).values]}
# a few facts about daily S&P 500 returns since 2009, quoted on the site
r = S['US']['2009-02-01':].pct_change().dropna()
sd = r.std()
out['facts'] = {'days': int(len(r)), 'beyond3sd': int(((r - r.mean()).abs() > 3 * sd).sum()),
                'expectedNormal': round(len(r) * 0.0027, 1), 'worstDay': round(float(r.min()) * 100, 1),
                'worstDayDate': str(r.idxmin().date()), 'dailySd': round(float(sd) * 100, 2),
                'bestDay': round(float(r.max()) * 100, 1), 'bestDayDate': str(r.idxmax().date())}

# Daily return distributions since February 2009: binned counts, moments and tail quantiles.
# No dates beyond the best and worst day, and no price levels.
NAMES = {'US': 'S&P 500', 'TECH': 'Nasdaq-100', 'CA': 'Canada (EWC fund)', 'EU': 'Europe (VGK fund)', 'EM': 'Brazil (EWZ fund)'}
rets = {k: s['2009-02-01':].pct_change().dropna() * 100 for k, s in S.items()}
LO, HI, STEP = -15.0, 15.0, 0.25
edges = np.arange(LO, HI + STEP / 2, STEP)
out['dist'] = {}
for k, rr in rets.items():
    v = rr.values
    m, sdv = v.mean(), v.std(ddof=1)
    zs = (v - m) / v.std()
    srt = np.sort(v)
    var_g, es_g = [], []
    for i in range(1, 101):                       # tail probabilities 0.1% to 10.0%
        p = i / 1000
        cut = max(1, int(round(len(v) * p)))
        var_g.append(round(float(-np.quantile(v, p)), 3))
        es_g.append(round(float(-srt[:cut].mean()), 3))
    out['dist'][k] = {
        'name': NAMES[k], 'n': int(len(v)), 'mean': round(float(m), 4), 'median': round(float(np.median(v)), 4),
        'sd': round(float(sdv), 4), 'skew': round(float((zs ** 3).mean()), 3), 'kurt': round(float((zs ** 4).mean() - 3), 2),
        'min': round(float(v.min()), 2), 'minDate': str(rr.idxmin().date()), 'max': round(float(v.max()), 2), 'maxDate': str(rr.idxmax().date()),
        'beyond3': int((np.abs(v - m) > 3 * sdv).sum()),
        'hist': {'lo': LO, 'step': STEP, 'counts': np.histogram(np.clip(v, LO + 1e-9, HI - 1e-9), edges)[0].tolist()},
        'var': var_g, 'es': es_g}

# Beta and co-movement of each market with the S&P 500: all days, days the S&P fell more than 2%, and rolling one year
out['beta'] = {}
for k in ['TECH', 'CA', 'EU', 'EM']:
    df = pd.concat([rets['US'], rets[k]], axis=1, join='inner').dropna()
    df.columns = ['x', 'y']
    dn = df[df.x < -2]
    roll_b = (df.x.rolling(250).cov(df.y) / df.x.rolling(250).var()).resample('ME').last().dropna()
    roll_c = df.x.rolling(250).corr(df.y).resample('ME').last().dropna()
    out['beta'][k] = {
        'name': NAMES[k], 'n': int(len(df)), 'beta': round(float(df.x.cov(df.y) / df.x.var()), 2), 'corr': round(float(df.x.corr(df.y)), 2),
        'nDown': int(len(dn)), 'betaDown': round(float(dn.x.cov(dn.y) / dn.x.var()), 2),
        'avgUsDown': round(float(dn.x.mean()), 2), 'avgDown': round(float(dn.y.mean()), 2), 'fellTogether': round(float((dn.y < 0).mean()) * 100, 0),
        'months': [d.strftime('%Y-%m') for d in roll_b.index],
        'rollBeta': [round(float(x), 2) for x in roll_b.values], 'rollCorr': [round(float(x), 2) for x in roll_c.values]}

dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs', 'data', 'market.json')
with open(dst, 'w') as f:
    json.dump(out, f, indent=1)
print(json.dumps({k: v for k, v in out.items() if k not in ('history', 'dist', 'beta')}, indent=1))

# ---------------------------------------------------------------------------------------------
# docs/data/history.json: weekly history for the History page.
# Index levels are rebased to 100 at the first week of 2007 and sampled once a week; the rolling
# measures are computed on daily returns and then sampled weekly.
# ---------------------------------------------------------------------------------------------
START = '2007-01-01'
EVENTS = [
    ('2008-09-15', 'Lehman Brothers files for bankruptcy', 'The largest bankruptcy in US history froze funding between banks. In October the S&P 500 lost a quarter of its value in ten trading days.', 'Global'),
    ('2008-11-20', 'The VIX closes at its crisis high', 'Forced selling by funds and banks took the S&P 500 to its lowest close since 1997.', 'Global'),
    ('2009-03-09', 'The low of the financial crisis', 'The S&P 500 closed at its lowest point of the crisis. Volatility stayed high for months before it faded.', 'Global'),
    ('2010-05-06', 'The flash crash', 'In the middle of the Greek debt crisis, US indices fell roughly 9% within minutes in the afternoon and recovered most of it, as buy orders vanished from order books.', 'United States'),
    ('2011-08-08', 'First session after the US credit downgrade', "Standard & Poor's cut the US rating from AAA on the Friday evening, in the middle of the euro-area debt crisis.", 'Global'),
    ('2012-07-26', '"Whatever it takes"', 'European Central Bank President Mario Draghi pledged to do whatever it takes to preserve the euro. A calming event: stress in the euro area eased afterwards.', 'Europe'),
    ('2015-08-24', 'China devaluation selloff', 'Two weeks after China devalued the yuan, world markets gapped lower at the open and the VIX briefly traded above 50.', 'Global'),
    ('2016-06-24', 'Brexit referendum result', 'The United Kingdom voted to leave the European Union, against what markets expected. The pound fell to its lowest level in thirty years.', 'Europe'),
    ('2017-05-18', 'Brazil: leaked presidential recording', 'A recording implicating President Michel Temer became public the evening before. Trading in São Paulo was halted by a circuit breaker.', 'Brazil'),
    ('2018-02-05', 'The volatility shock', 'The VIX more than doubled in one session, and exchange-traded products that were short volatility lost almost all of their value.', 'United States'),
    ('2018-05-29', "Brazil: truckers' strike", "A nationwide truckers' strike that began on 21 May stopped fuel and food deliveries, months before a presidential election.", 'Brazil'),
    ('2018-12-24', 'Christmas Eve low', 'The end of a three-month fall driven by rising US interest rates and trade tensions.', 'United States'),
    ('2020-02-24', 'COVID-19 reaches Europe', 'Lockdowns in northern Italy showed the virus had spread beyond Asia. The fall from the record high of 19 February accelerated.', 'Global'),
    ('2020-03-16', 'The worst day since 1987', 'After an emergency Federal Reserve rate cut to zero on the Sunday, US shares fell 12% and trading was halted at the open.', 'Global'),
    ('2020-03-23', 'The COVID low', 'The Federal Reserve announced open-ended asset purchases. Shares reached their low that day.', 'Global'),
    ('2022-06-13', 'Inflation shock confirms the bear market', 'US inflation of 8.6%, reported on the Friday, led markets to price much faster rate rises. The S&P 500 closed more than 20% below its high.', 'Global'),
    ('2022-09-13', 'Hotter inflation report', 'US inflation for August came in above forecasts: the largest one-day fall of the 2022 bear market.', 'United States'),
    ('2023-03-10', 'Silicon Valley Bank fails', 'The second-largest US bank failure up to that date, after a run on deposits. The stress stayed mostly inside regional banks.', 'United States'),
    ('2024-08-05', 'Yen carry trade unwind', 'After a Bank of Japan rate rise and a weak US jobs report, Japanese shares fell 12% in a day and the VIX briefly traded above 60.', 'Global'),
    ('2025-04-04', 'US tariff announcement', "Broad US import tariffs announced on 2 April, and China's retaliation, produced the largest two-day fall since March 2020.", 'Global'),
    ('2025-04-09', 'Tariff pause', 'A 90-day pause on most of the new tariffs produced one of the largest one-day gains on record. Violent rebounds belong to stress periods too.', 'Global'),
    ('2026-11-05', 'AI selloff: sharpest day', 'The largest one-day fall so far in the 2026 selloff in technology and AI-related shares.', 'United States'),
]

us_r = S['US'].pct_change()
weeks = S['US'][START:].resample('W-FRI').last().dropna().index
wk = lambda x, how='last': getattr(x[START:].resample('W-FRI'), how)().reindex(weeks)
arr = lambda x, d=1: [None if pd.isna(v) else round(float(v), d) for v in x.values]
H = {'asOf': out['asOf'], 'weeks': [d.strftime('%Y-%m-%d') for d in weeks], 'vix': arr(wk(VIX)), 'vixMax': arr(wk(VIX, 'max')), 'markets': {}, 'events': []}
for k, s in S.items():
    r = s.pct_change()
    px = s[START:] / s[START:].iloc[0] * 100
    ewma = np.sqrt(r.pow(2).ewm(alpha=0.06, adjust=False).mean())          # RiskMetrics, lambda 0.94: daily standard deviation
    m = {
        'name': NAMES[k],
        'px': arr(wk(px)),
        'vol21': arr(wk(r.rolling(21).std() * np.sqrt(252) * 100)),
        'vol63': arr(wk(r.rolling(63).std() * np.sqrt(252) * 100)),
        'vol250': arr(wk(r.rolling(250).std() * np.sqrt(252) * 100)),
        'varSlow': arr(wk(-r.rolling(250).quantile(0.01) * 100), 2),          # worst 1% of the last 250 days
        'varFast': arr(wk(2.326 * ewma * 100), 2),                             # 99% from recent volatility
        'dd': arr(wk((px / px.cummax() - 1) * 100, 'min')),
        'worst': arr(wk(r * 100, 'min'), 2),
    }
    if k != 'US':
        m['beta'] = arr(wk(r.rolling(250).cov(us_r) / us_r.rolling(250).var()), 2)
    H['markets'][k] = m
for d, title, text, where in EVENTS:
    day = S['US'][d:].index[0]
    prev = S['US'][:day].index[-2]
    H['events'].append({'date': str(day.date()), 'title': title, 'text': text, 'where': where,
                        'week': int(np.searchsorted(weeks.values, np.datetime64(day))),
                        'moves': {k: pct(at(s, prev), at(s, day)) for k, s in S.items()},
                        'vix': round(at(VIX, day), 1), 'vixPrev': round(at(VIX, prev), 1)})
hdst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs', 'data', 'history.json')
with open(hdst, 'w') as f:
    json.dump(H, f, separators=(',', ':'))
print('history.json', os.path.getsize(hdst), 'bytes,', len(weeks), 'weeks')
for e in H['events']:
    print(e['date'], e['week'], e['title'][:38].ljust(38), e['moves'], e['vixPrev'], '->', e['vix'])
