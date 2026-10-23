// Team search round (23): /teams (SPEC-FINAL 13.2). Loads after 24-team/src/team.js (TP).
window.TS = (() => {
  const { svg, phone, fig, NEW } = TP;
  const ic = (p, s = 15) => `<svg viewBox="0 0 24 24" style="width:${s}px;height:${s}px">${p}</svg>`;
  const I = {
    medal: ic('<path d="M8 2.5l2.4 6.2M16 2.5l-2.4 6.2"/><circle cx="12" cy="15" r="6"/><path d="M12 12.6v4.8"/>'),
    chev: ic('<path d="M9 5l7 7-7 7"/>'),
    swap: ic('<path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4"/>'),
    clock: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 13),
    off: ic('<path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M3 3l18 18"/>'),
  };
  const EV = 'District #3 · Tel Aviv';
  // [number, name, rank|null, avg|null, entries here, flags]
  const inEv = [
    [1574, 'MisCar', 1, 44.1, 11], [1937, 'Elysium', 2, 42.0, 10], [2096, 'RobActive', 3, 40.2, 11, 'us'], [1690, 'Orbit', 4, 38.4, 10],
    [4590, 'GreenBlitz', 7, 33.0, 9], [3075, 'Ha-Dream', 12, 29.5, 10], [5951, 'MA', 18, 25.2, 10], [5987, 'Galaxia', null, null, 0],
  ];
  // [number, name, events where we hold entries]
  const offEv = [[3065, 'Jatt', [['District #1 · Haifa', 4, 'Mar 2026'], ['District #2 · Be’er Sheva', 6, 'Mar 2026']]], [1576, 'Voltrix', [['District #1 · Haifa', 5, 'Mar 2026']]], [7039, 'Electro', [['District #2 · Be’er Sheva', 3, 'Mar 2026']]]];

  const rank = (r) => (r == null ? '<span class="ts-rank none">not ranked yet</span>' : r <= 3 ? `<span class="ts-rank top" aria-label="rank ${r}">${I.medal}#${r}</span>` : `<span class="ts-rank" aria-label="rank ${r}">#${r}</span>`);
  const go = () => `<span class="ts-go">Team ${I.chev}</span>`;
  const other = (dis) => `<span class="ts-go other" ${dis ? 'disabled' : ''}>${I.swap}Other event</span>`;
  const hi = (s, q) => (q ? String(s).replace(new RegExp(`(${q})`, 'i'), '<span class="ts-hi">$1</span>') : s);

  const rowIn = (t, o = {}) => `<div class="ts-row ${t[5] === 'us' ? 'us' : ''}"><span class="tn">${hi(t[0], o.q)}</span><span class="nm"><b>${hi(t[1], o.q)}${t[5] === 'us' ? ' <span style="font-weight:500;color:var(--accent-ink);font-size:12px">· us</span>' : ''}</b><small>${t[4] ? `${t[4]} entries here${o.avg && t[3] ? ` · avg <span class="num">${t[3]}</span>` : ''}` : 'no entries yet'}</small></span>${rank(t[2])}${o.icon ? `<span class="ts-go icon">${I.chev}</span>` : go()}</div>`;
  const rowOff = (t, o = {}) => `<div class="ts-row off"><span class="tn">${hi(t[0], o.q)}</span><span class="nm"><b>${hi(t[1], o.q)}</b><small>${t[2].map((e) => e[0].split(' · ')[0]).join(', ')} · not at this event</small></span>${other(o.dis)}</div>`;
  const search = (v, o = {}) => `<div class="ts-srch ${o.focus ? 'focus' : ''}">${svg('search')}${v ? `<span>${v}</span><span class="x">✕</span>` : '<span class="ph">Team number or name</span>'}</div>`;
  const chips = (on = 'All') => `<div class="ts-chips">${[['All', 64], ['At this event', 42], ['Other events', 22]].map(([l, c]) => `<span class="fchip ${l === on ? 'on' : ''}">${l}<span class="c">${c}</span></span>`).join('')}</div>`;
  const head = (o = {}) => `<div><div class="ts-h1">Search teams</div><div class="ts-sub">2026 season · 64 teams · ranks from ${EV}</div></div>`;

  // sheet: pick the event, then confirm
  const evPick = (t = offEv[0]) => `<div class="ts-scrim"></div><div class="ts-sheet"><div class="grab"></div><h3><span class="num">${t[0]}</span> ${t[1]} wasn’t at ${EV.split(' · ')[0]}</h3><p>Pick an event we scouted them at.</p>
    ${t[2].map((e, i) => `<div class="ts-ev ${i === 1 ? 'on' : ''}"><span class="rd"></span><span class="t"><b>${e[0]}</b><small>${e[1]} entries · ${e[2]}</small></span></div>`).join('')}
    <div class="ts-btns"><span class="btn">Cancel</span><span class="btn primary">Continue</span></div></div>`;
  const confirmBody = `<p>Switch this session to <b>District #2 · Be’er Sheva</b> and open <b>3065 Jatt</b>?</p><p style="font-size:13px;color:var(--muted)">Only on this device until you go back or sign out. Scouting still saves to ${EV}.</p>`;
  const confirmSheet = () => `<div class="ts-scrim"></div><div class="ts-sheet"><div class="grab"></div><h3>Switch to another event?</h3>${confirmBody}<div class="ts-btns"><span class="btn">Keep District #3</span><span class="btn primary">Switch and open</span></div></div>`;
  const confirmDlg = () => `<div class="ts-scrim"></div><div class="ts-dlg"><h3>Switch to another event?</h3>${confirmBody}<div class="ts-btns"><span class="btn">Keep District #3</span><span class="btn primary">Switch and open</span></div></div>`;

  // frames
  const bar = () => {
    const t = (k, l, b = '') => `<span><span class="ic">${svg(k)}</span>${l}${b}</span>`;
    return `<div class="bb dark">${t('home', 'Home')}${t('scout', 'Scout')}<span class="center on"><span class="fab">${svg('search')}</span><span class="lbl" style="color:#fff">Search</span></span>${t('entries', 'Entries', '<span class="badge2">3</span>')}</div>`;
  };
  const P = (inner, o = {}) => phone(inner, { title: 'Search', time: o.time, bar: bar() }).replace('<span class="dot2"></span>3 waiting', o.offline ? '<span class="dot2 off"></span>Offline' : '<span class="dot2"></span>3 waiting');
  const desk = (inner) => `<div class="desk"><div data-desk-shell="none" data-crumb="<b>Search</b>"><div class="ts-desk-over">${inner}</div></div></div>`;

  // desktop table
  const tbl = (rows, o = {}) => `<div class="tp-tbl ts-tbl"><table><thead><tr><th>Team</th><th>Rank here</th>${o.avg ? `<th class="r">Avg points ${NEW}</th>` : ''}<th class="r">Entries here</th><th>Other events</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const trIn = (t, o = {}) => `<tr class="${t[5] === 'us' ? 'us' : ''}"><td><span class="tn">${t[0]}</span><span class="nm2">${t[1]}</span></td><td>${rank(t[2])}</td>${o.avg ? `<td class="n">${t[3] ?? '<span class="tp-dash">—</span>'}</td>` : ''}<td class="n">${t[4]}</td><td class="evs">—</td><td class="end">${go()}</td></tr>`;
  const trOff = (t, o = {}) => `<tr class="off"><td><span class="tn">${t[0]}</span><span class="nm2">${t[1]}</span></td><td><span class="ts-rank none">not here</span></td>${o.avg ? '<td class="n tp-dash">—</td>' : ''}<td class="n tp-dash">—</td><td class="evs">${t[2].map((e) => `${e[0].split(' · ')[0]} (${e[1]})`).join(', ')}</td><td class="end">${other()}</td></tr>`;

  const V = {
    a: {
      title: 'A · One list',
      sub: 'One list sorted by rank: teams at this event carry a small rank badge (medal on the top 3) and a Team › button; teams from other events carry a dashed “Other event” button that opens an event picker.',
      desk: () => desk(`<div class="ts-dpad"><div class="ts-dhd"><div><h1>Search teams</h1><p>2026 season · 64 teams · ranks from ${EV}</p></div></div><div class="ts-dbar">${search('')}${chips()}</div>${tbl(inEv.map((t) => trIn(t)).join('') + offEv.map((t) => trOff(t)).join(''))}</div>`),
      p1: () => P(`<div class="ts-pad">${head()}${search('')}${chips()}<div class="ts-list">${inEv.slice(0, 6).map((t) => rowIn(t)).join('')}${rowOff(offEv[0])}</div></div>`),
      p2: () => P(`<div class="ts-pad">${head()}${search('')}${chips('Other events')}<div class="ts-list">${offEv.map((t) => rowOff(t)).join('')}</div></div>${evPick()}`, { time: '12:21' }),
      c1: 'Phone · all teams', c2: 'Phone · Other event → pick where',
    },
    b: {
      title: 'B · Two groups',
      sub: `Results split into “At ${EV.split(' · ')[0]}” (ranked) and “Other 2026 teams”, filtering as you type with the match highlighted. Rows add the team’s average points ${NEW}. Switching asks first.`,
      desk: () => desk(`<div class="ts-dpad"><div class="ts-dhd"><div><h1>Search teams</h1><p>2026 season · 64 teams · ranks from ${EV}</p></div></div><div class="ts-dbar">${search('')}</div>
        <div class="ts-lab">At District #3 · 42</div>${tbl(inEv.slice(0, 5).map((t) => trIn(t, { avg: 1 })).join(''), { avg: 1 })}<div class="ts-lab">Other 2026 teams · 22</div>${tbl(offEv.map((t) => trOff(t, { avg: 1 })).join(''), { avg: 1 })}</div>${confirmDlg()}`),
      p1: () => P(`<div class="ts-pad">${search('15', { focus: 1 })}<div class="ts-list"><div class="ts-gh">At District #3<span class="r">2</span></div>${rowIn(inEv[0], { q: '15', avg: 1, icon: 1 })}${rowIn([1577, 'Steampunk', 9, 31.4, 10], { q: '15', avg: 1, icon: 1 })}<div class="ts-gh">Other 2026 teams<span class="r">1</span></div>${rowOff(offEv[1], { q: '15' })}</div></div>`),
      p2: () => P(`<div class="ts-pad">${search('30', { focus: 1 })}<div class="ts-list"><div class="ts-gh">At District #3<span class="r">1</span></div>${rowIn(inEv[5], { q: '30', avg: 1, icon: 1 })}<div class="ts-gh">Other 2026 teams<span class="r">2</span></div>${rowOff(offEv[0], { q: '30' })}${rowOff(offEv[2], { q: '30' })}</div></div>${confirmSheet()}`, { time: '12:22' }),
      c1: 'Phone · typing “15”', c2: 'Phone · the are-you-sure step',
    },
    c: {
      title: 'C · Team cards',
      sub: 'A grid of team cards: number large, rank badge in the corner, “Team page ›” or, dashed, “Other event ⇄”. Offline the dashed cards grey out with one note why.',
      desk: () => desk(`<div class="ts-dpad"><div class="ts-dhd"><div><h1>Search teams</h1><p>2026 season · 64 teams · ranks from ${EV}</p></div></div><div class="ts-dbar">${search('')}${chips()}</div><div class="ts-grid d4">${[...inEv.slice(0, 6), ...offEv.slice(0, 2)].map((t) => card(t)).join('')}</div></div>`),
      p1: () => P(`<div class="ts-pad">${head()}${search('')}${chips()}<div class="ts-grid">${[...inEv.slice(0, 5), offEv[0]].map((t) => card(t)).join('')}</div></div>`),
      p2: () => P(`<div class="ts-pad">${search('')}${chips('Other events')}<div class="ts-offnote">${I.off}<span><b>Offline.</b> Other events need a connection; teams at ${EV.split(' · ')[0]} still open.</span></div><div class="ts-grid">${offEv.map((t) => card(t, true)).join('')}</div></div>`, { time: '12:23', offline: 1 }),
      c1: 'Phone · cards', c2: 'Phone · offline: other events greyed',
    },
    d: {
      title: 'D · Search first',
      sub: `Before typing: the top three ${NEW}, your recent teams ${NEW} and our team; typing replaces them with results. Otherwise A's rows and buttons.`,
      desk: () => desk(`<div class="ts-dpad"><div class="ts-dhd"><div><h1>Search teams</h1><p>2026 season · 64 teams · ranks from ${EV}</p></div></div><div class="ts-dbar">${search('')}</div>
        <div class="tp-cols" style="grid-template-columns:380px 1fr;gap:20px"><div style="display:flex;flex-direction:column;gap:10px"><div class="ts-lab">Top of District #3 ${NEW}</div>${pod()}<div class="ts-lab" style="margin-top:6px">Recent ${NEW}</div>${recent()}</div>
        <div>${tbl(inEv.map((t) => trIn(t)).join('') + offEv.slice(0, 1).map((t) => trOff(t)).join(''))}</div></div></div>`),
      p1: () => P(`<div class="ts-pad">${head()}${search('')}<div class="ts-lab">Top of District #3</div>${pod()}<div class="ts-lab">Recent</div>${recent()}<div class="ts-list">${rowIn(inEv[2])}</div></div>`),
      p2: () => P(`<div class="ts-pad">${search('orb', { focus: 1 })}<div class="ts-list">${rowIn(inEv[3], { q: 'orb' })}${rowOff([6740, 'Orbitrons', [['District #1 · Haifa', 2, 'Mar 2026']]], { q: 'orb' })}</div><div class="ts-sub" style="text-align:center">2 of 64 teams</div></div>`, { time: '12:24' }),
      c1: 'Phone · before typing', c2: 'Phone · typing “orb”',
    },
  };

  // A2 (user 2026-10-23): A without the Other events column, "At this event" by default, and the whole row opens the team page.
  const open = `<span class="ts-open" aria-hidden="true">${I.chev}</span>`;
  const rowLink = (t, o = {}) => `<div class="ts-row link ${t[5] === 'us' ? 'us' : ''} ${o.press ? 'press' : ''}" role="link" aria-label="${t[0]} ${t[1]}, team page"><span class="tn">${hi(t[0], o.q)}</span><span class="nm"><b>${hi(t[1], o.q)}${t[5] === 'us' ? ' <span style="font-weight:500;color:var(--accent-ink);font-size:12px">· us</span>' : ''}</b><small>${t[4] ? `${t[4]} entries here` : 'no entries yet'}</small></span>${rank(t[2])}${open}</div>`;
  const more = (n, q) => `<div class="ts-more">${q ? `<span><span class="num">${n}</span> more ${n === 1 ? 'team matches' : 'teams match'} at other events</span>` : `<span><span class="num">${n}</span> more 2026 teams at other events</span>`}<b>Show all ›</b></div>`;
  const trLink = (t, o = {}) => `<tr class="lnk ${t[5] === 'us' ? 'us' : ''} ${o.hov ? 'hov' : ''}"><td><span class="tn">${t[0]}</span><span class="nm2">${t[1]}</span></td><td>${rank(t[2])}</td><td class="n">${t[4]}</td><td class="end"><span class="tgo"><span class="lb">Team page</span>${I.chev}</span></td></tr>`;
  const trOff2 = (t) => `<tr class="off"><td><span class="tn">${t[0]}</span><span class="nm2">${t[1]}</span></td><td><span class="ts-rank none">not at this event</span></td><td class="n tp-dash">—</td><td class="end">${other()}</td></tr>`;
  const tbl2 = (rows) => `<div class="tp-tbl ts-tbl"><table><thead><tr><th>Team</th><th>Rank here</th><th class="r">Entries here</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  V.a2 = {
    title: 'A2 · Rows open the team',
    sub: 'A, with “At this event” as the default chip and no Other events column. The whole row opens the team page: a round green › at the end, the row tinted while pressed or hovered. Teams from other events keep the dashed “Other event” button; a line at the end offers them.',
    desk: () => desk(`<div class="ts-dpad"><div class="ts-dhd"><div><h1>Search teams</h1><p>2026 season · 64 teams · ranks from ${EV}</p></div></div><div class="ts-dbar">${search('')}${chips('At this event')}</div>${tbl2(inEv.map((t, i) => trLink(t, { hov: i === 3 })).join(''))}<div class="ts-more" style="border:1px solid var(--line);border-radius:12px;margin-top:-4px">${'<span><span class="num">22</span> more 2026 teams at other events</span><b>Show all ›</b>'}</div></div>`),
    p1: () => P(`<div class="ts-pad">${head()}${search('')}${chips('At this event')}<div class="ts-list">${inEv.slice(0, 7).map((t, i) => rowLink(t, { press: i === 3 })).join('')}</div></div>`),
    p2: () => P(`<div class="ts-pad">${search('30', { focus: 1 })}${chips('At this event')}<div class="ts-list">${rowLink(inEv[5], { q: '30' })}${more(2, 1)}</div><div class="ts-lab" style="margin-top:6px">After “Show all”</div><div class="ts-list">${rowLink(inEv[5], { q: '30' })}${rowOff(offEv[0], { q: '30' })}${rowOff(offEv[2], { q: '30' })}</div></div>`, { time: '12:25' }),
    c1: 'Phone · default: this event, Orbit pressed', c2: 'Phone · typing “30”: other events offered, then shown',
  };
  function card(t, dis) {
    const off = Array.isArray(t[2]);
    if (off) return `<div class="ts-card off" ${dis ? 'style="opacity:.5"' : ''}><span class="tn">${t[0]}</span><span class="nm">${t[1]}</span><small>${t[2].map((e) => e[0].split(' · ')[0]).join(', ')}</small><span class="ft">${I.swap}Other event</span></div>`;
    return `<div class="ts-card" ${t[5] === 'us' ? 'style="background:var(--accent-tint)"' : ''}>${rank(t[2])}<span class="tn">${t[0]}</span><span class="nm">${t[1]}</span><small>${t[4] ? `${t[4]} entries here` : 'no entries yet'}</small><span class="ft">Team page ${I.chev}</span></div>`;
  }
  function pod() {
    const c = (t, cls = '') => `<div class="${cls}">${rank(t[2])}<span class="tn">${t[0]}</span><small>${t[1]}</small></div>`;
    return `<div class="ts-pod">${c(inEv[1])}${c(inEv[0], 'st1')}${c(inEv[2])}</div>`;
  }
  function recent() {
    return `<div class="ts-recent">${[[1690, 'Orbit'], [3065, 'Jatt'], [5951, 'MA'], [4590, 'GreenBlitz']].map(([n, m]) => `<span>${I.clock}<span class="num">${n}</span>${m}</span>`).join('')}</div>`;
  }
  const render = (k) => {
    const v = V[k];
    document.getElementById('root').innerHTML = `<div class="canvas"><div class="canvas-head"><b>Team search — ${v.title}</b><span>${v.sub}</span></div>
      <div class="frames">${fig(v.desk(), 'Desktop')}${fig(v.p1(), v.c1)}${fig(v.p2(), v.c2)}</div></div>`;
  };
  return { render, V, rowLink, trLink, trOff2, tbl2, more, rowIn, rowOff, search, chips, head, evPick, confirmSheet, confirmDlg, P, desk, tbl, trIn, trOff, inEv, offEv, rank, I, EV, card, pod, recent };
})();
