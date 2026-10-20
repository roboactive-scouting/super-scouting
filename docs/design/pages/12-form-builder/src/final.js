// The closed form-builder page (variant D): every final image is built here.
// A final .html sets window.FINAL = true, loads builder.js, complex.js, phones.js and this file,
// then calls FINALS.desk(name) or FINALS.phones(name). Colours come only from theme.css.
window.FINALS = (() => {
  const { svg } = FB;
  const SPOTS = [[0.2, 0.3], [0.27, 0.66], [0.36, 0.44]];
  const P1 = [[0.95, 0.08], [0.72, 0.22], [0.48, 0.34], [0.33, 0.44]];
  const P2 = [[0.94, 0.1], [0.66, 0.42], [0.42, 0.62], [0.32, 0.58]];
  const P3 = [[0.95, 0.06], [0.76, 0.14], [0.57, 0.27]];
  const B = (pts) => pts.map(([a, b]) => [+(1 - a).toFixed(2), +(1 - b).toFixed(2)]);
  const pts = (tag) => `<span class="fb-cond-tag" style="font-family:var(--font-num)">${tag} pts</span>`;
  const body = (canvas, settings) => `<div class="fb-body" style="grid-template-columns:240px 1fr 410px">${FB.palette('list')}${canvas}${settings}</div>`;

  /* ---------- canvases ---------- */
  const shotsEdit = FC.li('tele_shots', FC.shots({ where: true }));
  const routesBtn = (o = {}) => `<div class="fb-pvf"><b>Cycle routes</b><small>The route of each cycle</small>${FP.mapBtn({ thumb: { paths: [{ pts: P1 }, { pts: P2 }] }, title: o.try ? '2 paths' : 'Cycle path', sub: o.try ? `${o.click ? 'Click' : 'Tap'} to open the map` : 'Opens the map; up to 6 points per path' })}</div>`;
  const spotsBtn = (o = {}) => `<div class="fb-pvf"><b>Scoring spots</b><small>Where it scored from</small>${FP.mapBtn({ thumb: { pts: SPOTS.map(([a, b]) => [a, b, 'pr']) }, title: o.try ? '3 spots' : 'Field position · a list', sub: o.try ? 'Click to open the map' : 'Opens the map; one dot per spot' })}</div>`;
  const startBtn = `<div class="fb-pvf"><b>Start position</b><small>Where the robot started</small>${FP.mapBtn({ empty: true, title: 'Mark on the map', sub: 'Not marked yet' })}</div>`;

  const teleop = (o = {}) => FC.canvas({ phase: 'Teleop', inc: o.inc ? 'Teleop' : null, items:
    FC.li('tele_high', FC.ctr('Pieces scored high', 'Upper goal'), { extra: pts('4/ea') }) +
    (o.dropped ? FC.li('tele_pieces_dropped', FC.ctr('Pieces dropped', '<span style="color:var(--muted)">No help text yet</span>'), { cls: 'pick inc', extra: `<span class="fb-inc">${svg('warn')}Needs meaning<span class="sr"> incomplete</span></span>` }) : '') +
    FC.li('tele_shots', FC.shots({ where: true }), { cls: o.sel === 'shots' ? 'pick' : '' }) +
    FC.li('tele_cycle_routes', routesBtn(), { cls: o.sel === 'routes' ? 'pick' : '' }) +
    FC.li('tele_defence', FC.toggle('Played defence')) });
  const auto = FC.canvas({ phase: 'Auto', title: 'Autonomous', items:
    FC.li('auto_leave', FC.toggle('Left the start zone')) +
    FC.li('auto_high', FC.ctr('Pieces scored high', 'Upper goal'), { extra: pts('6/ea') }) +
    FC.li('auto_score_spots', spotsBtn(), { cls: 'pick' }) +
    FC.li('auto_start', startBtn) });
  const endgame = FC.canvas({ phase: 'Endgame', items:
    FC.li('end_climb', `<div class="fb-pvf"><b>Climb level</b><small>Highest bar at the end of the match</small><div class="fb-pvopts"><span>None</span><span>Parked</span><span>Low bar</span><span>High bar</span></div></div>`, { cls: 'pick', extra: pts('0–12') }) +
    FC.li('end_climb_time', `<div class="fb-pvf"><b>Climb time</b><small>From starting the climb to hanging</small>${FC.timer('idle')}</div>`) });
  const autoTry = FC.canvas({ phase: 'Auto', title: 'Autonomous', try: true, items:
    FC.li('auto_high', FC.ctr('Pieces scored high', 'Upper goal', 3), { try: true }) +
    FC.li('auto_score_spots', spotsBtn({ try: true }), { try: true }) +
    FC.li('auto_start', startBtn, { try: true }) });
  const teleTry = FC.canvas({ phase: 'Teleop', try: true, items:
    FC.li('tele_shots', FC.shots({ where: true, n: ['3', '0', '1'], chips: FC.chips([['High', '0:18', 1], ['High', '0:41', 1], ['Missed', '0:57', 0]]) }), { try: true }) +
    FC.li('tele_cycle_routes', routesBtn({ try: true, click: true }), { try: true }) });

  /* ---------- the desktop map dialog ---------- */
  const dlg = (o) => `<div class="fb-dlgwrap"><div class="fb-dlg">
      <div class="fb-dlgh"><span class="t"><b>${o.title}</b><small>${o.sub}</small></span><span class="tag red" style="margin-left:auto">Red 1</span><span class="x" style="margin-left:4px">${svg('x')}</span></div>
      <div class="fb-dlgmap">${FC.field(o.map)}</div><div class="fb-dlghint">${o.hint}</div><div class="fb-dlgbar">${o.bar}</div></div></div>`;
  const spotsDlg = dlg({ title: 'Scoring spots', sub: 'Try it · Autonomous · your alliance\'s end on the left',
    map: { pts: [[0.2, 0.3, 'pr', 1], [0.27, 0.66, 'pr', 2], [0.36, 0.44, 'pr', 3]], sel: 1, pill: { at: [0.27, 0.66], text: 'Remove' } },
    hint: '<b>Click the map</b> to add a spot · <b>click a spot</b> to remove it · Delete removes the selected one',
    bar: `<span class="fb-tb">${FP.undo}Undo</span><span class="cnt"><b>3</b> spots</span><span class="btn primary">Done</span>` });
  const cycleDlg = dlg({ title: 'Cycle routes', sub: 'Try it · Teleop · your alliance\'s end on the left',
    map: { paths: [{ pts: P1, cls: 'lr f', dots: true }, { pts: P2, cls: 'lr f', dots: true }, { pts: P3, cls: 'lr draw', dots: true }] },
    hint: '<b>Click the map</b> to add the next point · <b>click a path</b> to remove it',
    bar: `<span class="fb-drawing"><i></i>Drawing path 3 <code style="margin-left:6px">3 of 6</code></span><span class="fb-tb">${FP.undo}Undo point</span><span class="fb-tb">${FP.erase}Clear path</span><span class="fb-tb">${svg('check')}Finish</span><span class="cnt"></span><span class="btn primary">Done</span>` });

  /* ---------- desktop views ---------- */
  const VIEWS = {
    event: () => [FC.head({ state: 'draft' }) + body(teleop({ sel: 'shots' }), FC.sEvent())],
    'new-field': () => [FC.head({ state: 'draft', blocked: true, added: 1 }) + body(teleop({ dropped: true, inc: true }), FB.settings('dropped'))],
    position: () => [FC.head({ state: 'draft' }) + body(auto, FC.sPosition())],
    cycle: () => [FC.head({ state: 'draft', menu: true }) + body(teleop({ sel: 'routes' }), FC.sCycle()), FC.menu('top:58px;right:150px')],
    locked: () => [FC.head({ state: 'locked' }) + FB.banner() + body(endgame, FB.settings('climb'))],
    try: () => [FC.head({ state: 'draft' }) + body(autoTry, FC.sTry()), '', spotsDlg],
    'try-cycle': () => [FC.head({ state: 'draft' }) + body(teleTry, FC.sTry()), '', cycleDlg],
  };
  const desk = (name) => {
    const [inner, menu = '', over = ''] = VIEWS[name]();
    document.getElementById('root').innerHTML = `<div class="desk final" style="position:relative"><div data-desk-shell="forms" data-crumb="Admin / Forms / <b>Match form 2026</b>"><div class="fb" style="position:relative">${inner}${menu}</div></div>${over}</div>`;
  };

  /* ---------- phones ---------- */
  const shell = (html, time) => `<div data-phone-shell data-time="${time}" data-title="Scout">${html}</div>`;
  const done = '<span class="btn primary">Done</span>';
  const red = { alliance: 'red', station: 'Red 1', match: 'Q39', team: '1690', name: 'Orbit' };
  const PHONES = {
    gate: [[shell(FB.gate(), '20:14').replace('data-title="Scout"', 'data-title="Forms"'), 'Below 1024 px: the locked desktop-only gate']],
    maps: [
      [shell(FC.phone({ ...red, clock: '0:09', clockNote: 'Auto · 6 s left', phase: 'Auto', body:
        `<div class="fb-paneh" style="padding-top:10px"><b>Autonomous</b><small>Phase 1 of 4</small><span class="fb-dots"><i class="on"></i><i></i><i></i><i></i></span></div>
         ${FC.ctr('Pieces scored high', 'Upper goal', 3)}
         <div class="fb-pvf"><b>Scoring spots</b><small>Where it scored from</small>${FP.mapBtn({ thumb: { pts: SPOTS.map(([a, b]) => [a, b, 'pr']) }, title: '3 spots', sub: 'Tap to open the map' })}</div>${startBtn}` }), '11:43'),
       '1 · Map fields are buttons in the form'],
      [FP.pop({ time: '11:43', title: 'Scoring spots', sub: 'Q39 · 1690 · Auto', map: { pts: SPOTS.map(([a, b], i) => [a, b, 'pr', i + 1]), sel: 1, pill: { at: SPOTS[1], text: 'Remove' } },
        hint: '<b>Tap the map</b> to add a spot · <b>tap a spot</b> to remove it',
        bar: `<div class="row"><span class="fb-tb">${FP.undo}Undo</span><span class="cnt"><b>3</b> spots</span></div>${done}` }),
       '2 · Full-screen map: tap to add; tap a spot → ✕ Remove'],
      [FP.pop({ time: '11:44', title: 'High goal · where?', sub: 'Shots · tap at 1:12 · optional', map: { pts: [[0.31, 0.62, 'old'], [0.27, 0.4, 'old'], [0.24, 0.55, 'pr']] },
        hint: 'Earlier shots are grey. <b>Tap again</b> to move this one.',
        bar: `<div class="row"><span class="fb-tb">Skip · no place</span><span class="cnt">time is saved either way</span></div><span class="btn primary">Save tap</span>` }),
       '3 · Event log with "where?": after the tap, optional'],
      [FP.pop({ time: '11:46', title: 'Cycle routes', sub: 'Q39 · 1690 · Teleop', map: { paths: [{ pts: P1, cls: 'f' }, { pts: P2, cls: 'f' }, { pts: P3, cls: 'draw' }] },
        hint: '<b>Tap the map</b> to add the next point · <b>tap a path</b> to remove it',
        bar: `<div class="fb-drawing"><i></i>Drawing path 3<code>3 of 6 points</code></div>
          <div class="row"><span class="fb-tb">${FP.undo}Undo</span><span class="fb-tb">${FP.erase}Clear path</span><span class="fb-tb" style="margin-left:auto">${svg('check')}Finish</span></div>${done}` }),
       '4 · Drawing a path; Clear path starts it again'],
      [FP.pop({ time: '11:52', title: 'Cycle routes', sub: 'Q40 · 3316 · Teleop', alliance: 'blue', station: 'Blue 2', map: { own: 'blue', paths: [{ pts: B(P1), cls: 'sel', sel: true }, { pts: B(P2), cls: 'f' }, { pts: B(P3), cls: 'f' }], pill: { at: B([[0.72, 0.22]])[0], text: 'Remove path', w: 44 } },
        hint: 'Path 1 selected · tap <b>Remove path</b>, or tap the map to keep it',
        bar: `<div class="row"><span class="fb-tb">${FP.plus}New path</span><span class="cnt"><b>3</b> paths</span></div>${done}` }),
       '5 · Blue scout: own end at the bottom; tap a path → ✕ Remove'],
    ],
  };
  const climb = (st, v, time, clock) => [shell(FC.phone({ ...red, clock, clockNote: 'Endgame', phase: 'Endgame', body:
      `<div class="fb-paneh" style="padding-top:10px"><b>Endgame</b><small>Phase 3 of 4</small><span class="fb-dots"><i></i><i></i><i class="on"></i><i></i></span></div>
       <div class="fb-pvf"><b>Climb level</b><small>Highest bar at the end of the match</small><div class="fb-pvopts"><span>None</span><span>Parked</span><span>Low bar</span><span class="on">High bar</span></div></div>
       <div class="fb-pvf"><b>Climb time</b><small>From starting the climb to hanging</small>${FC.timer(st, v)}</div>` }), time)];
  PHONES.timer = [
    [...climb('idle', '0.0', '11:58', '2:04'), '1 · Ready: one Start in the middle'],
    [...climb('run', '6.4', '11:58', '2:11'), '2 · Running: it splits into Pause and Clear'],
    [...climb('paused', '8.2', '11:58', '2:14'), '3 · Paused: Resume or Clear; ✎ corrects a late stop'],
    [...climb('unsure', '0.0', '11:59', '2:20'), '4 · Unsure: no time is saved'],
  ];
  const phones = (name, title, desc) => {
    const list = PHONES[name];
    document.getElementById('root').innerHTML = `<div class="canvas" style="height:940px">
      <div class="canvas-head"><b>${title}</b><span>${desc}</span></div>
      <div class="frames" style="gap:22px">${list.map(([html, cap]) => `<figure class="frame"><div class="phone" style="zoom:.86">${html}</div><figcaption>${cap}</figcaption></figure>`).join('')}</div></div>`;
  };
  // The builder behind a dialog: [inner, menu, overlay] for a named view.
  const view = (name) => VIEWS[name]();
  return { desk, phones, view };
})();
