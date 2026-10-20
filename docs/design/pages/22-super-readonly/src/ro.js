// Page 22, another scouter's super entry, read only (/super, task 1.47 side task 2), final: variant B (a quiet
// read-only page saying whose entry it is) plus A's names on the picker's Done rows (closed 2026-10-20).
// Noa (a scouter) opens 1690 Orbit, whose super entry Dana Mor wrote. Loads after 01-entry/src/entry.js,
// 14-entry-parts/src/parts.js (PX) and 15-super/src/super.js (SU).
window.RO = (() => {
  const P = SU.P;
  const ic = (p) => `<svg class="rov" viewBox="0 0 24 24">${p}</svg>`;
  const I = {
    lock: ic('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    eye: ic('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    warn: ic('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/>'),
    view: ic('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
    check: ic('<path d="M5 12l5 5 9-10"/>'),
    x: ic('<path d="M6 6l12 12M18 6 6 18"/>'),
    search: ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  };
    const EVENT = 'Israel District #1';

  // The answers, by phase: [name, value, map?]
  const PH = [
    ['Auto', [['Auto reliability', 'Good'], ['Start position', '1 spot', 1]]],
    ['Teleop', [['Driver skill', 'Good'], ['Defence', 'Some'], ['Penalties seen', 'Pinning'], ['Scoring spots', '5 spots', 1]]],
    ['Notes', [['Strengths', 'Fast cycles on the near side; quick to recover after contact'], ['Weaknesses', 'Slow to climb; tips when pushed hard']]],
  ];
  const row = ([n, v, map]) => map
    ? `<div class="ro-row map"><span class="n">${n}</span><span class="v"><b>${v}</b><small>${I.view}Tap to view</small></span></div>`
    : `<div class="ro-row ${v.length > 24 ? 'long' : ''}"><span class="n">${n}</span><span class="v">${v}</span></div>`;
  const phase = ([t, rows]) => `<div class="ro-ph"><h3>${t}</h3>${rows.map(row).join('')}</div>`;
  const summary = (only) => `<div class="ro-sum">${(only ? PH.filter((p) => only.includes(p[0])) : PH).map(phase).join('')}</div>`;

  // The super form's header, with whose entry this is.
  const head = (o = {}) => `<div class="su-head"><div class="row"><span class="back">‹ Super scouting</span>${o.ro ? `<span class="ro-chip">${I.eye}Read only</span>` : ''}<span class="su-tag">SUPER</span></div>
      <h1><span class="num">1690</span> Orbit</h1>
      <div class="meta">${EVENT} · the whole event${o.by === false ? '' : ' · by Dana Mor, last changed 11:12'}</div>
      ${o.seen === false ? '' : '<div class="su-seen">Seen here in <code>Q12</code><code>Q19</code><code>Q27</code><code>Q33</code></div>'}</div>`;
  const author = `<div class="ro-author"><span class="av">DM</span><span class="t"><b>Dana Mor’s entry</b><small>Started 10:40 · last changed 11:12 · seen in 5 matches</small></span></div>
      <p class="ro-who">${I.lock}Only Dana, a lead or an admin can change it.</p>`;

  // Picker: a team another scouter has super-scouted.
  const li = (n, nm, seen, st) => `<div class="su-li ${st ? 'done' : ''}"><span class="n">${n}</span><span class="t"><b>${nm}</b><small>seen in ${seen} matches here</small></span><span class="r">${st || '<span class="su-st todo">To do</span>'}</span></div>`;
  const by = (who, t) => `<span class="su-st done">${I.check}${who} ${t}</span>`;
  const picker = (o = {}) => `<div class="su-pad"><div><div class="su-h1">Super scouting</div><div class="su-sub">${EVENT} · one entry per team for the whole event</div></div>
      ${SU.prog()}${SU.search()}${SU.chips('Done')}<div class="su-list">
      ${li('1574', 'MisCar', 4, by('You', '11:02'))}
      ${li('1690', 'Orbit', 4, by('Dana', '10:40')).replace('su-li done', 'su-li done ro-hl')}
      ${li('1937', 'Elysium', 3, by('You', '10:40'))}
      ${li('3065', 'Jatt', 3, by('Omer', '09:58'))}
      ${li('3075', 'Ha-Dream', 4, by('You', '11:20'))}
      ${li('4590', 'GreenBlitz', 4, by('Amit', '10:15'))}</div>
      </div>`;

  const screen = (body, o = {}) => P.screen({ title: 'Super scouting', time: o.time || '11:52', body, bar: false, over: o.over || '' });

  // The read-only page: a Read only chip, whose entry it is, then the answers.
  const B = {
    page: () => `${head({ ro: true, by: false })}<div class="ro-pad">${author}${summary()}</div>`,
    desk: () => `<div class="card ro-dcard">${head({ ro: true, by: false })}<div class="ro-pad">${author}${summary()}</div></div>`,
  };
  const deskPage = () => `<div data-desk-shell="scout" data-crumb="Scout / Super scouting / <b>1690 Orbit</b>"><div class="su-desk">${picker()}${B.desk()}</div></div>`;

  return { B, picker, screen, deskPage };
})();
