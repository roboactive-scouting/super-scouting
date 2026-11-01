// Entry preview round (25): /entries/:id, read only (SPEC-FINAL 13.4). Loads after 24-team/src/team.js (TP).
window.EP = (() => {
  const { svg, phone, fig, NEW } = TP;
  const ic = (p, s = 15) => `<svg viewBox="0 0 24 24" style="width:${s}px;height:${s}px">${p}</svg>`;
  const I = {
    eye: ic('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 13),
    view: ic('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', 13),
    back: ic('<path d="M15 5l-7 7 7 7"/>', 18),
    prev: ic('<path d="M15 5l-7 7 7 7"/>', 16),
    next: ic('<path d="M9 5l7 7-7 7"/>', 16),
    team: ic('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"/>'),
    edit: ic('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  };

  // Q37 · 1690 Orbit · Blue 3 · played · 47 points, scouted by Omer Katz.
  // [label, value, points|null, type: n number · b yes/no · s select · l long text · m map]
  const PH = [
    ['Autonomous', 'Auto', 14, [['Left the start zone', 'Yes', 4, 'b'], ['High goal', 4, 8, 'n'], ['Low goal', 2, 2, 'n']]],
    ['Teleop', 'Teleop', 22, [['High goal', 9, 18, 'n'], ['Low goal', 4, 4, 'n'], ['Missed shots', 1, 0, 'n'], ['Played defense', 'No', 0, 'b'], ['Shooting spots', '6 spots', null, 'm']]],
    ['Endgame', 'Endgame', 11, [['Climb', 'Deep', 11, 's']]],
    ['Post-match', 'Notes', null, [['Driver skill', 'Good', null, 's'], ['Notes', 'Best match so far. Driver calm, lined up every shot; climbed Deep with 15 s left.', null, 'l'], ['הערות נוספות', 'נהג מעולה, לא נתקע אף פעם.', null, 'l']]],
  ];
  const st = { p: '<span class="st st-p">Played</span>', n: '<span class="st st-n">No show</span>', d: '<span class="st st-d">Disabled</span>' };
  const blue3 = '<span class="stn b">Blue 3</span>';

  // ---------- header ----------
  const head = (o = {}) => {
    const s = o.status || 'p';
    const pts = o.super ? '' : `<div class="pts"><b class="${s === 'p' ? '' : 'tp-dash'}">${s === 'p' ? 47 : '—'}</b><small>${s === 'p' ? 'scouted points' : 'not counted'}</small></div>`;
    return `<header class="ep-head ${o.dk ? 'dk' : ''}">
      ${o.dk ? '' : `<div class="row1"><span class="crumb2">${I.back}${o.from || 'Entries'}</span><span class="sp"></span><span class="ep-ro">${I.eye}Read only</span></div>`}
      <div style="display:flex;align-items:flex-end;gap:12px"><div style="min-width:0">
        <h1>${o.super ? '<span class="m">Whole event</span>' : `<span class="m">${o.match || 'Q37'}</span>`}<span class="num">${o.team || 1690}</span>${o.name || 'Orbit'}</h1>
        <div class="tags">${o.super ? '<span class="ep-kind super">SUPER</span>' : `${st[s]}${o.stn || blue3}<span class="ep-kind">Match entry</span>`}${o.dk ? `<span class="ep-ro">${I.eye}Read only</span>` : ''}</div>
      </div>${pts}</div>
      ${o.meta === false ? '' : `<div class="ep-meta"><span class="av">${o.ini || 'OK'}</span><span>Scouted by <b>${o.who || 'Omer Katz'}</b></span><span class="num">${o.when || '14/11/2026 16:05'}</span>${o.ver ? `<span>form v3 ${NEW}</span>` : ''}</div>`}
    </header>`;
  };

  // ---------- the answers ----------
  const val = (f) => (f[3] === 'n' ? `<span class="v num">${f[1]}</span>` : `<span class="v">${f[1]}</span>`);
  const row = (f, o = {}) => {
    if (f[3] === 'l') return `<div class="ep-row long"><span class="n">${f[0]}</span><span class="v" dir="auto">${f[1]}</span></div>`;
    if (f[3] === 'm') return `<div class="ep-row map"><span class="n">${f[0]}</span><span class="v"><b>${f[1]}</b><small>${I.view}Tap to view</small></span>${o.pts ? '<span class="pt z"></span>' : ''}</div>`;
    const pt = o.pts ? `<span class="pt ${f[2] ? '' : 'z'}">${f[2] == null ? '' : f[2] ? '+' + f[2] : '0'}</span>` : '';
    return `<div class="ep-row"><span class="n">${f[0]}</span>${val(f)}${pt}</div>`;
  };
  const sum = (o = {}) => `<div class="ep-sum">${PH.filter((p) => !o.only || o.only.includes(p[0]))
    .map((p) => `<div class="ep-ph"><h3>${p[0]}<span class="sp"></span>${o.pts && p[2] != null ? `<span class="sub">${p[2]} pts</span>` : ''}</h3>${p[3].map((f) => row(f, o)).join('')}</div>`)
    .join('')}</div>`;
  const none = (s) => `<div class="ep-none"><b>${s === 'n' ? 'The robot did not show up.' : 'The robot was disabled for the match.'}</b>A ${s === 'n' ? 'no-show' : 'disabled'} entry records no field values, and the statistics leave it out — it is never counted as zero.</div>`;

  // ---------- facts ----------
  const facts = (cls = '') => `<div class="ep-facts ${cls}">
    <div><small>Team</small><b><span class="num">1690</span> Orbit</b></div><div><small>Match</small><b class="num">Q37</b> <span class="tp-empty-cap">qualification</span></div>
    <div><small>Alliance</small><b>${blue3}</b></div><div><small>Robot</small><b>${st.p}</b></div>
    <div><small>Scouter</small><b>Omer Katz</b></div><div><small>Saved</small><b class="num" style="font-size:13px">14/11/2026 16:05</b></div>
    <div><small>Form</small><b>Match entry</b></div><div><small>Scouted points</small><b class="num">47</b></div></div>`;

  // ---------- score band ----------
  const band = () => {
    const parts = [['Auto', 14, 'var(--accent-ink)'], ['Teleop', 22, 'var(--accent)'], ['Endgame', 11, 'color-mix(in srgb, var(--accent) 45%, var(--surface))']];
    return `<div class="ep-band"><div class="ep-bt"><span>Where the 47 points came from</span>${NEW}<span class="sp"></span><span class="num">avg 38.4</span></div>
      <div class="bar">${parts.map((p) => `<i style="flex:${p[1]};background:${p[2]}"></i>`).join('')}</div>
      <div class="lg">${parts.map((p) => `<span><i style="background:${p[2]}"></i>${p[0]} <b>${p[1]}</b></span>`).join('')}</div></div>`;
  };

  // ---------- read-only field cards (C) ----------
  const card = (f) => {
    if (f[3] === 'n') return `<div class="ep-fc"><span class="n">${f[0]}${f[2] != null ? `<small>+${f[2]} pts</small>` : ''}</span><span class="big">${f[1]}</span></div>`;
    if (f[3] === 'l') return `<div class="ep-fc long"><span class="n">${f[0]}</span><p dir="auto">${f[1]}</p></div>`;
    if (f[3] === 'm') return `<div class="ep-fc"><span class="n">${f[0]}<small style="color:var(--accent-ink);font-weight:650">Tap to view the map</small></span><span class="big" style="font-size:15px;font-family:var(--font-ui)">${f[1]}</span></div>`;
    return `<div class="ep-fc"><span class="n">${f[0]}${f[2] ? `<small>+${f[2]} pts</small>` : ''}</span><span class="pill ${f[1] === 'No' ? 'off' : ''}">${f[1]}</span></div>`;
  };
  const tabsC = (on) => TP.tabs(PH.map((p) => [p[1], p[2] != null ? p[2] : null]), on);

  // ---------- this match (D) ----------
  const mates = () => `<div class="ep-mates"><div class="t">Q37 · the other robots ${NEW}<span class="sp"></span><span>5 of 6 scouted</span></div><div class="g">
    <div class="c r">Red 1<span class="p">31</span><b>5951</b></div><div class="c r">Red 2<span class="p">44</span><b>1574</b></div><div class="c r miss">Red 3<b>3075</b>not scouted</div>
    <div class="c b">Blue 1<span class="p">22</span><b>4590</b></div><div class="c b">Blue 2<span class="p">39</span><b>1937</b></div><div class="c b me">Blue 3<span class="p">47</span><b>1690</b></div></div></div>`;
  const pager = () => `<div class="ep-pager"><span class="pb">${I.prev}<span>1690 · <span class="num">Q31</span></span></span><span class="pb r"><span>1690 · <span class="num">Q44</span></span>${I.next}</span></div>`;
  const acts = () => `<div class="ep-act"><span class="btn">${I.team}Team page</span><span class="btn">${I.edit}Edit${NEW}</span></div>`;

  // ---------- frames ----------
  const P = (inner, o = {}) => phone(inner, { title: o.title || 'Q37 · 1690', time: o.time });
  const desk = (inner) => `<div class="desk"><div data-desk-shell="entries" data-crumb="Entries / <b>Q37 · 1690 Orbit</b>"><div class="tp-desk">${inner}</div></div></div>`;
  const fixDesk = () => document.querySelectorAll('.side .navg').forEach((g) => {
    const scout = [...g.querySelectorAll('a')].find((x) => x.textContent.trim() === 'Scout');
    if (scout) scout.insertAdjacentHTML('afterend', `<a>${svg('search')}Search</a>`);
  });

  const V = {
    a: {
      title: 'A · Receipt',
      sub: 'The entry as a quiet receipt: a header with the match, team, status, alliance, kind and the points; who and when; then every answer by phase, as the confirmation draws it. A no-show has a note and no rows.',
      desk: () => desk(`${head({ dk: true })}<div class="ep-dbody"><div class="tp-cols" style="grid-template-columns:340px 1fr">${facts()}<div style="columns:2;column-gap:14px">${PH.map((p) => `<div style="break-inside:avoid;margin-bottom:14px">${sum({ only: [p[0]] })}</div>`).join('')}</div></div></div>`),
      p1: () => P(`${head()}<div class="ep-pad">${sum()}</div>`),
      p2: () => P(`${head({ status: 'n', match: 'Q26', who: 'Yael Shapira', ini: 'YS', when: '14/11/2026 13:20' })}<div class="ep-pad">${none('n')}</div>`, { title: 'Q26 · 1690', time: '12:10' }),
      c1: 'Phone · played', c2: 'Phone · a no-show: no rows, never zeros',
    },
    b: {
      title: 'B · Score breakdown',
      sub: `A band shows where the points came from ${NEW}; each phase carries its subtotal and each scored row its points ${NEW}. A super entry has no score, so no band.`,
      desk: () => desk(`${head({ dk: true, ver: true })}<div class="ep-dbody"><div class="tp-cols" style="grid-template-columns:1fr 1fr">${band()}<div></div>${sum({ pts: true, only: ['Autonomous', 'Teleop', 'Endgame'] })}${sum({ only: ['Post-match'] })}</div></div>`),
      p1: () => P(`${head()}<div class="ep-pad">${band()}${sum({ pts: true })}</div>`),
      p2: () => P(`${head({ super: true, who: 'Dana Mor', ini: 'DM', when: '14/11/2026 11:12' })}<div class="ep-pad"><div class="ep-sum"><div class="ep-ph"><h3>Auto</h3><div class="ep-row"><span class="n">Auto reliability</span><span class="v">Good</span></div><div class="ep-row map"><span class="n">Start position</span><span class="v"><b>1 spot</b><small>${I.view}Tap to view</small></span></div></div><div class="ep-ph"><h3>Teleop</h3><div class="ep-row"><span class="n">Driver skill</span><span class="v">Good</span></div><div class="ep-row"><span class="n">Defence</span><span class="v">Some</span></div><div class="ep-row"><span class="n">Penalties seen</span><span class="v">Pinning</span></div></div><div class="ep-ph"><h3>Notes</h3><div class="ep-row long"><span class="n">Strengths</span><span class="v">Fast cycles on the near side; quick to recover after contact</span></div></div></div></div>`, { title: 'Super · 1690', time: '12:11' }),
      c1: 'Phone · match entry', c2: 'Phone · a super entry (no score)',
    },
    c: {
      title: 'C · Phase tabs',
      sub: 'Read like the Entry page: the same phase tabs (with their points), each answer drawn as a read-only card with the value large. On a computer all four phases sit side by side.',
      desk: () => desk(`${head({ dk: true })}<div class="ep-dbody"><div class="ep-cols">${PH.map((p) => `<div><div class="ep-colh">${p[0]}${p[2] != null ? `<span class="num">${p[2]} pts</span>` : ''}</div><div style="display:flex;flex-direction:column;gap:8px">${p[3].map(card).join('')}</div></div>`).join('')}</div></div>`),
      p1: () => P(`${head()}${tabsC('Teleop')}<div class="ep-pad">${PH[1][3].map(card).join('')}</div>`),
      p2: () => P(`${head({ status: 'd', match: 'Q50', who: 'Dana Mor', ini: 'DM', when: '15/11/2026 10:31', stn: '<span class="stn b">Blue 2</span>' })}<div class="ep-pad">${none('d')}</div>`, { title: 'Q50 · 1690', time: '12:12' }),
      c1: 'Phone · Teleop tab', c2: 'Phone · disabled: no tabs, no rows',
    },
    d: {
      title: 'D · In context',
      sub: `The receipt plus where it sits: step to the team's previous or next entry ${NEW}, the other five robots of the match ${NEW}, and Team page / Edit entry ${NEW} (shown only to who may edit).`,
      desk: () => desk(`${head({ dk: true })}<div class="ep-dbody"><div class="tp-cols" style="grid-template-columns:1fr 360px"><div>${sum()}</div><div style="display:flex;flex-direction:column;gap:12px">${pager()}${facts()}${mates()}${acts()}</div></div></div>`),
      p1: () => P(`${head()}<div class="ep-pad">${pager()}${sum({ only: ['Autonomous', 'Teleop'] })}</div>`),
      p2: () => P(`${head({ meta: false })}<div class="ep-pad" style="padding-top:10px">${sum({ only: ['Post-match'] })}${mates()}${acts()}</div>`, { time: '12:13' }),
      c1: 'Phone · top, with the pager', c2: 'Phone · scrolled to the end',
    },
  };
  const render = (k) => {
    const v = V[k];
    document.getElementById('root').innerHTML = `<div class="canvas"><div class="canvas-head"><b>Entry preview — ${v.title}</b><span>${v.sub}</span></div>
      <div class="frames">${fig(v.desk(), 'Desktop')}${fig(v.p1(), v.c1)}${fig(v.p2(), v.c2)}</div></div>`;
  };
  return { render, fixDesk, V, head, sum, none, facts, band, card, mates, pager, acts, P, desk, PH };
})();
