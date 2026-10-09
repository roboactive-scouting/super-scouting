// Super scouting round: data, the super form screen, pickers and the page composer.
// Loads after 01-entry/src/entry.js, 14-entry-parts/src/parts.js (PX) and 02-scout/src/e-common.js (S).
window.SU = (() => {
  const P = PX;
  const ic = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
  const I = {
    search: ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    check: ic('<path d="M5 12l5 5 9-10"/>'),
    edit: ic('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
    l: ic('<path d="M15 6l-6 6 6 6"/>'),
    r: ic('<path d="M9 6l6 6-6 6"/>'),
    eye: ic('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    list: ic('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
  };
  const NEW = window.FINAL ? '' : '<span class="new">NEW</span>';
  // [number, name, matches seen on this device, super-scouted at (or null)]
  const TEAMS = [
    ['1574', 'MisCar', 4, '11:02'], ['1657', 'Hamosad', 3, null], ['1690', 'Orbit', 4, null], ['1937', 'Elysium', 3, '10:40'],
    ['2096', 'RoboActive', 4, null], ['2231', 'OnyxTronix', 3, null], ['2630', 'Thunderbolts', 2, null], ['3065', 'Jatt', 3, '09:58'],
    ['3075', 'Ha-Dream', 4, '11:20'], ['3316', 'D-Bug', 3, null], ['3339', 'BumbleB', 2, null], ['4320', 'Joker', 3, null],
    ['4590', 'GreenBlitz', 4, '10:15'], ['5135', 'Black Unicorns', 0, null], ['5654', 'Phoenix', 3, null], ['5928', 'MetalBoost', 2, null],
    ['6230', 'Team Koi', 3, null], ['6738', 'Excalibur', 4, '10:52'], ['7039', 'Ultimate', 3, null], ['7845', 'Ravens', 1, null],
  ];
  const done = TEAMS.filter((t) => t[3]).length;
  const EVENT = 'Israel District #1';

  /* the super form screen (no match, no alliance, no robot status, no timer) */
  const head = (o = {}) => `<div class="su-head"><div class="row"><span class="back">‹ Super scouting</span><span class="su-tag">SUPER</span></div>
      <h1><span class="num">${o.n || '1690'}</span> ${o.name || 'Orbit'}</h1>
      <div class="meta"><span class="dot"></span>${EVENT} · the whole event · ${o.meta || 'draft saved 11:43'}</div>
      ${o.edit ? `<div class="su-edit">${I.edit}Editing your entry from 11:20 — your changes update it</div>` : ''}
      <div class="su-seen">Seen here in${NEW} <code>Q12</code><code>Q19</code><code>Q27</code><code>Q33</code></div></div>`;
  const tabs3 = (cur) => `<div class="ptabs" style="grid-template-columns:repeat(3,1fr)">${['Auto', 'Teleop', 'Notes'].map((t, i) => `<span class="${i === cur ? 'on' : ''}">${t}</span>`).join('')}</div>`;
  const phead3 = (name, n) => `<div class="phead"><b>${name}</b><span class="pos">Phase ${n} of 3</span><span class="dots">${[1, 2, 3].map((k) => `<i class="${k === n ? 'on' : k < n ? 'done' : ''}"></i>`).join('')}</span></div>`;
  const teleop = (o = {}) => P.stars('Driver skill', o.edit ? 4 : 0, { hint: 'Across every match you watched' }) +
    P.select('Defence', ['None', 'Some', 'Lots'], o.edit ? 'Some' : null) +
    P.multi('Penalties seen', ['Pinning', 'Contact', 'Over limit'], o.edit ? ['Pinning'] : []);
  const formBody = (o = {}) => head(o) + tabs3(1) + `<div class="pane">${phead3('Teleop', 2)}${teleop(o)}</div>`;
  const form = (o = {}) => P.screen({ title: 'Super scouting', time: o.time || '11:43', body: formBody(o), top: o.top || '' });

  /* pickers */
  const search = (q) => `<div class="su-search">${I.search}${q || 'Find a team: number or name'}</div>`;
  const chips = (on) => `<div class="su-chips">${[['To do', TEAMS.length - done], ['Done', done], ['All', TEAMS.length]].map(([t, c]) => `<span class="su-chip ${t === on ? 'on' : ''}">${t} <code>${c}</code></span>`).join('')}</div>`;
  const prog = () => `<div class="su-prog"><div class="t"><span>Super-scouted on this device</span><b>${done} of ${TEAMS.length}</b></div><div class="bar"><i style="width:${(done / TEAMS.length) * 100}%"></i></div></div>`;
  const st = (t) => (t[3] ? `<span class="su-st done">${I.check}Done ${t[3]}</span>` : '<span class="su-st todo">To do</span>');
  const li = (t) => `<div class="su-li ${t[3] ? 'done' : ''}"><span class="n">${t[0]}</span><span class="t"><b>${t[1]}</b><small>${t[2] ? `seen in ${t[2]} match${t[2] > 1 ? 'es' : ''} here` : 'not seen yet'}</small></span><span class="r">${st(t)}</span></div>`;
  const title = (sub) => `<div><div class="su-h1">Super scouting</div><div class="su-sub">${sub || `${EVENT} · one entry per team for the whole event`}</div></div>`;

  const pickA = (o = {}) => {
    const list = o.filter === 'Done' ? TEAMS.filter((t) => t[3]) : TEAMS.filter((t) => !t[3]).sort((a, b) => b[2] - a[2]);
    return `<div class="su-pad">${title()}${o.prog === false ? '' : prog()}${search(o.q)}${chips(o.filter || 'To do')}<div class="su-list">${list.slice(0, o.n || 7).map(li).join('')}</div></div>`;
  };
  const tile = (t) => `<div class="su-tile ${t[3] ? 'done' : ''} ${t[2] === 0 ? 'zero' : ''}"><b>${t[0]}</b><small>${t[1]}</small></div>`;
  const pickB = (o = {}) => `<div class="su-pad">${title()}${prog()}<div class="su-grid">${TEAMS.slice(0, o.n || 20).map(tile).join('')}</div>
      <div class="su-legend"><span><i></i>To do</span><span><i class="d"></i>Done here</span><span><i class="z"></i>Not seen in a match yet</span></div></div>`;
  const pickC = (o = {}) => `<div class="su-pad">${title()}
      <div class="su-mline">Watching<span class="mn"><span>Q</span>41</span><span style="color:var(--muted);font-size:12px">${o.noLine ? 'no line-up on this device' : 'next after your last Scout match'}</span><span class="link">Change</span></div>
      ${o.noLine ? `<div class="note" style="font-size:13px">Q41 has no robots listed on this device. Pick from the event’s teams below.</div>` : `<div class="cols">${lineupSuper()}</div>`}
      <div class="su-lsec">All teams</div>${search()}<div class="su-list">${TEAMS.filter((t) => !t[3]).slice(0, o.n || 2).map(li).join('')}</div></div>`;
  const lineupSuper = () => {
    const sides = { red: [['1690', 'Orbit', 0], ['3075', 'Ha-Dream', 1], ['6230', 'Team Koi', 0]], blue: [['2231', 'OnyxTronix', 0], ['5654', 'Phoenix', 0], ['4590', 'GreenBlitz', 1]] };
    return Object.entries(sides).map(([side, rows]) => `<div class="stack"><div class="ch" style="color:var(--alliance-${side})">${side === 'red' ? 'Red' : 'Blue'}</div>${rows.map(([n, nm, d], i) =>
      `<div class="station ${side === 'red' ? 'r' : 'b'} ${d ? 'done' : ''}"><small>${side.toUpperCase()} ${i + 1}</small><span class="tn">${n}</span><span class="nm">${d ? 'Super done' : nm}</span>${d ? '<span class="su-done">✓</span>' : ''}</div>`).join('')}</div>`).join('');
  };
  const switcher = (o = {}) => `<div class="su-sw"><span class="ar">${I.l}</span><span class="mid"><b><span class="num">1690</span> Orbit</b><small><b>To do</b> · 3 of ${TEAMS.length - done} left to do · ${done} done</small></span><span class="ar">${I.r}</span><span class="ar">${I.list}</span></div>`;

  /* Scout link (where /super is reached from) */
  const link = `<div class="su-link"><span class="ic">${I.eye}</span><span class="t"><b>Super scouting</b><small>One entry per team for the whole event</small></span><span style="margin-left:auto;color:var(--muted)">›</span></div>`;

  /* composer: three phones on top, desktop + notes below */
  const tall = (o) => {
    const fig = (inner, cap) => `<figure class="frame"><div class="phone">${inner}</div><figcaption>${cap}</figcaption></figure>`;
    document.getElementById('root').innerHTML = `<div class="canvas tall">
      <div class="canvas-head"><b>${o.title}</b><span>${o.desc}</span></div>
      <div class="su-row">${o.phones.map(([h, c]) => fig(h, c)).join('')}${o.card}</div>
      <div class="su-row2"><figure class="frame"><div class="desk"><div data-desk-shell="scout" data-crumb="Scout / <b>Super scouting</b>">${o.desk}</div></div><figcaption>${o.deskCap}</figcaption></figure></div>
    </div>`;
  };
  const card = (items, layout) => `<div class="su-card"><h4>New in this variant</h4><p>Not in the spec today. For each: now · not now, but wanted · not at all.</p><ol>${items.map((i) => `<li><span>${i}</span></li>`).join('')}</ol><div class="lay">${layout}</div></div>`;
  const deskForm = (o = {}) => `<div class="card">${head(o)}${tabs3(1)}<div class="pane">${phead3('Teleop', 2)}${teleop(o)}</div><div class="ebar"><a class="btn primary block">Review entry</a></div></div>`;
  // Final picker (A + C's watching tiles), chosen 2026-10-09.
  const pickFinal = (o = {}) => `<div class="su-pad">${title()}
      <div class="su-mline">Watching<span class="mn"><span>Q</span>41</span><span style="color:var(--muted);font-size:12px">next after your last Scout match</span><span class="link">Change</span></div>
      <div class="cols">${lineupSuper()}</div>
      ${prog()}${search(o.q)}${chips(o.filter || 'To do')}<div class="su-list">${(o.filter === 'Done' ? TEAMS.filter((t) => t[3]) : TEAMS.filter((t) => !t[3]).sort((a, b) => b[2] - a[2])).slice(0, o.n || 3).map(li).join('')}</div></div>`;
  const confirm = () => `<div class="px-scrim"></div><div class="px-sheet"><span class="grab"></span><h3>Submit the super entry?</h3>
      <p><b style="color:var(--ink)">1690 Orbit</b> · ${EVENT} · the whole event. No match is recorded.</p>
      <div class="px-probs">
        <div class="px-prob"><span class="t"><b>Auto</b><small>Auto reliability · Good</small></span></div>
        <div class="px-prob"><span class="t"><b>Teleop</b><small>Driver skill · Good · Defence · Some · Penalties · Pinning</small></span></div>
        <div class="px-prob"><span class="t"><b>Notes</b><small>Strengths · fast cycles on the near side</small></span></div>
      </div>
      <div style="display:flex;gap:8px"><a class="btn" style="flex:1">Keep editing</a><a class="btn primary" style="flex:1">Submit entry</a></div></div>`;
  return { pickFinal, confirm, P, I, NEW, TEAMS, form, formBody, pickA, pickB, pickC, switcher, link, tall, card, deskForm, head, search, chips, prog, li };
})();
