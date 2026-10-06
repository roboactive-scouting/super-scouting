// Shared mock data + SVG builders for the four concept directions.
// Every builder emits plain SVG with class names; each direction styles them in CSS.
window.KIT = (() => {
  const DATA = {
    team: 2096,
    season: '2026',
    event: 'ISR District #3 · Tel Aviv',
    eventShort: 'District #3',
    current: 38,
    total: 72,
    // coverage per qualification match: 6 = all robots scouted
    coverage: Array.from({ length: 72 }, (_, i) => {
      const n = i + 1;
      if (n > 38) return null;
      if ([7, 19, 26].includes(n)) return 5;
      if (n === 31) return 4;
      return 6;
    }),
    topTeams: [
      { team: 1690, name: 'Orbit', epa: 58.4, trend: [44, 47, 52, 55, 58] },
      { team: 1574, name: 'MisCar', epa: 54.9, trend: [49, 50, 53, 52, 55] },
      { team: 2096, name: 'RobActive', epa: 51.2, trend: [38, 42, 47, 49, 51] },
      { team: 3339, name: 'BumbleB', epa: 47.6, trend: [45, 46, 44, 48, 48] },
      { team: 5990, name: 'TRIGON', epa: 45.1, trend: [36, 40, 41, 44, 45] },
      { team: 1937, name: 'Elysium', epa: 42.3, trend: [40, 39, 43, 41, 42] },
      { team: 4590, name: 'GreenBlitz', epa: 40.8, trend: [33, 36, 38, 40, 41] },
      { team: 6738, name: 'Excalibur', epa: 37.5, trend: [35, 34, 36, 38, 37] },
    ],
    upcoming: [
      { match: 39, red: [1690, 3075, 6230], blue: [2231, 5654, 7039], slot: 'Red 1', you: 1690, time: '11:42' },
      { match: 40, red: [4590, 2096, 1943], blue: [5951, 3316, 8175], slot: 'Blue 2', you: 3316, time: '11:49' },
      { match: 41, red: [1574, 6740, 4319], blue: [3339, 2630, 5987], slot: 'Red 3', you: 4319, time: '11:56' },
      { match: 42, red: [1937, 5990, 7067], blue: [6738, 1657, 8223], slot: 'Blue 1', you: 6738, time: '12:03' },
    ],
    recent: [
      { match: 37, team: 5654, status: 'Played', by: 'Noa L.', sync: 'sent', ago: '6 min' },
      { match: 36, team: 1943, status: 'Broke down', by: 'Noa L.', sync: 'sent', ago: '13 min' },
      { match: 35, team: 7039, status: 'Played', by: 'Noa L.', sync: 'waiting', ago: '21 min' },
      { match: 34, team: 2630, status: 'No show', by: 'Noa L.', sync: 'waiting', ago: '28 min' },
    ],
    phaseSplit: { auto: 18, teleop: 64, endgame: 18 },
    statusMix: [
      { k: 'Played', v: 204 },
      { k: 'Broke down', v: 11 },
      { k: 'Disabled', v: 5 },
      { k: 'No show', v: 3 },
    ],
    hourly: [4, 18, 30, 34, 36, 33, 41, 27],
    hours: ['08', '09', '10', '11', '12', '13', '14', '15'],
    seasonEvents: [
      { name: 'District #1 · Haifa', start: 8, len: 3, state: 'done' },
      { name: 'District #2 · Be’er Sheva', start: 22, len: 3, state: 'done' },
      { name: 'District #3 · Tel Aviv', start: 36, len: 3, state: 'live' },
      { name: 'District #4 · Jerusalem', start: 50, len: 3, state: 'next' },
      { name: 'District Championship', start: 71, len: 4, state: 'next' },
    ],
  };

  const svg = (w, h, body, cls = '') =>
    `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

  /** Horizontal bars, label left, value right. */
  function hbars(rows, { w = 520, rowH = 30, labelW = 120, valueW = 48, highlight = null, max = null } = {}) {
    const m = max ?? Math.max(...rows.map((r) => r.v));
    const barW = w - labelW - valueW;
    const h = rows.length * rowH;
    const body = rows
      .map((r, i) => {
        const y = i * rowH;
        const bw = Math.max(2, (r.v / m) * barW);
        const hl = highlight !== null && r.id === highlight ? ' is-hl' : '';
        return `<g class="hbar${hl}">
          <text class="lbl" x="0" y="${y + rowH / 2 + 4}">${r.label}</text>
          <rect class="track" x="${labelW}" y="${y + rowH * 0.28}" width="${barW}" height="${rowH * 0.44}" rx="${rowH * 0.1}"/>
          <rect class="bar" x="${labelW}" y="${y + rowH * 0.28}" width="${bw}" height="${rowH * 0.44}" rx="${rowH * 0.1}"/>
          <text class="val" x="${w}" y="${y + rowH / 2 + 4}" text-anchor="end">${r.text ?? r.v}</text>
        </g>`;
      })
      .join('');
    return svg(w, h, body, 'chart hbars');
  }

  /** Vertical columns with x labels. */
  function columns(values, labels, { w = 520, h = 160, gap = 10, highlight = -1, max = null } = {}) {
    const m = max ?? Math.max(...values);
    const n = values.length;
    const cw = (w - gap * (n - 1)) / n;
    const ch = h - 22;
    const grid = [0.25, 0.5, 0.75, 1]
      .map((f) => `<line class="grid" x1="0" x2="${w}" y1="${ch - ch * f}" y2="${ch - ch * f}"/>`)
      .join('');
    const body = values
      .map((v, i) => {
        const x = i * (cw + gap);
        const bh = (v / m) * (ch - 6);
        return `<g class="col${i === highlight ? ' is-hl' : ''}">
          <rect class="bar" x="${x}" y="${ch - bh}" width="${cw}" height="${bh}" rx="3"/>
          <text class="xl" x="${x + cw / 2}" y="${h - 4}" text-anchor="middle">${labels[i]}</text>
        </g>`;
      })
      .join('');
    return svg(w, h, grid + `<line class="axis" x1="0" x2="${w}" y1="${ch}" y2="${ch}"/>` + body, 'chart columns');
  }

  function sparkline(values, { w = 80, h = 24 } = {}) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><path d="${d}" fill="none"/><circle cx="${last[0]}" cy="${last[1]}" r="2.4"/></svg>`;
  }

  /** Ring progress. */
  function ring(frac, { size = 120, stroke = 12 } = {}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
        stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})" stroke-linecap="round"/>
    </svg>`;
  }

  /** Stacked single bar of segments. */
  function stack(parts, { w = 520, h = 12, gap = 3 } = {}) {
    const total = parts.reduce((s, p) => s + p.v, 0);
    let x = 0;
    const usable = w - gap * (parts.length - 1);
    const body = parts
      .map((p, i) => {
        const pw = (p.v / total) * usable;
        const r = `<rect class="seg seg-${i}" x="${x}" y="0" width="${pw}" height="${h}" rx="${Math.min(3, h / 3)}"/>`;
        x += pw + gap;
        return r;
      })
      .join('');
    return svg(w, h, body, 'chart stack');
  }

  /** Coverage cells for every qualification match. */
  function coverageCells(cols = 24) {
    return DATA.coverage
      .map((c, i) => {
        const n = i + 1;
        let s = 'up';
        if (c === 6) s = 'full';
        else if (c !== null) s = 'gap';
        if (n === DATA.current + 1) s = 'next';
        return `<span class="cell cell-${s}" title="Q${n}">${n}</span>`;
      })
      .join('');
  }

  /** Season timeline: days from Feb 16 (0) to May 10 (83). */
  function seasonTimeline({ w = 900, h = 92, labelW = 190 } = {}) {
    const days = 83;
    const sx = (d) => (d / days) * w;
    const marks = [
      { d: 0, l: 'Feb 16' }, { d: 13, l: 'Mar 1' }, { d: 27, l: 'Mar 15' }, { d: 44, l: 'Apr 1' },
      { d: 58, l: 'Apr 15' }, { d: 74, l: 'May 1' },
    ];
    const base = h - 18;
    const ticks = marks
      .map((m) => `<line class="tick" x1="${sx(m.d)}" x2="${sx(m.d)}" y1="0" y2="${base}"/><text class="xl" x="${sx(m.d) + 4}" y="${h - 4}">${m.l}</text>`)
      .join('');
    const bars = DATA.seasonEvents
      .map((e, i) => {
        const y = 6 + (i % 2) * 34;
        const x = sx(e.start);
        const bw = Math.max(sx(e.len), 10);
        const flip = x + labelW > w;
        const tx = flip ? x + bw : x;
        return `<g class="ev ev-${e.state}"><rect x="${x}" y="${y + 16}" width="${bw}" height="10" rx="3"/>
        <text class="evl" x="${tx}" y="${y + 11}" text-anchor="${flip ? 'end' : 'start'}">${e.name}</text></g>`;
      })
      .join('');
    const today = sx(37);
    return svg(w, h, `<line class="axis" x1="0" x2="${w}" y1="${base}" y2="${base}"/>` + ticks + bars + `<line class="today" x1="${today}" x2="${today}" y1="0" y2="${base}"/>`, 'chart timeline');
  }

  /** Show only the screen named in the hash. */
  function boot() {
    const want = (location.hash || '#home').slice(1);
    document.querySelectorAll('[data-screen]').forEach((s) => {
      s.style.display = s.dataset.screen === want ? '' : 'none';
    });
    document.querySelectorAll('[data-kit]').forEach((el) => {
      el.innerHTML = new Function('K', 'D', `return ${el.dataset.kit}`)(KIT, DATA);
    });
  }

  return { DATA, hbars, columns, sparkline, ring, stack, coverageCells, seasonTimeline, boot };
})();
