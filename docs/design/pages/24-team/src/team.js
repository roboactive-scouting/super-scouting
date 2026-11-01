// Team page round (24): mock data and builders shared by the four variants.
window.TP = (() => {
  const I = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    scout: '<path d="M9 4h6M9 4a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 13l2 2 4-4"/>',
    entries: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    cal: '<path d="M3 9h18M8 3v4M16 3v4M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    note: '<path d="M4 4h16v12H8l-4 4z"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${I[k]}</svg>`;
  const mark = '../../../concepts/src/mark.png';

  // ---------- data: 1690 Orbit at District #3 · Tel Aviv ----------
  const team = { n: 1690, name: 'Orbit', event: 'District #3 · Tel Aviv', rank: 4, of: 42, avg: 38.4, entries: 10 };
  // [match, status, points, auto high, tele high, tele low, climb, station]
  const matches = [
    ['Q55', 'p', 44, 3, 9, 2, 'Deep', 'r3'],
    ['Q50', 'p', 36, 2, 7, 3, 'Shallow', 'b2'],
    ['Q44', 'p', 42, 2, 8, 5, 'Deep', 'r1'],
    ['Q37', 'p', 47, 4, 9, 4, 'Deep', 'b3'],
    ['Q31', 'p', 39, 3, 7, 2, 'Deep', 'r2'],
    ['Q26', 'n', null],
    ['Q20', 'p', 45, 3, 9, 3, 'Deep', 'b1'],
    ['Q14', 'b', 18, 2, 3, 1, 'None', 'r3'],
    ['Q9', 'p', 41, 2, 8, 4, 'Deep', 'b2'],
    ['Q3', 'p', 34, 3, 6, 3, 'Shallow', 'r1'],
  ];
  const chrono = [...matches].reverse();
  // metric: [label, value, min, max, dir ('h' higher better · 'l' lower · 'n' neutral), unit, event avg, spark series]
  const groups = [
    ['Overall', [
      ['Average points', 38.4, 6, 52, 'h', '', 27.1, [34, 41, 18, 45, 39, 47, 42, 36, 44]],
      ['Median points', 41, 5, 53, 'h', '', 27.5, [34, 38, 34, 38, 39, 40, 41, 40, 41]],
      ['Best match', 47, 12, 66, 'h', '', 39.0, [34, 41, 41, 45, 45, 47, 47, 47, 47]],
      ['Spread (std dev)', 8.6, 0, 0, 'n', '', 7.9, [0, 4, 10, 11, 10, 10, 9, 9, 8.6]],
    ]],
    ['Autonomous', [
      ['Left the start zone', '89%', 0, 100, 'h', '%', 74, [1, 1, 1, 1, 0, 1, 1, 1, 1], 89],
      ['High goal', 2.7, 0, 4.1, 'h', '', 1.6, [3, 2, 2, 3, 3, 4, 2, 2, 3]],
      ['Low goal', 0.8, 0, 2.4, 'h', '', 0.9, [1, 1, 0, 1, 0, 2, 1, 0, 1]],
      ['Auto points', 9.1, 0, 14, 'h', '', 6.2, [9, 8, 7, 10, 9, 12, 8, 7, 9]],
    ]],
    ['Teleop', [
      ['High goal', 7.3, 0.5, 9.8, 'h', '', 4.4, [6, 8, 3, 9, 7, 9, 8, 7, 9]],
      ['Low goal', 3.0, 0, 6.2, 'h', '', 2.8, [3, 4, 1, 3, 2, 4, 5, 3, 2]],
      ['Missed shots', 2.2, 0.4, 6.9, 'l', '', 3.5, [3, 2, 4, 2, 2, 1, 2, 2, 2]],
      ['Played defense', '22%', 0, 0, 'n', '%', 31, [0, 0, 0, 1, 0, 0, 1, 0, 0], 22],
      ['Teleop points', 21.0, 3, 29, 'h', '', 14.3, [19, 23, 8, 25, 21, 25, 24, 19, 24]],
    ]],
    ['Endgame', [
      ['Usual climb', 'Deep', 0, 0, 'n', 'txt', null, null],
      ['Deep climb rate', '67%', 0, 100, 'h', '%', 38, [0, 1, 0, 1, 1, 1, 1, 0, 1], 67],
      ['Endgame points', 8.3, 0, 12, 'h', '', 5.6, [6, 10, 3, 10, 9, 10, 10, 6, 11]],
    ]],
  ];
  const rel = { breakdowns: 1, noShows: 1, disabled: 0, avail: '90%', availNote: '9 of 10' };
  const notes = [
    ['Q55', 'Notes', 'Yael Shapira', '11:52', 'Fast cycles on the high goal, missed once. Deep climb with 12 s left.'],
    ['Q50', 'Notes', 'Dana Mor', '10:31', 'הרובוט נתקע ליד הקיר באמצע הטלאופ וחזר אחרי בערך 10 שניות.'],
    ['Q44', 'Defense notes', 'Noa Levi', '09:40', 'Played defense on 5951 for the last 40 s; drew one foul.'],
    ['Q37', 'Notes', 'Omer Katz', 'Fri 16:05', 'Best match so far. Driver calm, lined up every shot.'],
    ['Q14', 'Notes', 'Dana Mor', 'Fri 11:20', 'Lost a wheel at 1:10 and sat still until the end.'],
  ];

  // ---------- small pieces ----------
  const numv = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : v);
  const pctOf = (m) => (m[5] === '%' ? m[8] : m[1]);
  const t01 = (m) => {
    if (m[4] === 'n' || m[3] === m[2]) return null;
    let t = (pctOf(m) - m[2]) / (m[3] - m[2]);
    t = Math.max(0, Math.min(1, t));
    return m[4] === 'l' ? 1 - t : t;
  };
  // Worst → best shading: a lightness ramp from the accent (THEME open question 4, proposal).
  const shadeBg = (t) => (t == null ? 'var(--line-2)' : `color-mix(in srgb, var(--accent) ${Math.round(6 + t * 46)}%, var(--surface))`);
  const shade = (txt, t) => `<span class="tp-shade num" style="background:${shadeBg(t)}">${txt}</span>`;
  const bar = (m, tick) => {
    if (m[5] === 'txt') return '<span></span>';
    const lo = m[4] === 'n' ? 0 : m[2];
    const hi = m[4] === 'n' ? 100 : m[3];
    const w = Math.max(3, Math.min(100, ((pctOf(m) - lo) / (hi - lo)) * 100));
    const a = tick && m[6] != null ? `<b style="left:calc(${Math.min(100, ((m[6] - lo) / (hi - lo)) * 100)}% - 1px)"></b>` : '';
    return `<div class="tp-bar" role="meter"><i style="width:${w}%;${m[4] === 'n' ? 'background:var(--faint)' : ''}"></i>${a}</div>`;
  };
  const spark = (s, on = true) => {
    if (!s) return '<span></span>';
    const mn = Math.min(...s), mx = Math.max(...s) || 1, w = 64, h = 20;
    const pts = s.map((v, i) => [(i / (s.length - 1)) * (w - 4) + 2, h - 3 - ((v - mn) / (mx - mn || 1)) * (h - 6)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const l = pts[pts.length - 1];
    return `<svg class="tp-spark" viewBox="0 0 ${w} ${h}"><path d="${d}" stroke="${on ? 'var(--accent)' : 'var(--faint)'}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${l[0]}" cy="${l[1]}" r="2.2" fill="var(--accent)" stroke="none"/></svg>`;
  };
  const st = (s) => ({ p: '<span class="st st-p">Played</span>', b: '<span class="st st-b">Broke down</span>', d: '<span class="st st-d">Disabled</span>', n: '<span class="st st-n">No show</span>' })[s];
  const stn = (s) => `<span class="stn ${s[0]}">${s[0] === 'r' ? 'Red' : 'Blue'} ${s[1]}</span>`;
  const NEW = '<span class="new">NEW</span>';

  // ---------- stat rows ----------
  const row = (m, o = {}) => {
    const t = t01(m);
    const v = m[5] === 'txt' ? `<span class="num" style="font-family:var(--font-ui);font-weight:650">${m[1]}</span>` : shade(numv(m[1]), t);
    if (o.wide) {
      const rg = m[4] === 'n' || m[5] === 'txt' ? '' : m[5] === '%' ? '0–100%' : `${numv(m[2])}–${numv(m[3])}`;
      return `<div class="tp-row wide" role="row"><span class="l">${m[0]}</span><span class="v">${v}</span>${bar(m, true)}<span class="rg">${m[6] != null ? `avg ${m[5] === '%' ? m[6] + '%' : numv(m[6])}` : rg}</span></div>`;
    }
    if (o.spark) return `<div class="tp-row spk" role="row"><span class="l">${m[0]}</span><span class="v">${v}</span>${bar(m)}${spark(m[7])}</div>`;
    return `<div class="tp-row" role="row"><span class="l">${m[0]}</span><span class="v">${v}</span>${bar(m)}</div>`;
  };
  const head = (g, o = {}) => {
    const cols = o.wide ? '<span class="rg">event</span>' : o.spark ? '<span class="rg">by match</span>' : '';
    return `<div class="tp-row head ${o.wide ? 'wide' : o.spark ? 'spk' : ''}"><span>${g}</span><span class="v">${o.first ? 'value' : ''}</span><span>${o.first && !o.spark ? 'worst → best' : ''}</span>${o.first ? cols : o.wide || o.spark ? '<span></span>' : ''}</div>`;
  };
  const statRows = (o = {}) =>
    `<div class="tp-rows" role="table" aria-label="All metrics">${groups
      .filter((g) => !o.only || o.only.includes(g[0]))
      .map((g, i) => head(g[0], { ...o, first: i === 0 }) + g[1].map((m) => row(m, o)).join(''))
      .join('')}</div>`;

  // ---------- reliability ----------
  const relGrid = (cls = '') => `<div class="tp-rel ${cls}" role="group" aria-label="Reliability">
    <div><small>Availability</small><b>${rel.avail}</b><div class="tp-empty-cap">${rel.availNote}</div></div>
    <div><small>Breakdowns</small><b class="w">${rel.breakdowns}</b><div class="tp-empty-cap">Q14</div></div>
    <div><small>No-shows</small><b class="w">${rel.noShows}</b><div class="tp-empty-cap">Q26</div></div>
    <div><small>Disabled</small><b>${rel.disabled}</b><div class="tp-empty-cap">&nbsp;</div></div></div>`;
  const relLine = () => `<div class="tp-relline" role="group" aria-label="Reliability">Available <b>${rel.avail}</b><span class="sep">·</span>Breakdowns <b>${rel.breakdowns}</b><span class="sep">·</span>No-shows <b>${rel.noShows}</b><span class="sep">·</span>Disabled <b>${rel.disabled}</b></div>`;

  // ---------- header ----------
  const rankTag = (big) =>
    big ? `<span class="tp-rank big" aria-label="rank ${team.rank}"><span class="num">#${team.rank}</span><small>of ${team.of}</small></span>` : `<span class="tp-rank" aria-label="rank ${team.rank}">Rank <span class="num">#${team.rank}</span>/<span class="num">${team.of}</span></span>`;
  const nextChip = () => `<span class="tp-next">${svg('cal').replace('<svg', '<svg style="width:13px;height:13px"')}Next: <span class="num">Q61</span> · Blue 2</span>${NEW}`;
  const header = (o = {}) => {
    if (o.compact)
      return `<header class="tp-head compact" role="banner"><span class="tp-back">${svg('back')}</span><span class="tn">${team.n}</span><span class="nm">${team.name}</span><span class="sp"></span><span class="hl"><b class="num">${team.avg}</b></span>${rankTag()}</header>`;
    if (o.desk)
      return `<header class="tp-head dk" role="banner"><span class="tn">${team.n}</span><div><div class="nm">${team.name}</div><div class="sub">${team.event} · ${team.entries} entries · last seen Q55</div>${o.next ? `<div style="margin-top:8px">${nextChip()}</div>` : ''}</div><span class="sp"></span>${o.extra || ''}<div class="hl"><small>Average points</small><b class="num">${team.avg}</b></div>${rankTag(true)}</header>`;
    return `<header class="tp-head" role="banner"><span class="tp-back">${svg('back')}</span><div style="min-width:0"><div style="display:flex;align-items:baseline;gap:8px"><span class="tn">${team.n}</span><span class="nm">${team.name}</span></div><div class="sub">${o.sub || `${team.entries} entries · ${rankTag().replace('tp-rank', 'tp-rank" style="height:20px;padding:0 6px;font-size:11.5px')}`}</div>${o.next ? `<div style="margin-top:6px">${nextChip()}</div>` : ''}</div><span class="sp"></span><div class="hl"><small>Avg points</small><b class="num">${team.avg}</b></div></header>`;
  };
  const tabs = (list, on, cls = '') => `<div class="tp-tabs ${cls}" role="tablist">${list.map(([l, c]) => `<span class="${l === on ? 'on' : ''}" role="tab">${l}${c != null ? `<span class="c">${c}</span>` : ''}</span>`).join('')}</div>`;

  // ---------- match table / cards ----------
  const matchTable = (o = {}) => `<div class="tp-tbl"><table aria-label="Match by match"><thead><tr><th>Match</th>${o.station ? '<th>Station</th>' : ''}<th>Robot</th><th class="r"><span class="sa">Points ↓</span></th><th class="r">Auto high</th><th class="r">Teleop high</th><th class="r">Teleop low</th><th>Climb</th>${o.scouter ? '<th>Scouter</th>' : ''}<th></th></tr></thead><tbody>${matches
    .slice(0, o.rows || 10)
    .map((r, i) => {
      if (r[1] === 'n') return `<tr><td class="m">${r[0]}</td>${o.station ? '<td>—</td>' : ''}<td>${st('n')}</td><td class="n tp-dash">—</td><td class="n tp-dash">—</td><td class="n tp-dash">—</td><td class="n tp-dash">—</td><td class="tp-dash">—</td>${o.scouter ? '<td>Yael S.</td>' : ''}<td class="go">${svg('chev')}</td></tr>`;
      const sh = (v, lo, hi) => shade(v, (v - lo) / (hi - lo));
      return `<tr class="${o.hover === i ? 'hov' : ''}"><td class="m">${r[0]}</td>${o.station ? `<td>${stn(r[7])}</td>` : ''}<td>${st(r[1])}</td><td class="n">${o.shade ? sh(r[2], 6, 52) : r[2]}</td><td class="n">${o.shade ? sh(r[3], 0, 4) : r[3]}</td><td class="n">${o.shade ? sh(r[4], 0, 10) : r[4]}</td><td class="n">${o.shade ? sh(r[5], 0, 6) : r[5]}</td><td>${r[6]}</td>${o.scouter ? `<td>${['Yael S.', 'Dana M.', 'Noa L.', 'Omer K.'][i % 4]}</td>` : ''}<td class="go">${svg('chev')}</td></tr>`;
    })
    .join('')}</tbody></table></div>`;
  const matchCards = (n = 10) =>
    `<div role="table" aria-label="Match by match">${matches
      .slice(0, n)
      .map((r) =>
        r[1] === 'n'
          ? `<div class="tp-mc" role="row"><span class="m">${r[0]}</span><div class="mid">${st('n')}<div class="cols">No field values — not counted</div></div><div class="pts tp-dash">—<small>pts</small></div><span class="chev">${svg('chev')}</span></div>`
          : `<div class="tp-mc" role="row"><span class="m">${r[0]}</span><div class="mid">${st(r[1])} ${stn(r[7])}<div class="cols">Auto <span class="num">${r[3]}</span> · High <span class="num">${r[4]}</span> · Low <span class="num">${r[5]}</span> · ${r[6]}</div></div><div class="pts">${r[2]}<small>pts</small></div><span class="chev">${svg('chev')}</span></div>`,
      )
      .join('')}</div>`;

  // ---------- progression chart ----------
  const chart = (o = {}) => {
    const W = o.w || 340, H = o.h || 150, L = 28, R = 10, T = 12, B = 22;
    const ys = o.series || chrono.map((r) => r[2]);
    const max = o.max || 55;
    const x = (i) => L + (i / (chrono.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - v / max) * (H - T - B);
    let g = '';
    for (const v of o.ticks || [0, 25, 50]) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
    chrono.forEach((r, i) => (g += `<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${r[0].slice(1)}</text>`));
    const avg = o.avg ?? team.avg;
    g += `<line class="avg" x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}"/>`;
    let d = '';
    let pen = false;
    ys.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    // bridge the gap across an excluded match with a faint dashed line
    const gi = ys.findIndex((v) => v == null);
    if (gi > 0) g += `<path d="M${x(gi - 1)} ${y(ys[gi - 1])} L${x(gi + 1)} ${y(ys[gi + 1])}" stroke="var(--faint)" stroke-width="1.2" stroke-dasharray="2 3"/><text class="miss" x="${x(gi)}" y="${y(ys[gi - 1]) - 8}" text-anchor="middle">—</text>`;
    g += `<path class="ln" d="${d}"/>`;
    ys.forEach((v, i) => {
      if (v == null) return;
      g += chrono[i][1] === 'b' ? `<rect class="ptb" x="${x(i) - 4}" y="${y(v) - 4}" width="8" height="8" transform="rotate(45 ${x(i)} ${y(v)})"/>` : `<circle class="pt" cx="${x(i)}" cy="${y(v)}" r="3"/>`;
    });
    return `<svg class="tp-chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
  };
  const legend = () => `<div class="tp-legend"><span><i></i>points per match</span><span><i class="d"></i>team average</span><span><i class="b"></i>broke down</span><span>— no show (not counted)</span></div>`;
  const metricSel = (l = 'Points per match') => `<span class="tp-sel">${l}${svg('down')}</span>`;

  // ---------- notes ----------
  const note = (n, q) => `<div class="tp-note ${q ? 'q' : ''}" role="listitem" aria-label="note"><div class="meta"><span class="num">${n[0]}</span><span class="fl">${n[1]}</span><span>· ${n[2]}</span><span class="sp"></span><span class="num">${n[3]}</span></div><p dir="auto">${n[4]}</p></div>`;
  const notesList = (k = 5, q) => `<div role="list" ${q ? 'style="display:flex;flex-direction:column;gap:12px"' : ''}>${notes.slice(0, k).map((n) => note(n, q)).join('')}</div>`;

  // ---------- phone frame ----------
  const bbar = () => {
    const t = (k, l, badge = '') => `<span><span class="ic">${svg(k)}</span>${l}${badge}</span>`;
    return `<div class="bb dark">${t('home', 'Home')}${t('scout', 'Scout')}${t('search', 'Search')}${t('entries', 'Entries', '<span class="badge2">3</span>')}</div>`;
  };
  const phone = (inner, o = {}) =>
    `<div class="phone"><div class="scr"><div class="sb2 dark"><span>${o.time || '12:04'}</span><span style="font-size:11px">● ● ●</span></div><div class="tb2 dark"><span class="ib">${svg('menu')}</span><img src="${mark}" alt=""><b>${o.title || 'Team 1690'}</b><span class="syn"><span class="dot2"></span>3 waiting</span></div><div class="tp-pb">${inner}</div>${o.bar ?? bbar()}</div></div>`;
  const fig = (h, c) => `<figure class="frame">${h}<figcaption>${c}</figcaption></figure>`;
  const desk = (inner) => `<div class="desk"><div data-desk-shell="none" data-crumb="Search / <b>1690 Orbit</b>">${inner}</div></div>`;

  // After shell.js: add the planned Search item (task 1.51) to the sidebar and mark it current.
  const fixDesk = () =>
    document.querySelectorAll('.side .navg').forEach((g) => {
      const a = [...g.querySelectorAll('a')];
      const scout = a.find((x) => x.textContent.trim() === 'Scout');
      if (scout) scout.insertAdjacentHTML('afterend', `<a class="on">${svg('search')}Search</a>`);
    });

  return { svg, NEW, team, matches, groups, rel, notes, statRows, row, relGrid, relLine, header, tabs, matchTable, matchCards, chart, legend, metricSel, notesList, note, phone, fig, desk, fixDesk, spark, shade, shadeBg };
})();
