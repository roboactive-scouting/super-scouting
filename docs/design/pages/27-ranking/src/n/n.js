// Round 27, fourth draw, variant N "Score beside presence" (from L). Builds the five frames
// from the mock data before shell.js wraps them.
(() => {
  // rank, team, name, total, auto, teleop, endgame, sd, breakdowns, no-shows, disabled, availability, matches
  const RAW = [
    [1, 1690, 'Orbit', 92.4, 18.5, 53.6, 20.3, 6.1, 0, 0, 0, 100, 10],
    [2, 5951, 'Makers Assemble', 88.0, 12.3, 52.8, 22.9, 11.8, 1, 0, 0, 100, 10],
    [3, 1574, 'MisCar', 84.7, 20.3, 50.8, 13.6, 9.3, 0, 0, 1, 90, 9],
    [4, 3339, 'BumbleB', 81.2, 8.1, 48.7, 24.4, 22.4, 3, 0, 0, 100, 10],
    [5, 2231, 'OnyxTronix', 78.9, 17.4, 47.3, 14.2, 7.0, 0, 1, 0, 90, 9],
    [6, 4590, 'GreenBlitz', 76.5, 13.8, 53.5, 9.2, 8.4, 1, 0, 0, 100, 10],
    [7, 2096, 'RoboActive', 74.1, 18.5, 40.8, 14.8, 10.2, 1, 0, 0, 100, 10],
    [8, 1937, 'Elysium', 71.8, 8.6, 43.1, 20.1, 5.5, 0, 0, 0, 100, 10],
    [9, 3075, 'Ha-Dream Team', 69.3, 13.9, 48.5, 6.9, 14.9, 2, 0, 1, 90, 9],
    [10, 5135, 'Black Unicorns', 66.0, 5.3, 42.9, 17.8, 8.8, 0, 0, 0, 100, 10],
    [11, 4338, 'Falcons', 63.4, 13.3, 38.1, 12.0, 12.1, 1, 1, 0, 90, 9],
    [12, 2630, 'Thunderbolts', 61.7, 9.9, 42.5, 9.3, 6.6, 0, 0, 0, 100, 10],
    [13, 6741, 'Ninjas', 58.2, 15.1, 38.4, 4.7, 18.0, 2, 0, 0, 100, 10],
    [14, 3083, 'Artemis', 55.9, 6.1, 36.4, 13.4, 9.9, 0, 2, 1, 70, 7],
    [15, 1943, 'NeatTeam', 53.1, 10.1, 32.4, 10.6, 7.7, 0, 0, 0, 100, 10],
    [16, 7067, 'Team Spice', 50.4, 7.6, 36.2, 6.6, 13.5, 1, 0, 0, 100, 10],
    [17, 4744, 'Galaxia', 47.8, 11.0, 28.7, 8.1, 8.1, 0, 0, 0, 100, 10],
    [18, 3316, 'D-Bug', 45.0, 4.0, 28.0, 13.0, 16.7, 3, 0, 0, 100, 10],
    [19, 5654, 'Phoenix', 42.6, 7.2, 30.7, 4.7, 6.9, 0, 1, 0, 90, 9],
    [20, 6738, 'Excalibur', 39.9, 8.0, 23.5, 8.4, 10.4, 1, 0, 2, 80, 8],
    [21, 8175, 'Piece of Mind', 35.2, 4.6, 25.7, 4.9, 7.2, 0, 0, 0, 100, 10],
    [22, 8223, 'Mariners', 31.0, 5.6, 23.5, 1.9, 12.8, 2, 3, 0, 70, 7],
    [23, 7039, 'Sirius', 24.5, 5.4, 16.2, 2.9, 9.6, 1, 0, 0, 100, 10],
    [null, 9738, 'Ionic Bond', null, null, null, null, null, 0, 0, 0, null, 0],
  ];
  const K = ['rank', 'num', 'name', 'total', 'auto', 'tele', 'end', 'sd', 'bd', 'ns', 'dis', 'av', 'm'];
  const teams = RAW.map((r) => Object.fromEntries(K.map((k, i) => [k, r[i]])));
  teams.forEach((t) => {
    t.pl = t.m - t.bd; // played with no problem
    if (!t.m) ['bd', 'ns', 'dis', 'pl'].forEach((k) => (t[k] = null)); // no data is "—"
  });
  const scored = teams.filter((t) => t.m > 0);
  // Fills a frame only when the page has it (the variant has all five, each final a few).
  const put = (id, h) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = h;
  };
  const OUR = 2096;
  const SEL = 3339;

  // ---- the sort: one figure or several, each with its own direction ----
  const LABEL = { total: 'Total', auto: 'Auto', tele: 'Teleop', end: 'Endgame', av: 'Availability', bd: 'Breakdowns', ns: 'No-shows', dis: 'Disabled' };
  const COUNT = ['bd', 'ns', 'dis'];
  const dirWord = (k, best) => (COUNT.includes(k) ? (best ? 'fewest first' : 'most first') : best ? 'best first' : 'worst first');
  const SORT_S = [['total', true]];
  const SORT_A = [['av', true], ['bd', true]];
  const sentence = (sort) =>
    sort.map(([k, best], i) => `${i ? '<span class="n-then">· then</span> ' : ''}<b>${LABEL[k]}</b>, ${dirWord(k, best)}`).join(' ');
  const sorted = (sort) =>
    [...teams].sort((a, b) => {
      if (!a.m !== !b.m) return a.m ? -1 : 1; // no data sorts last, whatever the sort
      for (const [k, best] of sort) {
        const hiGood = !COUNT.includes(k);
        const d = (b[k] - a[k]) * (hiGood === best ? 1 : -1);
        if (d) return d;
      }
      return (a.rank ?? 99) - (b.rank ?? 99); // still tied: by rank
    });

  // ---- value shading: accent lightness, X from 6 (worst) to 52 (best) ----
  const range = (k) => {
    if (k === 'av') return [0, 100];
    const v = scored.map((t) => t[k]);
    return [Math.min(...v), Math.max(...v)];
  };
  const shade = (k, v) => {
    if (v == null) return null;
    const [lo, hi] = range(k);
    if (hi === lo) return 'var(--line-2)';
    let t = (v - lo) / (hi - lo);
    if (COUNT.includes(k)) t = 1 - t;
    return `color-mix(in srgb, var(--accent) ${(6 + 46 * t).toFixed(1)}%, var(--surface))`;
  };
  const f1 = (v) => (v == null ? '—' : v.toFixed(1));
  const pct = (v) => (v == null ? '—' : `${v}&nbsp;%`);
  const pill = (k, v, txt) => {
    const bg = shade(k, v);
    return bg
      ? `<span class="n-pill num" style="background:${bg}">${txt}</span>`
      : `<span class="n-pill n-none num">—</span>`;
  };

  const medal = (r) =>
    r && r <= 3
      ? `<svg class="n-medal" viewBox="0 0 24 24" aria-label="Medal, rank ${r}"><polygon points="6,1 10.5,1 13,8 8.5,8" fill="var(--muted)"/><polygon points="18,1 13.5,1 11,8 15.5,8" fill="var(--ink-2)"/><circle cx="12" cy="15" r="7.5" fill="var(--ink)"/><text x="12" y="18.6" text-anchor="middle" font-size="10" font-weight="700" fill="var(--surface)" font-family="JetBrains Mono, monospace">${r}</text></svg>`
      : `<span class="n-rk num">${r ?? '—'}</span>`;

  const MAX = Math.max(...scored.map((t) => t.total));
  const bar = (t, w) =>
    t.total == null
      ? `<span class="n-nobar">No counted matches yet</span>`
      : `<span class="n-bar">${[
          ['a', t.auto],
          ['t', t.tele],
          ['e', t.end],
        ]
          .map(([c, v]) => `<i class="n-s${c}" style="width:${((v / MAX) * w).toFixed(1)}px"></i>`)
          .join('')}</span>`;
  const ours = (t) => (t.num === OUR ? `<span class="n-us">Us</span>` : '');

  // ---- robot status: the app's words and shapes ----
  const SH = { pl: 'n-sh-p', bd: 'n-sh-b', dis: 'n-sh-d', ns: 'n-sh-n' };
  const WORD = { pl: 'Played', bd: 'Broke down', dis: 'Disabled', ns: 'No show' };
  const shp = (k) => `<span class="n-shp ${SH[k]}"></span>`;

  // Scoring view: availability as the % plus one mark per problem match. A clean team shows the % alone.
  const avMark = (t) => {
    if (!t.m) return `<span class="n-avm"><span class="n-marks"></span><span class="n-avp n-muted num">—</span></span>`;
    const marks = [...Array(t.bd).fill('bd'), ...Array(t.dis).fill('dis'), ...Array(t.ns).fill('ns')].map(shp).join('');
    return `<span class="n-avm"><span class="n-marks">${marks}</span><span class="n-avp num${t.av < 100 ? ' n-low' : ''}">${pct(t.av)}</span></span>`;
  };

  // Availability view: the status spread on one axis. On the field (Played, Broke down) to the
  // left of the line, missed (Disabled, No show) to the right. Counts printed in every block.
  const RIGHT = 3; // most missed matches of any team
  const spread = (t, u, cls = '') => {
    if (!t.m) return `<span class="n-spr-none">No counted matches yet</span>`;
    const blk = (k) =>
      t[k] ? `<span class="n-blk n-b-${k}" style="width:${t[k] * u - 2}px">${shp(k)}<b class="num">${t[k]}</b></span>` : '';
    return `<span class="n-spr ${cls}" style="grid-template-columns:${10 * u}px 2px ${RIGHT * u}px">
      <span class="n-spr-l">${blk('pl')}${blk('bd')}</span><span class="n-axis"></span><span class="n-spr-r">${blk('dis')}${blk('ns')}</span></span>`;
  };
  const spreadHead = (u, small) => `<span class="n-spr n-spr-h" style="grid-template-columns:${10 * u}px 2px ${RIGHT * u}px">
      <span class="n-spr-l">${small ? 'On the field' : 'On the field · Played + Broke down'}</span><span class="n-axis"></span><span class="n-spr-r">Missed</span></span>`;
  const statusLegend = () =>
    ['pl', 'bd', 'dis', 'ns'].map((k) => `<span class="n-leg2">${shp(k)}${WORD[k]}</span>`).join('');

  // ---- icons ----
  const ic = (d, c = '') => `<svg class="n-ic ${c}" viewBox="0 0 24 24"><path d="${d}"/></svg>`;
  const caret = ic('M6 9l6 6 6-6', 'n-caret');
  const sortIc = ic('M7 4v16M3 16l4 4 4-4M14 6h7M14 12h5M14 18h3');
  const grip = '<svg class="n-grip" viewBox="0 0 10 16"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>';
  const xIc = ic('M6 6l12 12M18 6 6 18');
  const sortGlyph = '<svg class="n-sg" viewBox="0 0 10 14"><path d="M5 1 9 5H1zM5 13 1 9h8z"/></svg>';
  const ordBadge = (sort, k) => {
    const i = sort.findIndex(([f]) => f === k);
    return i < 0 ? sortGlyph : `<span class="n-ord num">${i + 1}</span>`;
  };
  const legend = () =>
    `<span class="n-leg"><i class="n-sa"></i>Auto</span><span class="n-leg"><i class="n-st"></i>Teleop</span><span class="n-leg"><i class="n-se"></i>Endgame</span>`;

  const head = () => `
    <div class="n-head">
      <div>
        <h1>Ranking</h1>
        <p><b>ISR District Event #3</b> · Qualifications <span class="num">Q1–Q40</span> · <span class="num">24</span> teams · averages leave out no-show and disabled matches</p>
      </div>
      <div class="n-src"><span class="dot"></span>From the server · as of <b class="num">11:40</b></div>
    </div>`;
  const tools = (cat, sort, open, pop = '') => `
    <div class="n-tools">
      <div class="n-seg" role="tablist" aria-label="Category">
        <span class="n-segb${cat === 's' ? ' on' : ''}" role="tab"><b>Scoring</b><small>Total · Auto · Teleop · Endgame · Consistency</small></span>
        <span class="n-segb${cat === 'a' ? ' on' : ''}" role="tab"><b>Availability</b><small>Availability · Breakdowns · No-shows · Disabled</small></span>
      </div>
      <span class="sp"></span>
      <span class="n-lab">Sorted by</span>
      <span class="n-sortbtn${open ? ' open' : ''}">${sortIc}<span>${sentence(sort)}</span>${caret}</span>
      ${pop}
    </div>`;

  // ================= DESKTOP 1 · Scoring =================
  const drow1 = (t) => `<tr class="${t.num === SEL ? 'n-sel' : ''}">
      <td class="n-c-rk">${medal(t.rank)}</td>
      <td class="n-c-team"><b class="num">${t.num}</b> ${t.name}${ours(t)}</td>
      <td class="n-c-bar">${bar(t, 80)}</td>
      <td class="n-r">${pill('total', t.total, f1(t.total))}</td>
      <td class="n-r n-v num">${f1(t.auto)}</td>
      <td class="n-r n-v num">${f1(t.tele)}</td>
      <td class="n-r n-v num">${f1(t.end)}</td>
      <td class="n-r n-sd num">${t.sd == null ? '—' : '±' + t.sd.toFixed(1)}</td>
      <td class="n-c-av">${avMark(t)}</td>
      <td class="n-r n-m num">${t.m || '—'}</td>
    </tr>`;

  const s = teams.find((t) => t.num === SEL);
  const place = (k) => scored.filter((t) => t[k] > s[k]).length + 1;
  const ord = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const phaseRow = (c, label, k, share) => {
    const p = place(k);
    return `<tr><td><i class="n-s${c} n-sw"></i>${label}</td><td class="n-r num">${s[k].toFixed(1)}</td>${share ? `<td class="n-r num">${Math.round((s[k] / s.total) * 100)} %</td>` : ''}<td class="n-r">${p === 1 ? '<span class="n-best">1st · best</span>' : `<span class="num">${ord(p)}</span>`}</td></tr>`;
  };
  const lo = s.total - s.sd;
  const hi = s.total + s.sd;
  const AX = 120;
  const ppos = (v) => `${((Math.min(v, AX) / AX) * 100).toFixed(1)}%`;

  // the record of one team: shared by the desktop study panel and the phone summary
  const scoringSec = (share, newTags) => `
    <section class="n-sec">
      <h3>Where the points come from <span class="n-cat">Scoring</span></h3>
      <div class="n-big"><b class="num">${s.total.toFixed(1)}</b><span>average points per match</span></div>
      <span class="n-bar n-bar-lg">${[
        ['a', s.auto],
        ['t', s.tele],
        ['e', s.end],
      ]
        .map(([c, v]) => `<i class="n-s${c}" style="width:${((v / s.total) * 100).toFixed(2)}%"></i>`)
        .join('')}</span>
      <table class="n-pt-t">
        <thead><tr><th>Phase</th><th class="n-r">Avg</th>${share ? `<th class="n-r">Share${newTags ? '<span class="new">NEW</span>' : ''}</th>` : ''}<th class="n-r">Place${newTags ? '<span class="new">NEW</span>' : ''}</th></tr></thead>
        <tbody>
          ${phaseRow('a', 'Auto', 'auto', share)}
          ${phaseRow('t', 'Teleop', 'tele', share)}
          ${phaseRow('e', 'Endgame', 'end', share)}
        </tbody>
      </table>
      <div class="n-cons">
        <div class="n-cons-h"><span>Consistency</span><b class="num">±${s.sd.toFixed(1)}</b></div>
        <div class="n-strip" aria-label="Typical range">
          <span class="n-band" style="left:${ppos(lo)};width:calc(${ppos(hi)} - ${ppos(lo)})"></span>
          <span class="n-mean" style="left:${ppos(s.total)}"></span>
          <span class="n-tk num" style="left:0">0</span><span class="n-tk num" style="left:${ppos(lo)}">${Math.round(lo)}</span><span class="n-tk num" style="left:${ppos(hi)}">${Math.round(hi)}</span><span class="n-tk num" style="left:100%">120</span>
        </div>
        <p class="n-note">Typical match: <b class="num">${Math.round(lo)}–${Math.round(hi)}</b> points (Total ± spread)${newTags ? '<span class="new">NEW</span>' : ''}</p>
      </div>
    </section>`;
  const availSec = (u) => `
    <section class="n-sec">
      <h3>How dependable <span class="n-cat">Availability</span></h3>
      <div class="n-big"><b class="num">${s.av}&nbsp;%</b><span>available · on the field in <span class="num">${s.m}</span> of <span class="num">${s.m + s.ns + s.dis}</span></span></div>
      ${spreadHead(u, true)}
      ${spread(s, u, 'n-spr-lg')}
      <div class="n-tally">${['pl', 'bd', 'dis', 'ns'].map((k) => `<span>${shp(k)}${WORD[k]}<b class="num">${s[k]}</b></span>`).join('')}</div>
      <p class="n-note">A breakdown counts as available: the robot was on the field. Only scouted matches count.</p>
    </section>`;

  const panel = `<aside class="n-panel">
    <div class="n-ph">
      <div>
        <div class="n-kick">Team study<span class="new">NEW</span></div>
        <div class="n-pt"><b class="num">${s.num}</b> ${s.name}</div>
        <div class="n-psub">Rank <b class="num">${s.rank}</b> of 23 · <span class="num">${s.m}</span> matches counted</div>
        <div class="n-psub"><span class="n-link">Open team page →</span><span class="new">NEW</span></div>
      </div>
      <span class="n-x" aria-label="Close">${xIc}</span>
    </div>
    ${scoringSec(true, true)}
    ${availSec(24)}
  </aside>`;

  put('n-desk1', `
    ${head()}
    ${tools('s', SORT_S, false)}
    <div class="n-body">
      <div class="n-card">
        <table class="n-t n-t1">
          <colgroup><col style="width:44px"><col style="width:160px"><col style="width:96px"><col style="width:64px"><col style="width:50px"><col style="width:60px"><col style="width:74px"><col style="width:80px"><col style="width:96px"><col></colgroup>
          <thead>
            <tr class="n-grp"><th colspan="2"></th><th colspan="6"><span class="n-gl"><span>Average points per match</span><span class="n-legs">${legend()}</span></span></th><th colspan="2"><span class="n-gl"><span>Availability</span></span></th></tr>
            <tr class="n-cols">
              <th>Rank</th><th>Team</th>
              <th class="n-h-bar">By phase<span class="new">NEW</span></th>
              <th class="n-r n-on">Total${ordBadge(SORT_S, 'total')}</th>
              <th class="n-r">Auto${sortGlyph}</th>
              <th class="n-r">Teleop${sortGlyph}</th>
              <th class="n-r">Endgame${sortGlyph}</th>
              <th class="n-r n-nosort">Consistency</th>
              <th class="n-r n-c-av">Availability</th>
              <th class="n-r">Matches</th>
            </tr>
          </thead>
          <tbody>${sorted(SORT_S).map(drow1).join('')}</tbody>
        </table>
      </div>
      ${panel}
    </div>`);

  // ================= DESKTOP 2 · Availability, sort builder open =================
  const U = 26;
  const drow2 = (t) => `<tr>
      <td class="n-c-rk">${medal(t.rank)}</td>
      <td class="n-c-team"><b class="num">${t.num}</b> ${t.name}${ours(t)}</td>
      <td class="n-c-spr">${spread(t, U)}</td>
      <td class="n-r">${pill('av', t.av, pct(t.av))}</td>
      <td class="n-r">${pill('bd', t.bd, t.bd ?? '—')}</td>
      <td class="n-r n-v num">${t.ns ?? '—'}</td>
      <td class="n-r n-v num">${t.dis ?? '—'}</td>
      <td class="n-r n-m num">${t.m || '—'}</td>
    </tr>`;

  const dirSeg = (k, best) =>
    `<span class="n-dseg"><span class="${best ? 'on' : ''}">${dirWord(k, true).replace(' first', '')}<small>first</small></span><span class="${best ? '' : 'on'}">${dirWord(k, false).replace(' first', '')}<small>first</small></span></span>`;
  const popRow = ([k, best], i) => `<div class="n-pop-row">
      ${grip}
      <span class="n-pop-n">${i ? 'then' : 'By'}</span>
      <span class="n-pop-f"><span class="n-ord num">${i + 1}</span>${LABEL[k]}</span>
      ${dirSeg(k, best)}
      <span class="n-pop-x" aria-label="Remove">${xIc}</span>
    </div>`;
  const pop = `<div class="n-pop" role="dialog" aria-label="Sort Availability">
      <div class="n-pop-h"><b>Sort Availability by</b><span>The first figure orders the list; each next one settles ties in the one above.</span></div>
      ${SORT_A.map(popRow).join('')}
      <div class="n-pop-add"><span>Add a tie-breaker</span><span class="n-chip">+ No-shows</span><span class="n-chip">+ Disabled</span></div>
      <div class="n-pop-f2">Still tied after every figure: by rank. Rank is always the place by Total.</div>
    </div>`;

  put('n-desk2', `
    ${head()}
    ${tools('a', SORT_A, true, pop)}
    <div class="n-body n-body-full">
      <div class="n-card">
        <table class="n-t n-t2">
          <colgroup><col style="width:52px"><col style="width:180px"><col style="width:420px"><col style="width:100px"><col style="width:124px"><col style="width:104px"><col style="width:96px"><col></colgroup>
          <thead>
            <tr class="n-grp"><th colspan="2"></th><th><span class="n-gl"><span>Scouted matches by status</span><span class="n-legs">${statusLegend()}</span></span></th><th colspan="4"><span class="n-gl"><span>Availability · counts of matches</span></span></th><th></th></tr>
            <tr class="n-cols">
              <th>Rank</th><th>Team</th>
              <th class="n-c-spr">${spreadHead(U)}</th>
              <th class="n-r n-on">Availability${ordBadge(SORT_A, 'av')}</th>
              <th class="n-r n-on">${shp('bd')}Breakdowns${ordBadge(SORT_A, 'bd')}</th>
              <th class="n-r">${shp('ns')}No-shows${sortGlyph}</th>
              <th class="n-r">${shp('dis')}Disabled${sortGlyph}</th>
              <th class="n-r">Matches</th>
            </tr>
          </thead>
          <tbody>${sorted(SORT_A).map(drow2).join('')}</tbody>
        </table>
      </div>
    </div>`);

  // ================= PHONES =================
  const psort = (sort) => `<span class="n-psort">${sortIc}<span class="n-psort-t"><small>Sorted by</small><span>${sentence(sort)}</span></span>${caret}</span>`;
  const pseg = (cat) => `<div class="n-pseg"><span class="${cat === 's' ? 'on' : ''}">Scoring</span><span class="${cat === 'a' ? 'on' : ''}">Availability</span></div>`;

  const prow1 = (t) => `<div class="n-row n-row1${t.num === SEL ? ' n-tapped' : ''}">
      <span class="n-prk">${medal(t.rank)}</span>
      <span class="n-pteam"><span class="n-pn"><b class="num">${t.num}</b> ${t.name}${ours(t)}</span>
        <span class="n-pline"><span class="n-pbar">${bar(t, 104)}</span>${avMark(t)}</span></span>
      <span class="n-pv">${pill('total', t.total, f1(t.total))}<small class="num">${t.sd == null ? '—' : '±' + t.sd.toFixed(1)}</small></span>
    </div>`;
  const PU = 21;
  const prow2 = (t) => `<div class="n-row n-row2">
      <span class="n-prk">${medal(t.rank)}</span>
      <span class="n-pn"><b class="num">${t.num}</b> ${t.name}${ours(t)}</span>
      <span class="n-pv">${pill('av', t.av, pct(t.av))}</span>
      <span class="n-p2spr">${spread(t, PU)}</span>
    </div>`;

  const p1list = `
    <div class="n-pev"><b>ISR District Event #3</b><span><span class="num">Q1–Q40</span> · from the server · as of <span class="num">11:40</span></span></div>
    <div class="n-pstick">
      ${pseg('s')}
      ${psort(SORT_S)}
      <div class="n-plab n-plab1"><span>Rank · Team</span><span class="n-plegs">${legend()}</span><span>Total · ±</span></div>
      <div class="n-plab-sub"><span><b>%</b> available</span><span class="n-plab-k"><span class="n-shp n-sh-b"></span>broke down <span class="n-shp n-sh-d"></span>disabled <span class="n-shp n-sh-n"></span>no show</span></div>
    </div>`;

  put('n-p1', `${p1list}
    <div class="n-plist">${sorted(SORT_S).slice(0, 9).map(prow1).join('')}</div>`);

  put('n-p2', `
    <div class="n-pev"><b>ISR District Event #3</b><span><span class="num">Q1–Q40</span></span></div>
    <div class="n-off">
      ${ic('M3 3l18 18M8.5 8.6A5 5 0 0 0 6 18h11M14.5 7.3A5 5 0 0 1 18 11.5a3.5 3.5 0 0 1 2.8 4.7')}
      <div><b>Computed from the data on this device</b><span>Last synced <b class="num">11:08</b> · 3 entries waiting to send</span></div>
    </div>
    <div class="n-pstick">
      ${pseg('a')}
      ${psort(SORT_A)}
      <div class="n-plab n-plab2"><span class="n-plab-k n-plab-k2"><span class="n-shp n-sh-p"></span>played <span class="n-shp n-sh-b"></span>broke down <span class="n-shp n-sh-d"></span>disabled <span class="n-shp n-sh-n"></span>no show</span><span>Availability</span></div>
      <div class="n-plab-spr"><span class="n-plab-rt">Rank · Team</span>${spreadHead(PU, true)}</div>
    </div>
    <div class="n-plist">${sorted(SORT_A).slice(0, 8).map(prow2).join('')}</div>`);

  // Phone 3: the list behind, BumbleB's summary in a bottom sheet
  put('n-p3', `${p1list}
    <div class="n-plist">${sorted(SORT_S).slice(0, 9).map(prow1).join('')}</div>
    <div class="n-scrim"></div>
    <div class="n-sheet" role="dialog" aria-label="BumbleB summary">
      <span class="n-grab"></span>
      <div class="n-sh-h">
        <div>
          <div class="n-pt"><b class="num">${s.num}</b> ${s.name}</div>
          <div class="n-psub">Rank <b class="num">${s.rank}</b> of 23 · <span class="num">${s.m}</span> matches counted</div>
        </div>
        <span class="n-x n-x-lg" aria-label="Close">${xIc}</span>
      </div>
      ${scoringSec(true, true)}
      ${availSec(20)}
      <span class="n-open">Open team page${ic('M5 12h14M13 6l6 6-6 6')}</span>
    </div>`);
})();
