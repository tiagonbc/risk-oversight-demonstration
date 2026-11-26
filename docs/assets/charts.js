// Small SVG chart helpers. No dependencies: each chart is drawn at its container's pixel width
// and redrawn when the container resizes, so text stays the same size on a phone.

const MINUS = '−';
export const num = (x, d = 1) => (x < 0 ? MINUS : '') + Math.abs(x).toFixed(d);
export const signed = (x, d = 1) => (x > 0 ? '+' : x < 0 ? MINUS : '') + Math.abs(x).toFixed(d);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const INK = '#1d2024', GRID = '#e5e2dc', AXIS = '#cfcbc3';
const observers = [], cleanups = [];
export function clearCharts() { while (observers.length) observers.pop().disconnect(); while (cleanups.length) cleanups.pop()(); hideTip(); }
function mount(el, draw) {
  let last = 0;
  const ro = new ResizeObserver(() => { const w = Math.round(el.clientWidth); if (w > 0 && w !== last) { last = w; setTimeout(() => { if (el.isConnected) draw(w); }, 0);   /* after the observer returns; a timer also runs in a background tab */ } });
  if (el._ro) el._ro.disconnect();   // redrawing with new options replaces the earlier chart
  el._ro = ro;
  ro.observe(el); observers.push(ro);
}

const tipEl = () => document.getElementById('tip');
export function showTip(html, x, y) {
  const t = tipEl(); t.innerHTML = html; t.classList.add('on');
  const r = t.getBoundingClientRect(), pad = 12;
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - pad) left = x - r.width - 14;
  if (top + r.height > innerHeight - pad) top = y - r.height - 14;
  t.style.left = Math.max(pad, left) + 'px'; t.style.top = Math.max(pad, top) + 'px';
}
export function hideTip() { const t = tipEl(); if (t) t.classList.remove('on'); }

export function ticks(min, max, n = 5) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n + 0.5) || raw;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

function logTicks(lo, hi) {
  const out = [];
  for (let k = Math.floor(Math.log10(lo)); k <= Math.ceil(Math.log10(hi)); k++) for (const mm of [1, 2, 5]) { const v = mm * 10 ** k; if (v >= lo && v <= hi) out.push(v); }
  if (out.length < 3) return ticks(lo, hi, 5);   // a narrow range reads better with evenly spaced labels
  return out.length > 7 ? out.filter((v) => /^[15]/.test(String(v))) : out;
}

// Diverging colour: warm for losses, cool for gains, neutral grey in the middle
export function divColor(v, max) {
  const t = Math.max(-1, Math.min(1, v / (max || 1)));
  const mid = [240, 238, 233], pole = t < 0 ? [194, 81, 58] : [47, 111, 159], k = Math.abs(t) ** 0.7;
  const c = mid.map((m, i) => Math.round(m + (pole[i] - m) * k));
  return { bg: `rgb(${c.join(',')})`, fg: k > 0.55 ? '#fff' : INK };
}

// Line chart: optional thin bars (daily P&L), lines, ring markers, shaded spans; crosshair + tooltip
export function lineChart(el, o) {
  mount(el, (W) => {
    const H = o.height || 280, m = { t: 14, r: o.endLabels ? 96 : 14, b: 30, l: 46 };
    const n = o.n, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const all = [];
    (o.series || []).forEach((s) => s.values.forEach((v) => v != null && all.push(v)));
    if (o.bars) o.bars.values.forEach((v) => all.push(v));
    if (o.includeZero !== false && !o.log) all.push(0);
    let lo = Math.min(...all), hi = Math.max(...all);
    const T = o.log ? Math.log : (v) => v;
    if (o.log) { lo *= 0.93; hi *= 1.07; } else { const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad; }
    if (o.yMax !== undefined) hi = o.yMax; if (o.yMin !== undefined) lo = o.yMin;
    const x = (i) => m.l + (n === 1 ? pw / 2 : (i / (n - 1)) * pw), y = (v) => m.t + (1 - (T(v) - T(lo)) / (T(hi) - T(lo))) * ph;
    const yt = (o.log ? logTicks(lo, hi) : ticks(lo, hi, 5)).filter((v) => v >= lo && v <= hi);
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(o.label || 'chart')}">`;
    for (const sp of o.spans || []) s += `<rect x="${x(sp.from)}" y="${m.t}" width="${Math.max(3, x(sp.to) - x(sp.from))}" height="${ph}" fill="${sp.on ? '#8b1d41' : '#1d2024'}" opacity="${sp.on ? 0.16 : 0.06}"/>`;
    for (const v of yt) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? AXIS : GRID}" stroke-width="1"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${(o.yFmt || num)(v)}</text>`;
    let lastTick = -1e9;
    for (const t of o.xTicks || []) {
      // on a narrow chart, drop a centred label that would run into the one before it
      const tx = x(t.i), need = String(t.label).length * 6.4 + 12;
      if (!t.anchor && tx - lastTick < need) continue;
      lastTick = tx;
      s += `<text x="${tx}" y="${H - 9}" text-anchor="${t.anchor || 'middle'}">${esc(t.label)}</text>`;
    }
    if (o.bars) {
      const bw = Math.max(1, Math.min(3, pw / n - 1));
      o.bars.values.forEach((v, i) => { const y0 = y(0), y1 = y(v); s += `<rect x="${x(i) - bw / 2}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(0.5, Math.abs(y1 - y0))}" fill="${o.bars.color || '#5a616b'}"/>`; });
    }
    for (const se of o.series || []) {
      let d = '', pen = false;
      se.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      if (se.area && !o.log) s += `<path d="${d}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z" fill="${se.color}" opacity="0.14"/>`;
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.width || 2}" stroke-linejoin="round" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''}/>`;
      if (o.endLabels) { const li = se.values.length - 1; s += `<text class="lb" x="${x(li) + 8}" y="${y(se.values[li]) + 4 + (se.dy || 0)}">${esc(se.name)}</text>`; }
    }
    for (const p of o.points || []) s += `<circle cx="${x(p.i)}" cy="${y(p.value)}" r="5" fill="#fff" stroke="${p.color || '#c41f3e'}" stroke-width="2"/>`;
    // event marks: a thin vertical line, and (unless plain) a numbered flag at the top, staggered when two are close
    const rowEnd = [-99, -99, -99];
    for (const mk of o.marks || []) {
      const mx = x(mk.i), c = mk.on ? '#8b1d41' : '#7b808a';
      s += `<line x1="${mx}" x2="${mx}" y1="${m.t}" y2="${m.t + ph}" stroke="${c}" stroke-width="${mk.on ? 1.6 : 1}" opacity="${mk.on ? 0.9 : 0.35}" stroke-dasharray="${mk.on ? '' : '2 3'}"/>`;
      if (o.marksPlain) continue;
      let row = rowEnd.findIndex((e) => mx - e >= 17); if (row < 0) row = 0;
      rowEnd[row] = mx;
      s += `<circle cx="${mx}" cy="${m.t + 9 + row * 18}" r="8" fill="${c}"/><text x="${mx}" y="${m.t + 12.5 + row * 18}" text-anchor="middle" style="fill:#fff;font-size:10px;font-weight:600">${esc(mk.label)}</text>`;
    }
    for (const sp of o.spans || []) if (sp.label) s += `<text x="${(x(sp.from) + x(sp.to)) / 2}" y="${m.t + ph - 6 - (sp.row || 0) * 14}" text-anchor="middle" style="font-size:11px;fill:${sp.on ? '#8b1d41' : '#7b808a'};font-weight:${sp.on ? 600 : 400}">${esc(sp.label)}</text>`;
    s += `<line class="xh" x1="0" x2="0" y1="${m.t}" y2="${m.t + ph}" stroke="${INK}" stroke-width="1" opacity="0"/>`;
    s += `<rect class="hit" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="transparent" style="cursor:${o.onClick ? 'pointer' : 'crosshair'}"/></svg>`;
    el.innerHTML = s;
    const hit = el.querySelector('.hit'), xh = el.querySelector('.xh');
    const idx = (ev) => { const r = hit.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - r.left) / r.width) * (n - 1)))); };
    const setXh = (i) => { if (i == null) { xh.setAttribute('opacity', 0); return; } xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('opacity', 0.35); };
    const tell = (i) => { if (o.sync) document.dispatchEvent(new CustomEvent('xh:' + o.sync, { detail: { i, src: el } })); };
    if (o.sync) {
      // charts that share a time axis show the crosshair together
      if (el._sync) document.removeEventListener('xh:' + o.sync, el._sync);
      el._sync = (ev) => { if (ev.detail.src !== el) setXh(ev.detail.i); };
      document.addEventListener('xh:' + o.sync, el._sync);
      const h = el._sync; cleanups.push(() => document.removeEventListener('xh:' + o.sync, h));
    }
    hit.addEventListener('pointermove', (ev) => { const i = idx(ev); setXh(i); tell(i); if (o.tip) showTip(o.tip(i), ev.clientX, ev.clientY); });
    hit.addEventListener('pointerleave', () => { setXh(null); tell(null); hideTip(); });
    if (o.onClick) hit.addEventListener('click', (ev) => o.onClick(idx(ev)));
  });
}

// Vertical bars from a zero baseline, rounded at the data end, value printed on each bar, optional limit line
export function barChart(el, o) {
  mount(el, (W) => {
    const n = o.values.length, narrow = (W - 58) / n < 66, cats = narrow && o.catsNarrow ? o.catsNarrow : o.cats, subs = narrow ? null : o.sub;
    const H = o.height || 280, m = { t: 22, r: o.limit ? (narrow ? 40 : 74) : 12, b: subs ? 46 : 32, l: narrow ? 38 : 46 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const vals = [...o.values, 0]; if (o.limit) vals.push(o.limit.value);
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.12 || 1; if (lo < 0) lo -= pad; if (hi > 0) hi += pad;
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * ph, band = pw / n, bw = Math.min(64, band * 0.56);
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(o.label || 'bar chart')}">`;
    for (const v of ticks(lo, hi, 5)) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? AXIS : GRID}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${num(v, o.dec ?? 0)}</text>`;
    o.values.forEach((v, i) => {
      const cx = m.l + band * (i + 0.5), x0 = cx - bw / 2, y0 = y(0), y1 = y(v), r = Math.min(4, Math.abs(y1 - y0), bw / 2);
      const d = v >= 0
        ? `M${x0},${y0}V${y1 + r}Q${x0},${y1} ${x0 + r},${y1}H${x0 + bw - r}Q${x0 + bw},${y1} ${x0 + bw},${y1 + r}V${y0}Z`
        : `M${x0},${y0}V${y1 - r}Q${x0},${y1} ${x0 + r},${y1}H${x0 + bw - r}Q${x0 + bw},${y1} ${x0 + bw},${y1 - r}V${y0}Z`;
      s += `<path class="b" data-i="${i}" d="${d}" fill="${(o.colors && o.colors[i]) || o.color || '#5a616b'}"/>`;
      s += `<text class="v" x="${cx}" y="${v >= 0 ? y1 - 6 : y1 + 15}" text-anchor="middle" ${narrow ? 'style="font-size:10.5px"' : ''}>${signed(v, narrow && Math.abs(v) >= 100 ? 0 : o.dec ?? 1)}</text>`;
      s += `<text class="lb" x="${cx}" y="${H - m.b + 18}" text-anchor="middle" ${narrow ? 'style="font-size:11px"' : ''}>${esc(cats[i])}</text>`;
      if (subs) s += `<text x="${cx}" y="${H - m.b + 33}" text-anchor="middle">${esc(subs[i])}</text>`;
      s += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ph}" fill="transparent"/>`;
    });
    if (o.limit) s += `<line x1="${m.l}" x2="${W - m.r + 4}" y1="${y(o.limit.value)}" y2="${y(o.limit.value)}" stroke="#c41f3e" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - m.r + 8}" y="${y(o.limit.value) + 4}" style="fill:#c41f3e;font-weight:600">${esc(o.limit.label)}</text>`;
    el.innerHTML = s + '</svg>';
    el.querySelectorAll('.hit').forEach((h) => {
      h.addEventListener('pointermove', (ev) => { if (o.tip) showTip(o.tip(+h.dataset.i), ev.clientX, ev.clientY); });
      h.addEventListener('pointerleave', hideTip);
    });
  });
}

// Histogram with the loss tail shaded, value-at-risk and expected-shortfall markers, optional bell curve and log scale
export function histChart(el, o) {
  mount(el, (W) => {
    const H = o.height || 320, m = { t: 30, r: 14, b: 34, l: 46 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const nb = o.counts.length, hi = o.lo + nb * o.step, x = (v) => m.l + ((Math.max(o.lo, Math.min(hi, v)) - o.lo) / (hi - o.lo)) * pw;
    const tr = (c) => (o.log ? Math.log10(Math.max(c, 0.5) / 0.5) : c);
    const maxC = Math.max(...o.counts, ...(o.normal || [0])), top = tr(maxC) * 1.07 || 1, y = (c) => m.t + (1 - Math.min(tr(c), top) / top) * ph;
    const yt = o.log ? [1, 10, 100, 1000].filter((v) => v <= maxC) : ticks(0, maxC, 4).filter((v) => v > 0);
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(o.label || 'histogram')}">`;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="${AXIS}"/>`;
    for (const v of yt) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${GRID}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    const bw = pw / nb;
    o.counts.forEach((c, i) => {
      if (!c) return;
      const tail = o.lo + (i + 1) * o.step <= -o.var + 1e-9, y1 = y(c);
      s += `<rect x="${m.l + i * bw + (bw > 3 ? 0.5 : 0)}" y="${y1}" width="${Math.max(1, bw - (bw > 3 ? 1 : 0))}" height="${Math.max(1, m.t + ph - y1)}" fill="${tail ? '#c2513a' : '#9aa0a8'}"/>`;
    });
    if (o.normal) {
      let d = '';
      o.normal.forEach((c, i) => { d += `${i ? 'L' : 'M'}${(m.l + (i + 0.5) * bw).toFixed(1)},${y(c).toFixed(1)}`; });
      s += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
    }
    const xv = x(-o.var), xe = x(-o.es), near = Math.abs(xv - xe) < 4;
    s += `<line x1="${xe}" x2="${xe}" y1="${m.t - 4}" y2="${m.t + ph}" stroke="#8b1d41" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    s += `<line x1="${xv}" x2="${xv}" y1="${m.t - 4}" y2="${m.t + ph}" stroke="#8b1d41" stroke-width="1.8"/>`;
    s += `<text x="${xv + 6}" y="${m.t - 12}" style="fill:#8b1d41;font-weight:600">${esc(o.varLabel)}</text>`;
    if (!near) s += `<text x="${xe - 6}" y="${m.t - 12}" text-anchor="end" style="fill:#8b1d41;font-weight:600">${esc(o.esLabel)}</text>`;
    for (const v of ticks(o.lo, hi, W < 520 ? 5 : 9)) s += `<text x="${x(v)}" y="${H - 10}" text-anchor="middle">${(o.xFmt || num)(v)}</text>`;
    o.counts.forEach((c, i) => { s += `<rect class="hit" data-i="${i}" x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${ph}" fill="transparent"/>`; });
    el.innerHTML = s + '</svg>';
    el.querySelectorAll('.hit').forEach((h) => {
      h.addEventListener('pointermove', (ev) => { if (o.tip) showTip(o.tip(+h.dataset.i), ev.clientX, ev.clientY); });
      h.addEventListener('pointerleave', hideTip);
    });
  });
}

// Scatter of one series against another with fitted lines; the nearest point is shown on hover
export function scatterChart(el, o) {
  mount(el, (W) => {
    const H = o.height || 340, m = { t: 22, r: 14, b: 40, l: 50 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const xs = o.points.map((p) => p.x), ys = o.points.map((p) => p.y);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const px = (x1 - x0) * 0.04, py = (y1 - y0) * 0.06; x0 -= px; x1 += px; y0 -= py; y1 += py;
    const X = (v) => m.l + ((v - x0) / (x1 - x0)) * pw, Y = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * ph;
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(o.label || 'scatter')}">`;
    for (const v of ticks(y0, y1, 5)) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 0 ? AXIS : GRID}"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${num(v, o.yDec ?? 0)}</text>`;
    for (const v of ticks(x0, x1, W < 520 ? 5 : 8)) s += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${m.t + ph}" stroke="${v === 0 ? AXIS : 'none'}"/><text x="${X(v)}" y="${m.t + ph + 16}" text-anchor="middle">${signed(v, 0)}%</text>`;
    s += `<text x="${m.l + pw / 2}" y="${H - 6}" text-anchor="middle">${esc(o.xLabel)}</text><text x="${m.l - 40}" y="${m.t - 9}">${esc(o.yLabel)}</text>`;
    for (const p of o.points) s += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.3" fill="${o.color || '#5a616b'}" opacity="0.5"/>`;
    for (const l of o.lines || []) {
      const a = Math.max(x0, l.from ?? x0), b = Math.min(x1, l.to ?? x1);
      s += `<line x1="${X(a)}" y1="${Y(l.intercept + l.slope * a)}" x2="${X(b)}" y2="${Y(l.intercept + l.slope * b)}" stroke="${l.color}" stroke-width="${l.width || 2}" ${l.dash ? `stroke-dasharray="${l.dash}"` : ''} stroke-linecap="round"/>`;
    }
    s += `<circle class="hl" r="5" fill="none" stroke="${INK}" stroke-width="2" opacity="0"/><rect class="hit" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="transparent" style="cursor:crosshair"/></svg>`;
    el.innerHTML = s;
    const hit = el.querySelector('.hit'), hl = el.querySelector('.hl');
    hit.addEventListener('pointermove', (ev) => {
      const r = hit.getBoundingClientRect(), mx = m.l + ev.clientX - r.left, my = m.t + ev.clientY - r.top;
      let best = 0, bd = Infinity;
      o.points.forEach((p, i) => { const d = (X(p.x) - mx) ** 2 + (Y(p.y) - my) ** 2; if (d < bd) { bd = d; best = i; } });
      hl.setAttribute('cx', X(o.points[best].x)); hl.setAttribute('cy', Y(o.points[best].y)); hl.setAttribute('opacity', 1);
      if (o.tip) showTip(o.tip(o.points[best]), ev.clientX, ev.clientY);
    });
    hit.addEventListener('pointerleave', () => { hl.setAttribute('opacity', 0); hideTip(); });
  });
}

// Horizontal bars for a ranked list (signed), label on the left, value at the bar end
export function hbars(el, o) {
  mount(el, (W) => {
    const rh = 28, m = { l: o.labelWidth || 120, r: 56 }, H = o.rows.length * rh + 8, pw = W - m.l - m.r;
    const max = Math.max(...o.rows.map((r) => Math.abs(r.value))) || 1, neg = o.rows.some((r) => r.value < 0), pos = o.rows.some((r) => r.value > 0);
    const zero = neg && pos ? m.l + pw / 2 : neg ? m.l + pw : m.l, scale = (neg && pos ? pw / 2 : pw) / max;
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(o.label || 'bars')}">`;
    o.rows.forEach((r, i) => {
      const yy = i * rh + 6, w = Math.max(1, Math.abs(r.value) * scale), x0 = r.value < 0 ? zero - w : zero;
      s += `<text class="lb" x="0" y="${yy + 13}">${esc(r.label)}</text><rect x="${x0}" y="${yy}" width="${w}" height="16" rx="2" fill="${r.color || '#5a616b'}"/>`;
      s += `<text class="v" x="${r.value < 0 ? x0 - 6 : x0 + w + 6}" y="${yy + 13}" text-anchor="${r.value < 0 ? 'end' : 'start'}">${signed(r.value, o.dec ?? 1)}</text>`;
    });
    s += `<line x1="${zero}" x2="${zero}" y1="0" y2="${H}" stroke="${AXIS}"/>`;
    el.innerHTML = s + '</svg>';
  });
}
