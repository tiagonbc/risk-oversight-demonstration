# Risk Oversight Demonstration

A working demonstration of market risk oversight for a Global Equities trading business, built by Tiago Costa for the role of Director, Trading Market Risk, Global Equities.

**Demonstration software.** The business, its four desks, every position and every limit are mock. Nothing here describes CIBC or any real firm, and the project is not affiliated with or endorsed by CIBC. The market episodes are real: each fall, date and VIX level is measured from daily data.

## What it shows

The posting sets six goals. Each has a page with metrics, charts and the procedure behind them.

| Page | Goal in the posting | What the page does |
|---|---|---|
| 01 Oversight | Risk oversight and communication | Limits on one scale, daily P&L against value-at-risk, exposure by underlying, a generated morning note |
| 02 Challenge | Effective challenge | P&L explain, delta profile by desk, a challenge log with evidence, risks the daily numbers miss |
| 03 Partnership | Partnership across functions | A daily timetable with each partner function, live data checks, what each partner gives and gets |
| 04 Stress | Risk framework enhancement | Nine scenarios (seven measured from history), a fall-and-volatility grid, reverse stress |
| 05 Measures & capital | Measurement and process improvement | FRTB standardised charge by desk, P&L attribution test, backtesting, pre-trade what-if, SQL and Python examples |
| 06 Markets | Regulatory and market expertise | Seven market episodes since 2008 with measured facts and the control each one becomes; product and rule notes |
| History | Prices, volatility, events | Weekly price history since 2007 for five markets (rebased to 100) with rolling volatility against the VIX, fast and slow value-at-risk, drawdown and rolling beta on one time axis, and 22 dated market events that can be opened and zoomed |
| Statistics | Behind every number | Interactive distributions with a confidence slider, value-at-risk against the bell curve, tail contributions by desk and underlying, desk betas with separate up-day and down-day fits, real-market betas (calm, stressed and rolling) and desk correlations |

## How it is built

- `docs/assets/engine.js`: the risk engine in plain JavaScript, no dependencies. Black-Scholes pricing and Greeks, full revaluation, historical-simulation value-at-risk and expected shortfall, backtesting, the P&L attribution test (rank correlation and distribution gap), the FRTB sensitivities-based method for the equity risk class, limits and reverse stress.
- `docs/assets/charts.js`: small SVG chart helpers with hover tooltips.
- `docs/assets/app.js`: the ten pages.
- `build_data.py`: measures the market episodes from a local daily-data cache and writes `docs/data/market.json` (episodes, return histograms and tail quantiles, betas to the S&P 500) and `docs/data/history.json` (weekly index levels rebased to 100, rolling volatility, value-at-risk, drawdown and beta, and the measured market events). No daily prices are published.
- `tests/engine.test.mjs`: 25 automated tests.

```
node --test tests/engine.test.mjs      # run the tests
python -m http.server 8798 --directory docs   # serve the site locally
```

## Simplifications

- The structured-note book is represented by its vanilla option profile. Barriers, autocall dates and worst-of baskets are not priced; they are listed as risks to size separately.
- Options keep their own implied volatility when prices move (sticky strike). Long-dated options receive a share of each volatility move that falls with the square root of maturity.
- The capital calculation covers the equity risk class only, nets maturities within each underlying for vega, and omits the default risk charge. It is a teaching version written from the published Basel text, not a regulatory calculator.
- The 750-day history behind value-at-risk is simulated from a fixed seed, with volatility clustering and jumps.
- One limit breach, one unexplained P&L item, one stale volatility mark and one model gap are planted so the pages show what a problem looks like.

Built by Tiago Costa, working with an AI coding agent (Claude Code) under automated tests.
